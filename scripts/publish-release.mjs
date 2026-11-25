/**
 * Publishes dist/ to GitHub Releases in one predictable pass (electron-builder's parallel uploads raced
 * and created duplicate releases for one tag). Run after `electron-builder --win --publish never`.
 * Needs GH_TOKEN with Contents: Read and write on the repo from electron-builder.yml → publish.
 * Usage: GH_TOKEN=… node scripts/publish-release.mjs
 */
import { readFileSync, existsSync, statSync } from 'fs'
import { execFileSync, execSync } from 'child_process'
import { join } from 'path'

const token = process.env.GH_TOKEN
if (!token) throw new Error('GH_TOKEN is not set')

const yml = readFileSync('electron-builder.yml', 'utf8')
const pick = (key) => yml.match(new RegExp(`^\\s+${key}:\\s*(\\S+)`, 'm'))?.[1]
const owner = pick('owner')
const repo = pick('repo')
const channel = pick('channel') ?? 'latest'
const prerelease = pick('releaseType') !== 'release'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const tag = `v${version}`

const files = [`Vault-${version}-setup.exe`, `Vault-${version}-setup.exe.blockmap`, `${channel}.yml`].map((f) => join('dist', f))
for (const f of files) if (!existsSync(f)) throw new Error(`Missing ${f}: build first`)

const api = async (method, url, body, headers = {}) => {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/repos/${owner}/${repo}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...headers },
    body
  })
  // 404/422 = "no such thing" (GitHub answers 422 for an unknown commit sha).
  if (!res.ok && res.status !== 404 && res.status !== 422) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`)
  return res.status === 204 || res.status === 404 || res.status === 422 ? null : res.json()
}

// The tag must point at the code that was built: the exact local commit, and it has to be on GitHub.
// ('main' tagged whatever the remote branch was, often dozens of commits behind.)
// The release commit is the one its tag points to (the installer was built from it), not whatever HEAD is now:
// commits made after `npm version` must not move the release or block it.
const sha = (() => {
  try {
    // execFileSync, no shell: cmd.exe treats ^ as its escape character and mangled `tag^{commit}`.
    return execFileSync('git', ['rev-parse', `${tag}^{commit}`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return execSync('git rev-parse HEAD').toString().trim()
  }
})()
if (!(await api('GET', `/commits/${sha}`))) {
  throw new Error(`Commit ${sha.slice(0, 7)} is not on GitHub yet: run \`git push\` first, then publish again.`)
}

// One release per tag. Drafts aren't found by /releases/tags, so a retry looks through the list.
const all = (await api('GET', '/releases?per_page=30')) ?? []
let release = all.find((r) => r.tag_name === tag)
if (!release) {
  // Created as a draft: installed betas must not see a release whose installer is still uploading.
  release = await api(
    'POST',
    '/releases',
    JSON.stringify({ tag_name: tag, name: version, prerelease, draft: true, target_commitish: sha }),
    { 'Content-Type': 'application/json' }
  )
  console.log(`created draft ${tag} at ${sha.slice(0, 7)}`)
}

// A 130 MB upload over a shaky line can stall («Upload body timed out», ECONNRESET): up to 4 tries per file, a
// growing pause between them, and a half-uploaded asset of that name removed before each try.
const removeAsset = async (name) => {
  const fresh = (await api('GET', `/releases/${release.id}`)) ?? release
  const old = fresh.assets.find((a) => a.name === name)
  if (old) await api('DELETE', `/releases/assets/${old.id}`)
}
for (const file of files) {
  const name = file.split(/[\\/]/).pop()
  const size = statSync(file).size
  for (let attempt = 1; ; attempt++) {
    await removeAsset(name)
    process.stdout.write(`uploading ${name} (${(size / 1e6).toFixed(1)} MB)${attempt > 1 ? `, try ${attempt}` : ''}… `)
    try {
      await api(
        'POST',
        `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        readFileSync(file),
        { 'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream', 'Content-Length': String(size) }
      )
      console.log('ok')
      break
    } catch (e) {
      console.log(`failed: ${e.message.slice(0, 120)}`)
      if (attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, attempt * 15_000))
    }
  }
}
if (release.draft) release = await api('PATCH', `/releases/${release.id}`, JSON.stringify({ draft: false }), { 'Content-Type': 'application/json' })
console.log(`published ${release.html_url}`)

// GitHub made a lightweight tag at the same commit; `npm version` left an annotated one here. Same commit, but
// a pull then saw «conflicting tags» (VS Code offers «Replace Local Tag(s)»). Make the local one lightweight too —
// local only, nothing is pushed.
try {
  execSync(`git tag -f ${tag} ${sha}`, { stdio: 'ignore' })
  console.log(`local tag ${tag} now matches GitHub's`)
} catch {
  console.log(`local tag ${tag} left as is`)
}
