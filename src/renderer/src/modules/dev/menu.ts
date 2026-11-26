import {
  Code2,
  Copy,
  FolderOpen,
  GitBranch,
  Play,
  Square,
  Star,
  TerminalSquare,
  Trash2,
  Zap
} from 'lucide-react'
import type { DevProject } from '@shared/domain/dev'
import { useApiMutation } from '@/lib/query'
import { openUrl } from '@/lib/open-url'
import { copyText } from '@/components/common/copy-button'
import { defineRecordMenu } from '@/features/record-menu/model'
import { useOpenItem } from '@/features/record-menu/actions'

/**
 * A local project's right click and «⋯»: open it in the editor, terminal or Explorer, run a script, its GitHub,
 * its path. «Прибрати з Vault» leaves the folder on disk, but still asks (its scripts stop).
 */
export const devProjectMenu = defineRecordMenu<DevProject, { onOpen: () => void }>({
  title: (p) => p.name,
  useGroups(p, { onOpen }) {
    const open = useApiMutation('devProjects', 'open')
    const run = useApiMutation('devProjects', 'run')
    const stop = useApiMutation('devProjects', 'stop')
    const update = useApiMutation('devProjects', 'update')
    const remove = useApiMutation('devProjects', 'remove', {
      successMessage: 'Проєкт прибрано з Vault'
    })
    const go = (target: 'vscode' | 'cursor' | 'terminal' | 'folder') => () =>
      open.mutate({ projectId: p.id, target })
    const scripts = Object.keys(p.scripts)
    return {
      open: [
        useOpenItem(null, onOpen),
        p.exists && { label: 'VS Code', icon: Code2, run: go('vscode') },
        p.exists && { label: 'Cursor', icon: Zap, run: go('cursor') },
        p.exists && { label: 'Термінал', icon: TerminalSquare, run: go('terminal') },
        p.exists && { label: 'Папка', icon: FolderOpen, run: go('folder') }
      ],
      state: [
        p.exists &&
          scripts.length > 0 && {
            label: 'Скрипти',
            icon: Play,
            items: scripts.map((s) => {
              const r = p.running.find((x) => x.script === s)
              return r
                ? { label: `Зупинити ${s}`, icon: Square, run: () => stop.mutate(r.runId) }
                : { label: s, icon: Play, run: () => run.mutate({ projectId: p.id, script: s }) }
            })
          },
        {
          label: 'Обране',
          icon: Star,
          on: p.favorite,
          run: () => update.mutate({ id: p.id, patch: { favorite: !p.favorite } })
        }
      ],
      share: [
        !!p.githubRepo && {
          label: 'Відкрити GitHub',
          icon: GitBranch,
          run: () => void openUrl(`https://github.com/${p.githubRepo}`)
        },
        {
          label: 'Копіювати шлях',
          icon: Copy,
          run: () => void copyText(p.path, 'Шлях скопійовано')
        }
      ],
      danger: [
        {
          label: 'Прибрати з Vault',
          icon: Trash2,
          destructive: true,
          confirm: {
            title: `Прибрати «${p.name}» з Vault?`,
            description:
              'Папку на диску не буде видалено — проєкт просто зникне зі списку. Запущені скрипти буде зупинено.',
            confirmLabel: 'Прибрати'
          },
          run: () => remove.mutate(p.id)
        }
      ]
    }
  }
})
