/**
 * Test data for UI audits and screenshot runs (scripts/snap-all.mjs, audit-*.mjs).
 * Every function takes `rpc(path, arg) → data` (throws nothing; failed calls are logged and return null),
 * so a schema change in one module never stops a whole screenshot run.
 */

/** Wraps the raw `window.vault.rpc` caller: returns data or null, logs failures once per path. */
export function makeRpc(raw, label = 'fixtures') {
  return async (path, arg) => {
    const r = await raw(path, arg)
    if (!r?.ok) {
      console.log(`[${label}] ${path}: ${r?.error ?? 'no response'}`)
      return null
    }
    return r.data
  }
}

const first = (list) => (Array.isArray(list) ? list[0] : (list?.items?.[0] ?? null))

/** Records with only their required fields — how does a barely filled record read? Returns type → id. */
export async function seedSparse(rpc) {
  const ids = {}
  const put = (type, rec) => rec?.id && (ids[type] = rec.id)
  const plat = first(await rpc('platforms.list', {}))
  put('idea', await rpc('ideas.create', { title: 'Ідея без опису' }))
  put('note', await rpc('notes.create', { title: 'Нотатка без тексту' }))
  put('bookmark', await rpc('bookmarks.create', { title: 'Закладка без посилання' }))
  put('snippet', await rpc('snippets.create', { title: 'Сніпет без коду' }))
  put('library', await rpc('libraries.create', { name: 'tiny-lib' }))
  put('fix', await rpc('fixes.create', { title: 'Помилка без опису' }))
  put('claude', await rpc('claude.create', { kind: 'note', title: 'Запис Claude без тексту' }))
  put('case', await rpc('cases.create', { title: 'Кейс без деталей' }))
  put('template', await rpc('templates.create', { title: 'Шаблон без тексту', body: '' }))
  put('redflag', await rpc('redflags.create', { title: 'Прапорець без ознак' }))
  put('word', await rpc('english.create', { term: 'bare word' }))
  put('component', await rpc('components.create', { title: 'Компонент без коду' }))
  put('client', await rpc('clients.create', { name: 'Клієнт без даних' }))
  put('project', await rpc('projects.create', { title: 'Проєкт без умов' }))
  put('application', await rpc('jobs.create', { title: 'Вакансія без деталей' }))
  put('company', await rpc('jobs.createCompany', { name: 'Компанія без даних' }))
  put('question', await rpc('jobs.createQuestion', { question: 'Питання без відповіді?' }))
  put('checklist', await rpc('checklists.create', { kind: 'template', title: 'Чек-лист без пунктів' }))
  put('moodboard', await rpc('moodboards.create', { title: 'Порожня добірка' }))
  put('event', await rpc('events.create', { title: 'Подія без деталей', startAt: Date.now() + 2 * 3600_000 }))
  if (plat) put('proposal', await rpc('proposals.create', { platformId: plat.id, jobTitle: 'Відгук без деталей' }))
  const board = await rpc('boards.create', { title: 'Дошка без опису' })
  put('board', board)
  if (board) {
    const col = first((await rpc('boards.details', board.id))?.columns)
    if (col) put('card', await rpc('cards.create', { boardId: board.id, columnId: col.id, title: 'Картка без опису' }))
  }
  return ids
}

/** Extreme content: 500-char titles, one 150-char word, huge sums, long links. Returns type → id. */
export async function seedMonsters(rpc) {
  const ids = {}
  const put = (type, rec) => rec?.id && (ids[type] = rec.id)
  const WORD = 'Суперкалiфраджилiстiкекспiалiдоцiозний'.repeat(4)
  const LONG = `${WORD} ${'дуже довга назва запису '.repeat(25)}`.slice(0, 490)
  const BODY = `${WORD}\n\n${'Довгий абзац тексту для перевірки переносу й обрізання. '.repeat(40)}`
  const URL = `https://example.com/${'very-long-path-segment-'.repeat(12)}?q=${'x'.repeat(60)}`
  const t = Date.now()
  const tag = await rpc('tags.create', { name: 'дуже-довга-мітка-без-пробілів-ааааааааааааа'.slice(0, 60), color: '#7c8cf8' })
  const tagIds = tag ? [tag.id] : []
  const plat = first(await rpc('platforms.list', {}))
  put('idea', await rpc('ideas.create', { title: LONG, body: BODY, tagIds }))
  put('note', await rpc('notes.create', { title: LONG, folder: WORD.slice(0, 90), body: BODY }))
  put('bookmark', await rpc('bookmarks.create', { title: LONG, url: URL, notes: BODY, tagIds }))
  put('snippet', await rpc('snippets.create', { title: LONG, code: `const x = '${WORD}'\n`.repeat(30), tagIds }))
  put('library', await rpc('libraries.create', { name: WORD.slice(0, 190), notes: BODY, tagIds }))
  put('fix', await rpc('fixes.create', { title: LONG, errorText: BODY }))
  put('claude', await rpc('claude.create', { kind: 'note', title: LONG, content: BODY }))
  put('case', await rpc('cases.create', { title: LONG, niche: WORD.slice(0, 90), stack: WORD.slice(0, 190), problem: BODY }))
  put('template', await rpc('templates.create', { title: LONG, body: `${BODY} {${'variable_name_'.repeat(5)}}` }))
  put('redflag', await rpc('redflags.create', { title: LONG, signs: BODY }))
  put('word', await rpc('english.create', { term: WORD.slice(0, 290), translation: BODY.slice(0, 900) }))
  put('component', await rpc('components.create', { title: LONG, description: BODY.slice(0, 5000), code: '<div/>' }))
  const client = await rpc('clients.create', { name: WORD.slice(0, 190), company: WORD.slice(0, 190), currency: 'USD' })
  put('client', client)
  const project = client
    ? await rpc('projects.create', { clientId: client.id, title: LONG, billing: 'fixed', fixedPrice: 99_999_999, currency: 'USD' })
    : null
  put('project', project)
  if (project) {
    await rpc('payments.create', { projectId: project.id, amount: 99_999_999, currency: 'USD', status: 'paid', paidAt: t })
    await rpc('credentials.create', { projectId: project.id, label: WORD.slice(0, 190), url: URL, login: WORD, secret: 'x' })
    await rpc('time.create', { projectId: project.id, startedAt: t - 7_200_000, endedAt: t - 3_600_000, description: WORD })
  }
  if (plat) put('proposal', await rpc('proposals.create', { platformId: plat.id, jobTitle: LONG, niche: WORD.slice(0, 90), coverLetter: BODY, credits: 16, sentAt: t }))
  const company = await rpc('jobs.createCompany', { name: WORD.slice(0, 190), stack: WORD.slice(0, 190) })
  put('company', company)
  put('application', await rpc('jobs.create', { title: LONG, companyId: company?.id, salaryMin: 9_000_000, salaryMax: 9_999_999, description: BODY }))
  put('question', await rpc('jobs.createQuestion', { question: LONG, answer: BODY }))
  put('checklist', await rpc('checklists.create', { kind: 'template', title: LONG, description: BODY.slice(0, 5000) }))
  put('moodboard', await rpc('moodboards.create', { title: LONG }))
  put('event', await rpc('events.create', { title: LONG, description: BODY.slice(0, 5000), startAt: t + 3_600_000 }))
  await rpc('finance.createSubscription', { title: LONG.slice(0, 290), amount: 999_999, billingDay: 3 })
  await rpc('finance.createExpense', { title: LONG.slice(0, 290), amount: 99_999_999, at: t })
  const board = await rpc('boards.create', { title: LONG, description: BODY.slice(0, 5000) })
  put('board', board)
  if (board) {
    const col = first((await rpc('boards.details', board.id))?.columns)
    if (col) put('card', await rpc('cards.create', { boardId: board.id, columnId: col.id, title: LONG, description: BODY.slice(0, 5000), dueAt: t, tagIds }))
  }
  return ids
}

/**
 * Designs need images: draws `count` UI-like mock screenshots on a canvas inside the app window and
 * imports them, so galleries and moodboards look like real use. `page` is the Playwright window.
 */
export async function seedDesigns(page, count = 6) {
  return page.evaluate(async (n) => {
    const palettes = [
      ['#0f1115', '#d4f542', '#2a2d33'], ['#f6f4ef', '#1f6feb', '#d9d4c7'], ['#111827', '#f472b6', '#374151'],
      ['#fafafa', '#16a34a', '#e5e7eb'], ['#1c1917', '#f59e0b', '#44403c'], ['#eef2ff', '#6366f1', '#c7d2fe']
    ]
    const made = []
    for (let i = 0; i < n; i++) {
      const [bg, accent, muted] = palettes[i % palettes.length]
      const c = document.createElement('canvas')
      c.width = 1200
      c.height = 800
      const g = c.getContext('2d')
      g.fillStyle = bg
      g.fillRect(0, 0, 1200, 800)
      g.fillStyle = muted
      g.fillRect(40, 30, 1120, 50)
      g.fillStyle = accent
      g.fillRect(60, 130, 520, 70)
      g.fillStyle = muted
      for (let r = 0; r < 3; r++) g.fillRect(60 + r * 370, 260, 340, 220)
      g.fillStyle = accent
      g.fillRect(60, 540, 200, 50)
      g.fillStyle = muted
      g.fillRect(60, 620, 1080, 140)
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'))
      const data = new Uint8Array(await blob.arrayBuffer())
      const r = await window.vault.rpc('designs.importImage', {
        source: { kind: 'bytes', name: `mock-${i + 1}.png`, mime: 'image/png', data },
        input: { title: i % 3 === 0 ? '' : `Макет ${i + 1}`, kind: ['site', 'landing', 'shop', 'app', 'dashboard', 'other'][i % 6] }
      })
      if (r.ok) made.push(r.data.id)
    }
    return made
  }, count)
}

/** One existing record id per entity type (the demo seed's), for «normal» detail screenshots. */
export async function demoIds(rpc, exclude = new Set()) {
  const LISTS = {
    idea: ['ideas.list', {}], board: ['boards.list', {}], card: ['cards.due', { from: 0, to: 9e15 }],
    claude: ['claude.list', {}], library: ['libraries.list', {}], component: ['components.list', {}],
    design: ['designs.list', {}], moodboard: ['moodboards.list', {}], snippet: ['snippets.list', {}],
    client: ['clients.list', {}], project: ['projects.list', {}], checklist: ['checklists.list', { kind: 'template' }],
    fix: ['fixes.list', {}], bookmark: ['bookmarks.list', {}], word: ['english.list', {}], event: ['events.list', {}],
    note: ['notes.list', {}], proposal: ['proposals.list', {}], template: ['templates.list', {}], case: ['cases.list', {}],
    redflag: ['redflags.list', {}], application: ['jobs.list', {}], company: ['jobs.companies', {}],
    question: ['jobs.questions', {}]
  }
  const ids = {}
  for (const [type, [path, arg]] of Object.entries(LISTS)) {
    const list = await rpc(path, arg)
    const items = Array.isArray(list) ? list : (list?.items ?? [])
    const pick = items.find((x) => x?.id && !exclude.has(x.id))
    if (pick) ids[type] = pick.id
  }
  return ids
}
