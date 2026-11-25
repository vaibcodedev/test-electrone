import { BookOpen, Bookmark as BookmarkIcon, FileText, GitBranch, GraduationCap, Video, type LucideIcon } from 'lucide-react'
import type { BookmarkKind, BookmarkStatus } from '@shared/domain/bookmarks'

export const STATUS_LABEL: Record<BookmarkStatus, string> = {
  // A state, not a call to action: «Прочитати» next to a dot read like a link.
  queue: 'У черзі',
  in_progress: 'Читаю',
  done: 'Прочитано',
  dropped: 'Покинуто'
}

/** Status reads at a glance: queue neutral, reading in progress blue, read green, dropped muted. */
export const STATUS_BADGE: Record<BookmarkStatus, 'soft' | 'info' | 'success' | 'outline'> = {
  queue: 'soft',
  in_progress: 'info',
  done: 'success',
  dropped: 'outline'
}

export const KIND_LABEL: Record<BookmarkKind, string> = {
  article: 'Стаття',
  video: 'Відео',
  course: 'Курс',
  docs: 'Документація',
  repo: 'Репо',
  other: 'Інше'
}

export const KIND_ICON: Record<BookmarkKind, LucideIcon> = {
  article: FileText,
  video: Video,
  course: GraduationCap,
  docs: BookOpen,
  repo: GitBranch,
  other: BookmarkIcon
}
