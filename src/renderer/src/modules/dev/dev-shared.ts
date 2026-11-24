import type { DevProject, Editor } from '@shared/domain/dev'

export const EDITOR_LABEL: Record<Editor, string> = { vscode: 'VS Code', cursor: 'Cursor' }

/** Script for the «Запустить» button: explicit main script, else dev / start / serve. */
export function defaultScript(p: DevProject): string | null {
  if (p.mainScript && p.mainScript in p.scripts) return p.mainScript
  for (const s of ['dev', 'start', 'serve', 'preview']) if (s in p.scripts) return s
  return null
}

export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
