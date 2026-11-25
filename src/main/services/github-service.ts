import { net } from 'electron'
import { z } from 'zod'
import type { GithubApi } from '@shared/api'
import {
  githubTokenSchema,
  type GithubCommit,
  type GithubIssue,
  type GithubRepo,
  type GithubStatus
} from '@shared/domain/dev'
import type { ConfigStore } from '../core/config-store'
import type { SecretBox } from './secret-box'
import { UserError } from '../core/util'
import { log } from '../core/logger'

const API = 'https://api.github.com'
/** «owner/name» — goes into an API path sent with the user's token. */
const repoArg = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/)
  .optional()
const TTL = 3 * 60_000

interface GhRepo {
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  private: boolean
  fork: boolean
  html_url: string
  default_branch: string
  language: string | null
  stargazers_count: number
  open_issues_count: number
  pushed_at: string | null
}

interface GhIssue {
  id: number
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  pull_request?: unknown
  labels: { name: string; color: string }[]
  user: { login: string } | null
  comments: number
  created_at: string
  updated_at: string
  repository?: { full_name: string }
  repository_url: string
}

interface GhCommit {
  sha: string
  html_url: string
  commit: { message: string; author: { name: string; date: string } | null }
  author: { login: string } | null
}

/**
 * Read-only GitHub client. The fine-grained token is stored encrypted (OS keychain) in config.
 * Responses are cached for a few minutes to stay well inside the rate limit.
 */
export class GithubService {
  private cache = new Map<string, { at: number; data: unknown }>()
  private rateRemaining: number | null = null

  constructor(
    private readonly config: ConfigStore,
    private readonly secrets: SecretBox
  ) {}

  private token(): string | null {
    const enc = this.config.secret('github')
    return enc ? this.secrets.decrypt(enc) : null
  }

  setToken(token: string): void {
    this.config.setSecret('github', token ? this.secrets.encrypt(token) : null)
    this.cache.clear()
  }

  private async get<T>(path: string, force = false): Promise<T> {
    const token = this.token()
    if (!token)
      throw new UserError('GitHub не підключено: додайте токен у розділі Розробка → GitHub')
    const hit = this.cache.get(path)
    if (!force && hit && Date.now() - hit.at < TTL) return hit.data as T
    let res: Response
    try {
      res = await net.fetch(`${API}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'vault-desktop'
        }
      })
    } catch (e) {
      // Offline is an expected state, not a bug: a plain reason instead of «Щось пішло не так».
      log.warn('[github]', e)
      throw new UserError('Немає зв’язку з GitHub — перевірте інтернет')
    }
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining) this.rateRemaining = Number(remaining)
    if (res.status === 403 && remaining === '0')
      throw new UserError('Ліміт запитів GitHub вичерпано — спробуйте за годину')
    if (res.status === 401)
      throw new UserError('GitHub відхилив токен — створіть новий у Налаштуваннях')
    if (!res.ok) {
      // The English status text goes to the log; the person gets a reason in Ukrainian.
      log.warn('[github]', res.status, res.statusText, path)
      if (res.status === 404) {
        throw new UserError('GitHub не знайшов репозиторій — перевірте назву й доступ токена')
      }
      throw new UserError(`GitHub не відповів (код ${res.status}) — спробуйте пізніше`)
    }
    const data = (await res.json()) as T
    this.cache.set(path, { at: Date.now(), data })
    return data
  }

  async status(): Promise<GithubStatus> {
    if (!this.token())
      return {
        connected: false,
        login: null,
        name: null,
        avatarUrl: null,
        error: null,
        rateRemaining: null
      }
    try {
      const u = await this.get<{ login: string; name: string | null; avatar_url: string }>('/user')
      return {
        connected: true,
        login: u.login,
        name: u.name,
        avatarUrl: u.avatar_url,
        error: null,
        rateRemaining: this.rateRemaining
      }
    } catch (e) {
      return {
        connected: false,
        login: null,
        name: null,
        avatarUrl: null,
        error: (e as Error).message,
        rateRemaining: this.rateRemaining
      }
    }
  }

  async repos(localIndex: Map<string, string>, force = false): Promise<GithubRepo[]> {
    const list = await this.get<GhRepo[]>(
      '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member',
      force
    )
    return list.map((r) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      description: r.description,
      private: r.private,
      fork: r.fork,
      url: r.html_url,
      defaultBranch: r.default_branch,
      language: r.language,
      stars: r.stargazers_count,
      openIssues: r.open_issues_count,
      pushedAt: r.pushed_at ? Date.parse(r.pushed_at) : null,
      localProjectId: localIndex.get(r.full_name.toLowerCase()) ?? null
    }))
  }

  private toIssue(i: GhIssue): GithubIssue {
    return {
      id: i.id,
      number: i.number,
      title: i.title,
      url: i.html_url,
      repo: i.repository?.full_name ?? i.repository_url.replace(`${API}/repos/`, ''),
      state: i.state,
      isPullRequest: !!i.pull_request,
      labels: i.labels.map((l) => ({ name: l.name, color: `#${l.color}` })),
      author: i.user?.login ?? '',
      comments: i.comments,
      createdAt: Date.parse(i.created_at),
      updatedAt: Date.parse(i.updated_at)
    }
  }

  /** Open issues & PRs across repos you own or take part in; or of one repo. */
  async issues(repo?: string, force = false): Promise<GithubIssue[]> {
    const path = repo
      ? `/repos/${encodeURI(repo)}/issues?state=open&per_page=100`
      : '/issues?filter=all&state=open&per_page=100&sort=updated'
    return (await this.get<GhIssue[]>(path, force)).map((i) => this.toIssue(i))
  }

  /** Latest commits of the most recently pushed repos (or one repo). */
  async commits(
    localIndex: Map<string, string>,
    repo?: string,
    force = false
  ): Promise<GithubCommit[]> {
    const repos = repo ? [repo] : (await this.repos(localIndex)).slice(0, 8).map((r) => r.fullName)
    const all = await Promise.all(
      repos.map(async (full) => {
        try {
          const list = await this.get<GhCommit[]>(
            `/repos/${encodeURI(full)}/commits?per_page=${repo ? 30 : 6}`,
            force
          )
          return list.map((c) => ({
            sha: c.sha,
            repo: full,
            message: c.commit.message.split('\n')[0],
            author: c.author?.login ?? c.commit.author?.name ?? '',
            url: c.html_url,
            at: c.commit.author?.date ? Date.parse(c.commit.author.date) : 0
          }))
        } catch {
          return [] // empty repo, no access…
        }
      })
    )
    return all
      .flat()
      .sort((a, b) => b.at - a.at)
      .slice(0, repo ? 30 : 40)
  }

  /** Commits authored by the connected user in a range (weekly review). */
  async commitCount(
    from: number,
    to: number,
    localIndex: Map<string, string>
  ): Promise<number | null> {
    if (!this.token()) return null
    try {
      const list = await this.commits(localIndex)
      return list.filter((c) => c.at >= from && c.at <= to).length
    } catch {
      return null
    }
  }

  /** `repoIndex`: owner/repo → local project id, to link GitHub repos with «Мої проєкти». */
  api(repoIndex: () => Map<string, string>): GithubApi {
    return {
      status: async () => this.status(),
      setToken: async (args) => {
        this.setToken(githubTokenSchema.parse(args).token)
        return this.status()
      },
      repos: async (args) => this.repos(repoIndex(), !!args?.force),
      issues: async (args) => this.issues(repoArg.parse(args?.repo), !!args?.force),
      commits: async (args) => this.commits(repoIndex(), repoArg.parse(args?.repo), !!args?.force)
    }
  }
}
