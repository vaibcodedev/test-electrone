/**
 * Developer workspace: local projects (open in editor, run package.json scripts with live logs),
 * GitHub (repos, open issues, recent commits) and the browser-capture bridge.
 */
import { z } from 'zod'
import { MAX } from './limits'
import { idSchema, patchOf, urlSchema } from './common'
import { BOOKMARK_KINDS } from './bookmarks'
import { SNIPPET_LANGUAGES } from './snippets'

/* ───────────── Local projects ───────────── */

export const EDITORS = ['vscode', 'cursor'] as const
export type Editor = (typeof EDITORS)[number]

export const devProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(MAX.name),
  /** Absolute folder path. */
  path: z.string().trim().min(1).max(1000),
  notes: z.string().max(50_000).default(''),
  /** Preferred editor for the big «Открыть» button. */
  editor: z.enum(EDITORS).default('vscode'),
  /** Script started by «Запустить» (defaults to dev/start). */
  mainScript: z.string().max(100).default(''),
  favorite: z.boolean().default(false),
  /** Link to a CRM contract / board etc. is done with entity links. */
  githubRepo: z.string().max(200).default('')
})
export const devProjectPatchSchema = patchOf(devProjectInputSchema)
export type DevProjectInput = z.input<typeof devProjectInputSchema>
export type DevProjectPatch = z.input<typeof devProjectPatchSchema>

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface GitInfo {
  branch: string | null
  /** Changed/untracked files. */
  dirty: number
  ahead: number
  behind: number
  lastCommit: { hash: string; message: string; author: string; at: number } | null
  remoteUrl: string | null
}

export interface DevProject {
  id: string
  name: string
  path: string
  notes: string
  editor: Editor
  mainScript: string
  favorite: boolean
  githubRepo: string
  lastOpenedAt: number | null
  createdAt: number
  updatedAt: number
  /** Live data (null when the folder is missing). */
  exists: boolean
  packageManager: PackageManager | null
  scripts: Record<string, string>
  framework: string | null
  git: GitInfo | null
  running: RunningScript[]
}

export interface RunningScript {
  runId: string
  projectId: string
  script: string
  pid: number | null
  startedAt: number
  status: 'running' | 'exited' | 'failed'
  exitCode: number | null
  /** First http://localhost… seen in the output. */
  url: string | null
}

export interface LogChunk {
  runId: string
  /** Newline-separated text (ANSI colours stripped). */
  text: string
  stream: 'out' | 'err' | 'sys'
}

export const runScriptSchema = z.object({ projectId: idSchema, script: z.string().min(1).max(100) })
export const openInSchema = z.object({ projectId: idSchema, target: z.enum(['vscode', 'cursor', 'terminal', 'folder']) })

/* ───────────── GitHub ───────────── */

export interface GithubStatus {
  connected: boolean
  login: string | null
  name: string | null
  avatarUrl: string | null
  error: string | null
  rateRemaining: number | null
}

export interface GithubRepo {
  fullName: string
  name: string
  owner: string
  description: string | null
  private: boolean
  fork: boolean
  url: string
  defaultBranch: string
  language: string | null
  stars: number
  openIssues: number
  pushedAt: number | null
  /** Local project linked to this repo, if any. */
  localProjectId: string | null
}

export interface GithubIssue {
  id: number
  number: number
  title: string
  url: string
  repo: string
  state: 'open' | 'closed'
  isPullRequest: boolean
  labels: { name: string; color: string }[]
  author: string
  comments: number
  createdAt: number
  updatedAt: number
}

export interface GithubCommit {
  sha: string
  repo: string
  message: string
  author: string
  url: string
  at: number
}

export const githubTokenSchema = z.object({ token: z.string().trim().max(500) })

/* ───────────── Browser capture (Chrome extension bridge) ───────────── */

/** Only append: old popups send the first five, extension 0.2+ adds snippet / note / fix. */
export const CAPTURE_TARGETS = [
  'design',
  'bookmark',
  'library',
  'component',
  'application',
  'snippet',
  'note',
  'fix'
] as const
export type CaptureTarget = (typeof CAPTURE_TARGETS)[number]

export const captureSchema = z.object({
  target: z.enum(CAPTURE_TARGETS),
  url: urlSchema,
  title: z.string().max(MAX.title).default(''),
  note: z.string().max(10_000).default(''),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  /** data:image/png;base64,… */
  screenshot: z.string().max(25_000_000).nullable().default(null),
  /** Selected text on the page (job description, code…), editable in the popup. */
  selection: z.string().max(200_000).default(''),
  /** Vacancy: company name. */
  company: z.string().trim().max(200).default(''),
  /** Bookmark: type chosen in the popup (guessed from the site otherwise). */
  kind: z.enum(BOOKMARK_KINDS).optional(),
  /** Snippet: language guessed in the popup and maybe corrected there; a plain «text» snippet without it. */
  language: z.enum(SNIPPET_LANGUAGES).optional(),
  /** Fix: how it was solved (optional: an error without it is saved as unresolved). */
  solution: z.string().max(200_000).default('')
})
export type CaptureInput = z.input<typeof captureSchema>

export interface CaptureInfo {
  enabled: boolean
  port: number
  token: string
  extensionDir: string
  running: boolean
}
