/**
 * The map of Vault for the chat ШІ: every section as the menu shows it — its label, hub and route, what it is
 * for, its record types and the chat action that creates a record there (null — only by hand). Main can't import
 * the renderer's navigation, so this is its own list; a unit test keeps the labels and routes equal to
 * `renderer/src/app/navigation.ts`. Plus a short help on where things are (settings, shortcuts).
 */
import type { EntityType } from './entity-types'
import type { AiActionType } from './domain/ai-actions'

export interface AppSection {
  /** Route as in the menu (a hub overview is its hub's route). */
  path: string
  /** The menu label, exactly as the sidebar shows it. */
  label: string
  /** The hub it sits in; null — top level or a footer icon. */
  hub: string | null
  /** What it is for, one short line. */
  about: string
  types: EntityType[]
  /** The chat action that creates a record here; null — the chat can't (the person does it by hand). */
  action: AiActionType | null
}

const s = (
  path: string,
  label: string,
  hub: string | null,
  about: string,
  types: EntityType[] = [],
  action: AiActionType | null = null
): AppSection => ({ path, label, hub, about, types, action })

export const APP_SECTIONS: readonly AppSection[] = [
  s('/', 'Головна', null, 'задачі й події дня, закріплене'),
  s(
    '/calendar',
    'Календар',
    null,
    'події, дедлайни, оплати, співбесіди',
    ['event'],
    'create_event'
  ),
  s('/review', 'Підсумки тижня', null, 'що зроблено за тиждень'),
  // Інструменти
  s(
    '/boards',
    'Дошки',
    'Інструменти',
    'канбан: колонки й картки-задачі',
    ['board', 'card'],
    'create_board'
  ),
  s(
    '/checklists',
    'Чек-листи',
    'Інструменти',
    'шаблони чек-листів (розділи, пункти) і прогони',
    ['checklist'],
    'create_checklist'
  ),
  s(
    '/freelance/templates',
    'Шаблони',
    'Інструменти',
    'шаблони для замовлень і вакансій з {змінними}',
    ['template'],
    'create_template'
  ),
  // Фриланс
  s('/freelance', 'Фриланс', 'Фриланс', 'платформи, відгуки, конекти', ['proposal']),
  s('/clients', 'Клієнти й проєкти', 'Фриланс', 'клієнти, проєкти, доступи, час, оплати', [
    'client',
    'project'
  ]),
  s(
    '/freelance/portfolio',
    'Портфоліо',
    'Фриланс',
    'кейси: задача, зроблено, результат',
    ['case'],
    'create_case'
  ),
  s(
    '/freelance/flags',
    'Червоні прапорці',
    'Фриланс',
    'ознаки поганих замовлень',
    ['redflag'],
    'create_redflag'
  ),
  s('/freelance/goals', 'Цілі', 'Фриланс', 'цілі за доходом'),
  s('/freelance/calculator', 'Калькулятор ставки', 'Фриланс', 'погодинна ставка з комісіями'),
  // Пошук роботи
  s('/jobs', 'Пошук роботи', 'Пошук роботи', 'воронка відгуків, співбесіди'),
  s('/jobs/applications', 'Вакансії', 'Пошук роботи', 'вакансії, етапи, тестові', ['application']),
  s('/jobs/interviews', 'Співбесіди', 'Пошук роботи', 'співбесіди за датою'),
  s('/jobs/companies', 'Компанії', 'Пошук роботи', 'компанії й нотатки', ['company']),
  s('/jobs/resumes', 'Резюме', 'Пошук роботи', 'версії резюме'),
  s('/jobs/boards', 'Сайти вакансій', 'Пошук роботи', 'де шукати вакансії щодня'),
  s('/jobs/stats', 'Статистика', 'Пошук роботи', 'конверсія відгуків'),
  // Фінанси
  s('/finance', 'Фінанси', 'Фінанси', 'доходи й витрати за місяць'),
  s('/finance/income', 'Доходи', 'Фінанси', 'надходження'),
  s('/finance/expenses', 'Підписки й витрати', 'Фінанси', 'підписки й витрати'),
  s('/finance/withdrawals', 'Виплати з платформ', 'Фінанси', 'перекази з платформ на картку'),
  // Розробка
  s(
    '/ideas',
    'Ідеї',
    'Розробка',
    'ідеї зі статусом; ідею можна зробити дошкою',
    ['idea'],
    'create_idea'
  ),
  s('/dev', 'Локальні проєкти', 'Розробка', 'локальні репозиторії, скрипти'),
  s('/dev/github', 'GitHub', 'Розробка', 'issues і коміти'),
  // База знань
  s('/knowledge', 'База знань', 'База знань', 'огляд бази знань'),
  s('/notes', 'Нотатки', 'База знань', 'нотатки в теках', ['note'], 'create_note'),
  s('/claude', 'ШІ-база', 'База знань', 'промти, скіли, гайди для ШІ', ['claude'], 'create_claude'),
  s('/snippets', 'Сніпети', 'База знань', 'шматки коду', ['snippet'], 'create_snippet'),
  s(
    '/components',
    'Компоненти',
    'База знань',
    'компоненти з живим прев’ю',
    ['component'],
    'create_component'
  ),
  s('/libraries', 'Бібліотеки', 'База знань', 'npm-пакети', ['library'], 'create_library'),
  s('/fixes', 'Фікси', 'База знань', 'помилки, причини, рішення', ['fix'], 'create_fix'),
  s('/designs', 'Галерея', 'База знань', 'скріншоти, добірки', ['design', 'moodboard']),
  s(
    '/bookmarks',
    'Закладки',
    'База знань',
    'статті, відео, курси',
    ['bookmark'],
    'create_bookmark'
  ),
  // Навчання
  s(
    '/english',
    'Англійська',
    'Навчання',
    'слова з перекладом, повторення',
    ['word'],
    'create_word'
  ),
  s(
    '/jobs/questions',
    'До співбесід',
    'Навчання',
    'питання зі співбесід, відповіді, тренажер',
    ['question'],
    'create_question'
  ),
  // Always shown: the guide and the footer icons
  s('/guide', 'Гайд', null, 'як усе працює, FAQ'),
  s('/tags', 'Мітки', null, 'мітки й записи з ними'),
  s('/trash', 'Кошик', null, 'видалене за 30 днів'),
  s('/settings', 'Налаштування', null, 'тема, меню, бекап, експорт, ШІ')
]

/** Where things are in Vault and the main keys: answers «як…», «де…» questions without guessing. */
export const APP_HELP = [
  'Ctrl+K — пошук усюди й дії; Ctrl+N — швидко додати; Ctrl+J — чат ШІ; Ctrl+B — згорнути бічну панель; Ctrl+/ — усі гарячі клавіші; G, потім літера — перейти в розділ; Alt+1…9 — розділи по порядку.',
  'На сторінці: N — створити, / — пошук у розділі, E — редагувати відкритий запис, Esc — закрити.',
  'Сховати розділ: правий клік по пункту меню → «Сховати…» або Налаштування → Меню.',
  'Бекап: Налаштування → Бекап (автоматичний щодня й «Зробити зараз»); експорт у Markdown/JSON: Налаштування → Експорт; де лежать дані: Налаштування → Дані.',
  'Видалене лежить у Кошику 30 днів. Мітки — у записі в режимі «Редагувати», керування — сторінка «Мітки».',
  'Імпорт з JSON — кнопка в розділах Чек-листи, Англійська, Сніпети, Шаблони, Ідеї, Закладки, Бібліотеки, До співбесід.',
  'ШІ: Налаштування → Штучний інтелект; тестовий режим з окремими даними: Налаштування → Тестовий режим.'
].join('\n')

/** «Хаб › Розділ» (or just the section) — how the chat names a place. */
export function sectionPath(sec: AppSection): string {
  return sec.hub && sec.hub !== sec.label ? `${sec.hub} › ${sec.label}` : sec.label
}

/**
 * The section of a location (a query is ignored): the longest matching path (a record page belongs to its
 * section: /boards/<id> → Дошки).
 */
export function sectionAt(location: string): AppSection | null {
  const [pathname] = location.split('?')
  let best: AppSection | null = null
  for (const sec of APP_SECTIONS) {
    const base = sec.path
    const hit =
      base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)
    if (hit && (!best || base.length > best.path.length)) best = sec
  }
  // A record page outside its section's route: client and project pages are «Клієнти й проєкти».
  if (!best && /^\/projects\//.test(pathname))
    return APP_SECTIONS.find((x) => x.path === '/clients') ?? null
  if (!best && /^\/cards\//.test(pathname))
    return APP_SECTIONS.find((x) => x.path === '/boards') ?? null
  return best
}

/** The map for the system prompt: one line per section, ~2 000 characters. */
export function appMapPrompt(): string {
  return APP_SECTIONS.map(
    (sec) => `- ${sectionPath(sec)}: ${sec.about}${sec.action ? ` → ${sec.action}` : ''}`
  ).join('\n')
}
