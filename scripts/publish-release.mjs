/**
 * Publishes dist/ to GitHub Releases in one predictable pass (electron-builder's parallel uploads raced
 * and created duplicate releases for one tag). Run after `electron-builder --win --publish never`.
 * Needs GH_TOKEN with Contents: Read and write on the repo from electron-builder.yml → publish.
 * Usage: GH_TOKEN=… node scripts/publish-release.mjs
 */
import { readFileSync, existsSync, statSync } from 'fs'
import { execSync } from 'child_process'
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
const sha = execSync('git rev-parse HEAD').toString().trim()
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

for (const file of files) {
  const name = file.split(/[\\/]/).pop()
  const old = release.assets.find((a) => a.name === name)
  if (old) await api('DELETE', `/releases/assets/${old.id}`)
  const size = statSync(file).size
  process.stdout.write(`uploading ${name} (${(size / 1e6).toFixed(1)} MB)… `)
  await api(
    'POST',
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    readFileSync(file),
    { 'Content-Type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream', 'Content-Length': String(size) }
  )
  console.log('ok')
}
if (release.draft) release = await api('PATCH', `/releases/${release.id}`, JSON.stringify({ draft: false }), { 'Content-Type': 'application/json' })
console.log(`published ${release.html_url}`)
