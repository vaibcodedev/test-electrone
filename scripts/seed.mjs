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

  await call('pins.toggle', { ref: { type: 'snippet', id: snip.id }, kind: 'pin' })
  const hits = await call('search.query', { text: 'hydro' })
  if (!hits.length) throw new Error('search returned nothing')
  const ov = await call('projects.overview')
  console.log('seed ok; search hits:', hits.length, 'week minutes:', ov.weekMinutes)
}
