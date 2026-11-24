/**
 * Registry of every top-level entity that participates in cross-cutting features:
 * global search, tags, links, pins/favorites, trash and export.
 * Adding a module = adding one entry here (Open/Closed principle).
 */
export const ENTITY_TYPES = [
  'idea',
  'board',
  'card',
  'claude',
  'library',
  'component',
  'design',
  'moodboard',
  'snippet',
  'client',
  'project',
  'checklist',
  'fix',
  'bookmark',
  'word',
  'event',
  'note',
  'proposal',
  'template',
  'case',
  'redflag'
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]

export interface EntityTypeMeta {
  label: string
  plural: string
  /** Route builder for the renderer; kept here so main (notifications/export) can use it too. */
  route: (id: string) => string
}

export const ENTITY_META: Record<EntityType, EntityTypeMeta> = {
  idea: { label: 'Идея', plural: 'Идеи', route: (id) => `/ideas?open=${id}` },
  board: { label: 'Доска', plural: 'Доски', route: (id) => `/boards/${id}` },
  card: { label: 'Карточка', plural: 'Карточки', route: (id) => `/cards/${id}` },
  claude: { label: 'Claude', plural: 'Claude', route: (id) => `/claude?open=${id}` },
  library: { label: 'Библиотека', plural: 'Библиотеки', route: (id) => `/libraries?open=${id}` },
  component: { label: 'Компонент', plural: 'Компоненты', route: (id) => `/components/${id}` },
  design: { label: 'Дизайн', plural: 'Дизайны', route: (id) => `/designs?open=${id}` },
  moodboard: { label: 'Подборка', plural: 'Подборки', route: (id) => `/designs/boards/${id}` },
  snippet: { label: 'Сниппет', plural: 'Сниппеты', route: (id) => `/snippets?open=${id}` },
  client: { label: 'Клиент', plural: 'Клиенты', route: (id) => `/clients/${id}` },
  project: { label: 'Проект', plural: 'Проекты', route: (id) => `/projects/${id}` },
  checklist: { label: 'Чек-лист', plural: 'Чек-листы', route: (id) => `/checklists/${id}` },
  fix: { label: 'Ошибка', plural: 'Ошибки и решения', route: (id) => `/fixes?open=${id}` },
  bookmark: { label: 'Закладка', plural: 'Закладки', route: (id) => `/bookmarks?open=${id}` },
  word: { label: 'Слово', plural: 'Английский', route: (id) => `/english?open=${id}` },
  event: { label: 'Событие', plural: 'Календарь', route: (id) => `/calendar?open=${id}` },
  note: { label: 'Заметка', plural: 'Заметки', route: (id) => `/notes?open=${id}` },
  proposal: { label: 'Отклик', plural: 'Отклики', route: (id) => `/freelance/proposal/${id}` },
  template: { label: 'Шаблон', plural: 'Шаблоны', route: (id) => `/freelance/templates?open=${id}` },
  case: { label: 'Кейс', plural: 'Портфолио', route: (id) => `/freelance/portfolio?open=${id}` },
  redflag: { label: 'Красный флаг', plural: 'Красные флаги', route: (id) => `/freelance/flags?open=${id}` }
}

export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (ENTITY_TYPES as readonly string[]).includes(value)
}
