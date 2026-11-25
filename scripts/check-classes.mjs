// Tailwind classes written the canonical way — what Tailwind CSS IntelliSense asks for with
// `suggestCanonicalClasses`: `aspect-video`, not `aspect-[16/9]`; `bg-(--x)`, not `bg-[var(--x)]`; a theme value,
// not its arbitrary twin. Tailwind's own design system (our globals.css) decides; the oxide scanner finds classes
// the same way the build does. Usage: node scripts/check-classes.mjs [--fix] [paths…] (default: src/renderer)
import { __unstable__loadDesignSystem } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname, dirname, resolve, relative } from 'path'

const ROOT = resolve('.')
const CSS = join(ROOT, 'src/renderer/src/styles/globals.css')
const args = process.argv.slice(2)
const fix = args.includes('--fix')
const roots = args.filter((a) => !a.startsWith('--'))
const ds = await __unstable__loadDesignSystem(readFileSync(CSS, 'utf8'), { base: dirname(CSS) })
const scanner = new Scanner({ sources: [] })

function* files(path) {
  if (statSync(path).isFile()) {
    if (/\.(tsx?|jsx?|html)$/.test(path)) yield path
    return
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules') continue
    yield* files(join(path, name))
  }
}

let total = 0
let changedFiles = 0
for (const root of roots.length ? roots : ['src/renderer']) {
  for (const file of files(resolve(root))) {
    const text = readFileSync(file, 'utf8')
    const edits = []
    for (const { candidate, position } of scanner.getCandidatesWithPositions({
      content: text,
      extension: extname(file).slice(1)
    })) {
      // Only real classes: words that aren't utilities have no CSS.
      if (!ds.candidatesToCss([candidate])[0]) continue
      const [canon] = ds.canonicalizeCandidates([candidate], { rem: 16 })
      if (!canon || canon === candidate || !ds.candidatesToCss([canon])[0]) continue
      // Positions are JS string (UTF-16) offsets; a mismatch means the scanner saw something else there.
      if (text.slice(position, position + candidate.length) !== candidate) {
        console.warn(`${relative(ROOT, file)}: ${candidate} at ${position} not found where expected — skipped`)
        continue
      }
      edits.push({ position, candidate, canon })
    }
    if (!edits.length) continue
    total += edits.length
    for (const e of edits) console.log(`${relative(ROOT, file)}: ${e.candidate} → ${e.canon}`)
    if (!fix) continue
    // Back to front, so earlier offsets stay valid.
    let out = text
    for (const e of edits.sort((a, b) => b.position - a.position)) {
      out = out.slice(0, e.position) + e.canon + out.slice(e.position + e.candidate.length)
    }
    writeFileSync(file, out)
    changedFiles++
  }
}
console.log(
  total
    ? `[check-classes] ${total} non-canonical class${total === 1 ? '' : 'es'}${fix ? ` fixed in ${changedFiles} files` : ' (run with --fix)'}`
    : '[check-classes] all classes are canonical'
)
if (total && !fix) process.exitCode = 1
