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
  s('/', 'Головна', null, 'день: задачі, події, швидкі дії, закріплене'),
  s('/review', 'Підсумки тижня', null, 'що зроблено за тиждень по всіх розділах'),
  // Робота
  s('/ideas', 'Ідеї', 'Робота', 'ідеї зі статусом і впливом; ідею можна перетворити на дошку', ['idea'], 'create_idea'),
  s('/boards', 'Дошки', 'Робота', 'канбан-дошки з колонками й картками-задачами', ['board', 'card'], 'create_board'),
  s('/calendar', 'Календар', 'Робота', 'події, дедлайни карток, оплати, співбесіди', ['event'], 'create_event'),
  s('/checklists', 'Чек-листи', 'Робота', 'шаблони чек-листів (розділи й пункти) і прогони за ними', ['checklist'], 'create_checklist'),
  // Фриланс
  s('/freelance', 'Фриланс', 'Фриланс', 'огляд: платформи, відгуки, конекти, статистика', ['proposal']),
  s('/clients', 'Клієнти й контракти', 'Фриланс', 'клієнти, проєкти, доступи, облік часу, оплати', ['client', 'project']),
  s('/freelance/templates', 'Шаблони', 'Фриланс', 'шаблони відгуків і відповідей клієнтам з {змінними}', ['template'], 'create_template'),
  s('/freelance/portfolio', 'Портфоліо', 'Фриланс', 'кейси: задача, що зроблено, результат', ['case'], 'create_case'),
  s('/freelance/flags', 'Червоні прапорці', 'Фриланс', 'ознаки поганих замовлень і що робити', ['redflag'], 'create_redflag'),
  s('/freelance/goals', 'Цілі', 'Фриланс', 'цілі за доходом і відгуками'),
  s('/freelance/calculator', 'Калькулятор ставки', 'Фриланс', 'погодинна ставка з урахуванням комісій'),
  // Пошук роботи
  s('/jobs', 'Пошук роботи', 'Пошук роботи', 'огляд: воронка відгуків, найближчі співбесіди'),
  s('/jobs/applications', 'Вакансії', 'Пошук роботи', 'вакансії, етапи, тестові', ['application']),
  s('/jobs/interviews', 'Співбесіди', 'Пошук роботи', 'усі співбесіди за датою'),
  s('/jobs/companies', 'Компанії', 'Пошук роботи', 'компанії й нотатки про них', ['company']),
  s('/jobs/resumes', 'Резюме', 'Пошук роботи', 'версії резюме (файли)'),
  s('/jobs/questions', 'Питання й тренажер', 'Пошук роботи', 'банк питань зі співбесід з відповідями й тренажер', ['question'], 'create_question'),
  s('/jobs/boards', 'Майданчики', 'Пошук роботи', 'сайти вакансій і нагадування їх переглянути'),
  s('/jobs/stats', 'Статистика', 'Пошук роботи', 'конверсія відгуків у співбесіди'),
  s('/freelance/templates?situation=cover_letter', 'Шаблони листів', 'Пошук роботи', 'супровідні листи — шаблони з ситуацією «Супровідний лист»', ['template'], 'create_template'),
  // Фінанси
  s('/finance', 'Фінанси', 'Фінанси', 'огляд доходів і витрат за місяць'),
  s('/finance/income', 'Доходи', 'Фінанси', 'надходження за місяцями'),
  s('/finance/expenses', 'Підписки й витрати', 'Фінанси', 'підписки й разові витрати'),
  s('/finance/withdrawals', 'Виведення', 'Фінанси', 'виведення з платформ'),
  // Розробка
  s('/dev', 'Мої проєкти', 'Розробка', 'локальні репозиторії, скрипти, гілки'),
  s('/dev/github', 'GitHub', 'Розробка', 'issues і коміти з GitHub'),
  // Знання
  s('/knowledge', 'Знання', 'Знання', 'огляд розділів знань'),
  s('/notes', 'Нотатки', 'Знання', 'нотатки в теках, Markdown і посилання [[', ['note'], 'create_note'),
  s('/claude', 'Claude', 'Знання', 'промти, скіли, гайди й нотатки про Claude', ['claude'], 'create_claude'),
  s('/snippets', 'Сніпети', 'Знання', 'шматки коду з мовою й описом', ['snippet'], 'create_snippet'),
  s('/components', 'Компоненти', 'Знання', 'React/HTML-компоненти з живим прев’ю', ['component'], 'create_component'),
  s('/libraries', 'JS-бібліотеки', 'Знання', 'npm-пакети: для чого, як встановити', ['library'], 'create_library'),
  s('/fixes', 'Помилки й рішення', 'Знання', 'помилки: текст, причина, рішення', ['fix'], 'create_fix'),
  // Натхнення й навчання
  s('/designs', 'Дизайни', 'Натхнення й навчання', 'скріншоти й картинки, добірки', ['design', 'moodboard']),
  s('/bookmarks', 'Закладки', 'Натхнення й навчання', 'статті, відео, курси з посиланням', ['bookmark'], 'create_bookmark'),
  s('/english', 'Англійська', 'Натхнення й навчання', 'слова й фрази з перекладом і інтервальним повторенням', ['word'], 'create_word'),
  // Always shown: the guide and the footer icons
  s('/guide', 'Гайд', null, 'як усе працює, гарячі клавіші, FAQ'),
  s('/tags', 'Мітки', null, 'усі мітки й записи з ними'),
  s('/trash', 'Кошик', null, 'видалене за 30 днів, «Відновити»'),
  s('/settings', 'Налаштування', null, 'тема, меню, бекап, експорт, ШІ, розширення, оновлення')
]

/** Where things are in Vault and the main keys: answers «як…», «де…» questions without guessing. */
export const APP_HELP = [
  'Ctrl+K — пошук усюди й дії; Ctrl+N — швидко додати; Ctrl+J — чат ШІ; Ctrl+B — згорнути бічну панель; Ctrl+/ — усі гарячі клавіші; G, потім літера — перейти в розділ; Alt+1…9 — розділи по порядку.',
  'На сторінці: N — створити, / — пошук у розділі, E — редагувати відкритий запис, Esc — закрити.',
  'Сховати розділ: правий клік по пункту меню → «Сховати…» або Налаштування → Меню.',
  'Бекап: Налаштування → Бекап (автоматичний щодня й «Зробити зараз»); експорт у Markdown/JSON: Налаштування → Експорт; де лежать дані: Налаштування → Дані.',
  'Видалене лежить у Кошику 30 днів. Мітки — у записі в режимі «Редагувати», керування — сторінка «Мітки».',
  'Імпорт з JSON — кнопка в розділах Чек-листи, Англійська, Сніпети, Шаблони, Ідеї, Закладки, JS-бібліотеки, Питання.',
  'ШІ: Налаштування → Штучний інтелект; тестовий режим з окремими даними: Налаштування → Тестовий режим.'
].join('\n')

/** «Хаб › Розділ» (or just the section) — how the chat names a place. */
export function sectionPath(sec: AppSection): string {
  return sec.hub && sec.hub !== sec.label ? `${sec.hub} › ${sec.label}` : sec.label
}

/**
 * The section of a location (pathname + search): an entry with a query wins when its params are there, then the
 * longest matching path (a record page belongs to its section: /boards/<id> → Дошки).
 */
export function sectionAt(location: string): AppSection | null {
  const [pathname, search = ''] = location.split('?')
  const have = new URLSearchParams(search)
  let best: AppSection | null = null
  for (const sec of APP_SECTIONS) {
    const [base, query] = sec.path.split('?')
    if (query) {
      const all = [...new URLSearchParams(query)].every(([k, v]) => have.get(k) === v)
      if (pathname === base && all) return sec
      continue
    }
    const hit = base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)
    if (hit && (!best || base.length > best.path.length)) best = sec
  }
  // A record page outside its section's route: client and project pages are «Клієнти й контракти».
  if (!best && /^\/projects\//.test(pathname)) return APP_SECTIONS.find((x) => x.path === '/clients') ?? null
  if (!best && /^\/cards\//.test(pathname)) return APP_SECTIONS.find((x) => x.path === '/boards') ?? null
  return best
}

/** The map for the system prompt: one line per section, ~2 000 characters. */
export function appMapPrompt(): string {
  return APP_SECTIONS.map(
    (sec) => `- ${sectionPath(sec)} (${sec.path}): ${sec.about}${sec.action ? ` → ${sec.action}` : ''}`
  ).join('\n')
}
