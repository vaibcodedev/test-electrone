/** Demo data through the public RPC API — doubles as a backend smoke test. */
export async function seed(rpc) {
  const call = async (path, arg) => {
    const r = await rpc(path, arg)
    if (!r.ok) throw new Error(`${path}: ${r.error}`)
    return r.data
  }
  const today = new Date()
  today.setHours(18, 0, 0, 0)
  const t = today.getTime()

  const shopify = await call('tags.create', { name: 'shopify', color: '#d4f542' })
  const ui = await call('tags.create', { name: 'ui', color: '#7c8cf8' })
  const anim = await call('tags.create', { name: 'анимации', color: '#f5a524' })

  const idea = await call('ideas.create', {
    title: 'Плагин для Shopify: быстрые превью коллекций',
    body: 'Генерировать **превью** коллекций из метафилдов.\n\n- кеш в KV\n- hydrogen route',
    tagIds: [shopify.id],
    impact: 3
  })
  await call('ideas.create', { title: 'Курс по Electron + SQLite', status: 'thinking' })
  await call('ideas.create', { title: 'Шаблон лендинга с bento-сеткой', tagIds: [ui.id] })

  const board = await call('ideas.convertToBoard', idea.id)
  const details = await call('boards.details', board.id)
  const [backlog, doing] = details.columns
  await call('cards.create', { boardId: board.id, columnId: doing.id, title: 'Настроить Hydrogen маршрут', priority: 'high', dueAt: t, tagIds: [shopify.id] })
  await call('cards.create', { boardId: board.id, columnId: backlog.id, title: 'Сверстать карточку товара', priority: 'medium', dueAt: t })
  const c3 = await call('cards.create', { boardId: board.id, columnId: backlog.id, title: 'Ревью GraphQL запросов', priority: 'urgent', dueAt: t - 86400000 })
  await call('cards.addCheck', { cardId: c3.id, text: 'products query' })

  await call('claude.create', {
    kind: 'prompt',
    title: 'Ревью компонента по SOLID',
    content: 'Проверь компонент на SRP и вынеси логику в хуки.\n\n```tsx\nexport function Demo() { return <div/> }\n```',
    works: true
  })
  const snip = await call('snippets.create', {
    title: 'Hydrogen: запрос коллекции',
    language: 'graphql',
    code: 'query Collection($handle: String!) {\n  collection(handle: $handle) { id title }\n}',
    tagIds: [shopify.id]
  })
  await call('links.create', { fromType: 'board', fromId: board.id, toType: 'snippet', toId: snip.id })
  await call('libraries.create', {
    name: 'motion',
    purpose: 'Анимации для React',
    npmUrl: 'https://www.npmjs.com/package/motion',
    installCmd: 'npm i motion',
    status: 'used',
    tagIds: [anim.id, ui.id]
  })
  await call('fixes.create', {
    title: 'better-sqlite3 не собирается под Electron',
    errorText: 'NODE_MODULE_VERSION mismatch',
    solution: 'В v13 есть N-API prebuilds — пересборка не нужна.',
    context: 'Electron'
  })
  await call('bookmarks.create', { title: 'Electron security checklist', url: 'https://www.electronjs.org/docs/latest/tutorial/security', status: 'in_progress', progress: 40 })
  await call('english.create', { term: 'to roll back', translation: 'откатить', example: 'We had to roll back the deploy.' })
  await call('english.create', { term: 'flaky test', translation: 'нестабильный тест' })
  await call('events.create', { title: 'Созвон с клиентом', startAt: t - 3 * 3600000, remindMinutes: 15 })

  const client = await call('clients.create', { name: 'Анна Петренко', company: 'Bloom Store', currency: 'USD', defaultRate: 40 })
  const project = await call('projects.create', { clientId: client.id, title: 'Bloom Store — редизайн', rate: 40, dueAt: t + 5 * 86400000 })
  await call('time.create', { projectId: project.id, startedAt: t - 5 * 3600000, endedAt: t - 2 * 3600000, description: 'Вёрстка' })
  await call('payments.create', { projectId: project.id, amount: 500, status: 'paid' })
  await call('payments.create', { projectId: project.id, amount: 300, dueAt: t + 2 * 86400000 })
  await call('credentials.create', { projectId: project.id, label: 'Shopify admin', login: 'anna@bloom.store', secret: 's3cret!' })
  const secretId = (await call('credentials.list', { projectId: project.id }))[0].id
  const secret = await call('credentials.reveal', secretId)
  if (secret !== 's3cret!') throw new Error('credential roundtrip failed')

  await call('components.create', {
    title: 'Лаймовая кнопка со стрелкой',
    language: 'tsx',
    code: `import { ArrowUpRight } from 'lucide-react'

export default function Demo() {
  return (
    <button className="flex items-center gap-3 rounded-full bg-[#d4f542] py-2 pl-5 pr-2 font-medium text-[#14160f]">
      Confirm return
      <span className="grid size-8 place-items-center rounded-full bg-[#14160f] text-[#d4f542]">
        <ArrowUpRight size={16} />
      </span>
    </button>
  )
}`,
    tagIds: [ui.id]
  })
  const { resolve } = await import('path')
  const design = await call('designs.importImage', {
    source: { kind: 'path', path: resolve('resources/icon.png') },
    input: { title: 'Иконка Vault', kind: 'app', colors: ['#14160f', '#d4f542'], tagIds: [ui.id] }
  })
  const mb = await call('moodboards.create', { title: 'Лайм и графит' })
  await call('moodboards.addDesigns', { moodboardId: mb.id, designIds: [design.id] })
  const tpl = (await call('checklists.list', { kind: 'template' }))[0]
  await call('checklists.instantiate', { templateId: tpl.id, title: 'Bloom Store — запуск', projectId: project.id })

  await call('pins.toggle', { ref: { type: 'snippet', id: snip.id }, kind: 'pin' })
  const hits = await call('search.query', { text: 'hydro' })
  if (!hits.length) throw new Error('search returned nothing')
  const ov = await call('projects.overview')
  // trash roundtrip
  const extra = await call('ideas.create', { title: 'Временная идея' })
  await call('ideas.remove', extra.id)
  if (!(await call('trash.list')).some((i) => i.id === extra.id)) throw new Error('trash missing item')
  await call('trash.restore', { type: 'idea', id: extra.id })
  if (!(await call('ideas.get', extra.id))) throw new Error('restore failed')
  await call('ideas.remove', extra.id)
  await call('trash.purge', { type: 'idea', id: extra.id })
  // backup
  const backup = await call('backup.create', { saveAs: false })
  if (!backup || backup.size < 1000) throw new Error('backup too small')
  console.log('backup', backup.fileName, backup.size)

  // ── freelance & finance
  const plats = await call('platforms.list')
  const upwork = plats.find((x) => x.kind === 'upwork')
  if (!upwork) throw new Error('upwork platform not seeded')
  const tpls = await call('templates.list', { situation: 'proposal' })
  await call('credits.add', { platformId: upwork.id, kind: 'purchase', amount: 80, cost: 12, at: t - 10 * 86400000 })
  const p1 = await call('proposals.create', {
    platformId: upwork.id, jobTitle: 'Next.js dashboard for SaaS', niche: 'Next.js', credits: 16, boostCredits: 8,
    bidAmount: 1200, feePercent: 10, templateId: tpls[0]?.id ?? null, clientName: 'Mark Stone', clientCountry: 'USA',
    clientRating: 4.9, clientSpent: 25000, paymentVerified: true, sentAt: t - 6 * 86400000, checks: ['verified', 'rating']
  })
  await call('proposals.create', { platformId: upwork.id, jobTitle: 'Shopify theme fixes', niche: 'Shopify', credits: 12, sentAt: t - 5 * 86400000 })
  await call('proposals.create', { platformId: upwork.id, jobTitle: 'Telegram bot for orders', niche: 'Боты', credits: 10, status: 'replied', sentAt: t - 2 * 86400000 })
  await call('proposals.update', { id: p1.id, patch: { status: 'interview' } })
  const hired = await call('proposals.hire', { proposalId: p1.id, title: 'SaaS dashboard (Upwork)', billing: 'fixed', amount: 1200, feePercent: 10 })
  await call('payments.create', { projectId: hired.projectId, amount: 600, status: 'paid' })
  const cs = await call('credits.summary', { platformId: upwork.id })
  if (cs.spent !== 46 || cs.contracts !== 1) throw new Error('credits summary wrong ' + JSON.stringify(cs))
  const st = await call('freelance.stats', { platformId: upwork.id })
  if (st.totals.sent !== 3 || st.totals.hired !== 1) throw new Error('stats wrong ' + JSON.stringify(st.totals))
  await call('goals.create', { metric: 'proposals', period: 'week', target: 10 })
  const gp = await call('goals.progress')
  const sub = await call('finance.createSubscription', { title: 'Claude Max', amount: 100, billingDay: 5 })
  await call('finance.createSubscription', { title: 'Телефон', amount: 300, currency: 'UAH', billingDay: 20, category: 'phone' })
  const monthKey = new Date().toISOString().slice(0, 7)
  await call('finance.setSubscriptionPaid', { id: sub.id, month: monthKey, paid: true })
  await call('finance.createWithdrawal', { platformId: upwork.id, amount: 500, fee: 2, rate: 41.5, at: t })
  const rep = await call('finance.month', { month: monthKey })
  if (rep.net.USD !== 1040) throw new Error('net wrong ' + JSON.stringify(rep.net))
  await call('notes.create', { title: 'Как оформлять счета', folder: 'Работа', body: 'Счёт до 5 числа.' })
  const fov = await call('finance.overview')
  console.log('freelance ok: goals', gp.length, 'profit', JSON.stringify(rep.profit), 'balances', JSON.stringify(fov.platformBalances))

  // ── job search
  const jb = await call('jobs.boards')
  const djinni = jb.find((b) => b.name === 'Djinni')
  if (!djinni) throw new Error('job boards not seeded')
  const co = await call('jobs.createCompany', { name: 'Grammarly', stack: 'React, TS' })
  const cv = await call('jobs.createResume', { input: { title: 'v1 Frontend', changes: 'Первая версия', isCurrent: true } })
  await call('jobs.setResumeUploaded', { resumeId: cv.id, boardId: djinni.id, uploaded: true })
  const app = await call('jobs.create', { title: 'Middle Frontend Developer', companyId: co.id, boardId: djinni.id, resumeId: cv.id, salaryMin: 2500, salaryMax: 3500 })
  await call('jobs.create', { title: 'React Developer', companyName: 'Acme', boardId: djinni.id })
  const interviewAt = t + 86400000
  const stage = await call('jobs.addStage', { applicationId: app.id, kind: 'technical', at: interviewAt, durationMin: 90 })
  if (!stage.eventId) throw new Error('stage has no calendar event')
  const feed = await call('events.feed', { from: t, to: t + 3 * 86400000 })
  const item = feed.find((i) => i.source === 'interview')
  if (!item || item.ref.type !== 'application') throw new Error('interview missing in calendar feed')
  // move it in the calendar → stage follows
  await call('events.update', { id: stage.eventId, patch: { startAt: interviewAt + 3600000, endAt: interviewAt + 3600000 + 90 * 60000 } })
  const appDetails = await call('jobs.get', app.id)
  if (appDetails.stages[0].at !== interviewAt + 3600000) throw new Error('calendar → stage sync failed')
  if (appDetails.status !== 'interview') throw new Error('status should be interview, got ' + appDetails.status)
  const daily = await call('jobs.daily', { days: 7 })
  const dj = daily.find((b) => b.id === djinni.id)
  if (!dj.today.done || dj.today.applied !== 2) throw new Error('daily habit wrong ' + JSON.stringify(dj.today))
  const dou = daily.find((b) => b.name === 'DOU')
  await call('jobs.checkin', { boardId: dou.id, day: dou.today.day, checked: true })
  await call('jobs.createQuestion', { category: 'technical', topic: 'React', question: 'Чем useMemo отличается от useCallback?', answer: 'useMemo кеширует значение…', applicationId: app.id, companyId: co.id })
  const pq = await call('jobs.practiceQueue')
  await call('jobs.reviewQuestion', { id: pq[0].id, grade: 2 })
  const js = await call('jobs.stats')
  const jo = await call('jobs.overview')
  const resumes = await call('jobs.resumes')
  // Companies are unique by name (case-insensitive): a second create returns the same record.
  const coA = await call('jobs.createCompany', { name: 'Dedupe Test Co' })
  const coB = await call('jobs.createCompany', { name: '  dedupe test co ' })
  if (coA.id !== coB.id) throw new Error('company dedupe failed')
  const pageOne = await call('jobs.companies', { limit: 1, offset: 0 })
  if (pageOne.length !== 1) throw new Error('companies paging failed')
  console.log('jobs ok: applied', js.totals.applied, 'interviews', js.totals.interview, 'upcoming', jo.upcoming.length, 'resume sent', resumes[0].sent)

  // ── dev projects, capture bridge, weekly review
  const { resolve: res } = await import('path')
  const proj = await call('devProjects.create', { name: 'Vault', path: res('.') })
  if (!proj.scripts.dev || !proj.git) throw new Error('project scan failed ' + JSON.stringify({ scripts: Object.keys(proj.scripts), git: proj.git }))
  // The installed Vault may already hold the default port: use a free random one for the test instance.
  // Free shortcut + random port: parallel test runs (and the installed Vault) must not collide.
  for (const key of ['F12', 'F11', 'F10', 'F9', 'F8']) {
    const r = await rpc('settings.update', { capturePort: 47300 + Math.floor(Math.random() * 500), quickAddShortcut: `CommandOrControl+Alt+Shift+${key}` })
    if (r.ok) break
  }
  const cap = await call('capture.info')
  const base = `http://127.0.0.1:${cap.port}`
  let ping = null
  for (let i = 0; i < 10 && !ping; i++) {
    try {
      ping = await (await fetch(`${base}/ping`, { headers: { 'X-Vault-Key': cap.token } })).json()
    } catch {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  if (!ping?.ok) throw new Error('capture /ping failed')
  const bad = await fetch(`${base}/ping`, { headers: { 'X-Vault-Key': 'wrong' } })
  if (bad.status !== 401) throw new Error('capture accepted a wrong key')
  const saved = await (
    await fetch(`${base}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Vault-Key': cap.token },
      body: JSON.stringify({ target: 'bookmark', url: 'https://www.youtube.com/watch?v=abc', title: 'Видео про Electron', tags: ['electron'] })
    })
  ).json()
  if (!saved.ok || saved.type !== 'bookmark') throw new Error('capture failed ' + JSON.stringify(saved))
  const week = await call('review.get')
  console.log('dev ok: scripts', Object.keys(proj.scripts).length, 'branch', proj.git.branch, '| capture ok', saved.title, '| review sections', week.snapshot.sections.length)

  // ── JSON import: one example per kind, plus a rejected payload (all-or-nothing validation)
  const samples = {
    checklist: { title: 'Імпорт: реліз', sections: [{ title: 'Код', items: ['Тести зелені', { text: 'Changelog', hint: 'коротко' }] }] },
    question: { items: [{ question: 'Що таке замикання?', answer: 'Функція + лексичне оточення', group: 'technical', topic: 'JS' }] },
    word: [{ term: 'rollout', translation: 'викатка' }],
    snippet: [{ title: 'Імпорт: hello', language: 'typescript', code: 'console.log(1)' }],
    template: [{ title: 'Імпорт: фолоуап', situation: 'follow_up', body: 'Hi {name}' }],
    redflag: [{ title: 'Імпорт: без оплати', severity: 3 }],
    idea: [{ title: 'Імпорт: ідея', description: 'опис' }],
    bookmark: [{ title: 'Імпорт: Electron docs', url: 'https://www.electronjs.org/docs', kind: 'docs' }],
    library: [{ name: 'imported-lib', status: 'want' }]
  }
  for (const [kind, payload] of Object.entries(samples)) {
    const res = await call('importer.run', { kind, payload })
    if (!res.created || !res.firstId) throw new Error(`import ${kind} failed ` + JSON.stringify(res))
  }
  let rejected = false
  try {
    await call('importer.run', { kind: 'word', payload: [{ term: 'ok' }, { translation: 'no term' }] })
  } catch {
    rejected = true
  }
  if (!rejected) throw new Error('import accepted an invalid payload')
  const imported = await call('english.list', { search: 'no term' })
  console.log('import ok:', Object.keys(samples).length, 'kinds, invalid rejected, partial words:', imported.length)

  // View/edit «Скасувати»: snapshot → edit → revert restores the row
  {
    const n = await call('notes.create', { title: 'Revert test', body: 'before' })
    const ref = { type: 'note', id: n.id }
    const snap = await call('records.snapshot', ref)
    await call('notes.update', { id: n.id, patch: { body: 'after' } })
    if (!(await call('records.changed', { ref, snapshot: snap }))) throw new Error('records.changed missed an edit')
    await call('records.revert', { ref, snapshot: snap })
    const back = await call('notes.get', n.id)
    if (back.body !== 'before') throw new Error('records.revert did not restore: ' + back.body)
    console.log('revert ok')
  }
  console.log('seed ok; search hits:', hits.length, 'week minutes:', ov.weekMinutes)
}
