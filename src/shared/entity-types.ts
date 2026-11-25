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
  'redflag',
  'application',
  'company',
  'question'
] as const

export type EntityType = (typeof ENTITY_TYPES)[number]

export interface EntityTypeMeta {
  label: string
  plural: string
  /** Route builder for the renderer; kept here so main (notifications/export) can use it too. */
  route: (id: string) => string
}

export const ENTITY_META: Record<EntityType, EntityTypeMeta> = {
  idea: { label: 'Ідея', plural: 'Ідеї', route: (id) => `/ideas?open=${id}` },
  board: { label: 'Дошка', plural: 'Дошки', route: (id) => `/boards/${id}` },
  card: { label: 'Картка', plural: 'Картки', route: (id) => `/cards/${id}` },
  claude: { label: 'Claude', plural: 'Claude', route: (id) => `/claude?open=${id}` },
  library: { label: 'Бібліотека', plural: 'JS-бібліотеки', route: (id) => `/libraries?open=${id}` },
  component: { label: 'Компонент', plural: 'Компоненти', route: (id) => `/components/${id}` },
  design: { label: 'Дизайн', plural: 'Галерея', route: (id) => `/designs?open=${id}` },
  moodboard: { label: 'Добірка', plural: 'Добірки', route: (id) => `/designs/boards/${id}` },
  snippet: { label: 'Сніпет', plural: 'Сніпети', route: (id) => `/snippets?open=${id}` },
  client: { label: 'Клієнт', plural: 'Клієнти', route: (id) => `/clients/${id}` },
  project: { label: 'Проєкт', plural: 'Проєкти', route: (id) => `/projects/${id}` },
  checklist: { label: 'Чек-лист', plural: 'Чек-листи', route: (id) => `/checklists/${id}` },
  fix: { label: 'Помилка', plural: 'Помилки й рішення', route: (id) => `/fixes?open=${id}` },
  bookmark: { label: 'Закладка', plural: 'Закладки', route: (id) => `/bookmarks?open=${id}` },
  word: { label: 'Слово', plural: 'Англійська', route: (id) => `/english?open=${id}` },
  event: { label: 'Подія', plural: 'Календар', route: (id) => `/calendar?open=${id}` },
  note: { label: 'Нотатка', plural: 'Нотатки', route: (id) => `/notes?open=${id}` },
  proposal: { label: 'Відгук', plural: 'Відгуки', route: (id) => `/freelance/proposal/${id}` },
  template: { label: 'Шаблон', plural: 'Шаблони', route: (id) => `/freelance/templates?open=${id}` },
  case: { label: 'Кейс', plural: 'Портфоліо', route: (id) => `/freelance/portfolio?open=${id}` },
  redflag: { label: 'Червоний прапорець', plural: 'Червоні прапорці', route: (id) => `/freelance/flags?open=${id}` },
  application: { label: 'Вакансія', plural: 'Вакансії', route: (id) => `/jobs/applications?open=${id}` },
  company: { label: 'Компанія', plural: 'Компанії', route: (id) => `/jobs/companies?open=${id}` },
  question: { label: 'Питання', plural: 'Банк питань', route: (id) => `/jobs/questions?open=${id}` }
}

/**
 * Titles a record gets from a «+ Створити» button, per type. A record that still has one of these titles,
 * was never edited and has no content is a *draft*: creating another one reuses it, closing it discards it
 * (docs/design-system.md → Формы → Пустые записи). Old Russian defaults stay here so existing drafts match.
 */
export const DRAFT_TITLES: Partial<Record<EntityType, readonly string[]>> = {
  note: ['Нова нотатка', 'Новая заметка'],
  claude: [
    'Нова нотатка', 'Нова гілка', 'Новий скіл', 'Новий плагін', 'Новий гайд', 'Новий промт',
    'Новая заметка', 'Новая ветка', 'Новый скил', 'Новый плагин', 'Новый гайд', 'Новый промт'
  ],
  snippet: ['Новий сніпет', 'Новый сниппет'],
  fix: ['Нова помилка', 'Новая ошибка'],
  component: ['Новий компонент', 'Новый компонент'],
  bookmark: ['Нова закладка', 'Новая закладка'],
  moodboard: ['Нова добірка', 'Новая подборка'],
  library: ['new-package'],
  case: ['Новий кейс', 'Новый кейс'],
  redflag: ['Новий прапорець', 'Новый флаг', 'Новый красный флаг'],
  template: ['Новий шаблон', 'Новый шаблон'],
  question: ['Нове питання', 'Новый вопрос'],
  checklist: ['Новий чек-лист', 'Новый чек-лист']
}
