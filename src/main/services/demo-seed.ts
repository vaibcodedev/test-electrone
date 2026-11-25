/**
 * «Заповнити демо-даними» in «Тестовий режим»: example records in every section, through the same public API
 * the windows use (validation, search index and links included). Only creating calls — no checks, no secrets,
 * no backups, no trash or import round trips (scripts/seed.mjs does those as a smoke test).
 */
import type { Api } from '@shared/api'
import { PALETTE } from '@shared/colors'
import type { ProfileKind } from '@shared/domain/sandbox'
import type { SeedLedger } from '../core/config-store'
import type { EventBus } from '../core/event-bus'
import { log } from '../core/logger'
import { addDays, startOfDay, UserError } from '../core/util'

/** Seed-ledger key: the demo set is added once per test database. */
export const DEMO_SEED_KEY = 'demo'

/** Local time `hour`:00, `days` from today (DST-safe: addDays, not + n * DAY_MS). */
function at(days: number, hour: number): number {
  const d = new Date(addDays(startOfDay(Date.now()), days))
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

export class DemoSeedService {
  constructor(
    private readonly api: () => Api,
    private readonly ledger: SeedLedger,
    private readonly bus: EventBus,
    private readonly imagePath: string
  ) {}

  async fill(profile: ProfileKind): Promise<{ created: number }> {
    if (profile !== 'sandbox') throw new UserError('Демо-дані додаються лише в тестовому режимі')
    if (this.ledger.isSeeded(DEMO_SEED_KEY)) {
      throw new UserError(
        'Демо-дані вже додано. Щоб почати з порожньої бази — «Очистити тестові дані».'
      )
    }
    let created = 0
    const add = async <T>(p: Promise<T>): Promise<T> => {
      const r = await p
      created++
      return r
    }
    try {
      await this.seed(add)
    } catch (e) {
      // Whatever was created stays (and is shown); a second run would duplicate it, so the set counts as done.
      log.error('[demo]', e)
      this.ledger.markSeeded(DEMO_SEED_KEY)
      this.bus.dataChanged('all')
      throw new UserError('Демо-дані додано не повністю — подробиці в журналі')
    }
    this.ledger.markSeeded(DEMO_SEED_KEY)
    this.bus.dataChanged('all')
    return { created }
  }

  private async seed(add: <T>(p: Promise<T>) => Promise<T>): Promise<void> {
    const api = this.api()
    const [lime, blue, orange] = PALETTE

    const shopify = await add(api.tags.create({ name: 'shopify', color: lime }))
    const ui = await add(api.tags.create({ name: 'ui', color: blue }))
    const motion = await add(api.tags.create({ name: 'анімації', color: orange }))

    // Ideas, one of them turned into a board with cards.
    const idea = await add(
      api.ideas.create({
        title: 'Плагін для Shopify: швидкі прев’ю колекцій',
        body: 'Генерувати **прев’ю** колекцій з метаполів.\n\n- кеш у KV\n- маршрут Hydrogen',
        tagIds: [shopify.id],
        impact: 3
      })
    )
    await add(api.ideas.create({ title: 'Курс з Electron і SQLite', status: 'thinking' }))
    await add(api.ideas.create({ title: 'Шаблон лендингу з bento-сіткою', tagIds: [ui.id] }))
    const board = await add(api.ideas.convertToBoard(idea.id))
    const details = await api.boards.details(board.id)
    const [backlog, doing] = details?.columns ?? []
    if (backlog && doing) {
      await add(
        api.cards.create({
          boardId: board.id,
          columnId: doing.id,
          title: 'Налаштувати маршрут Hydrogen',
          priority: 'high',
          dueAt: at(0, 18),
          tagIds: [shopify.id]
        })
      )
      await add(
        api.cards.create({
          boardId: board.id,
          columnId: backlog.id,
          title: 'Зверстати картку товару',
          priority: 'medium',
          dueAt: at(1, 18)
        })
      )
      const review = await add(
        api.cards.create({
          boardId: board.id,
          columnId: backlog.id,
          title: 'Переглянути запити GraphQL',
          priority: 'urgent',
          dueAt: at(-1, 18)
        })
      )
      await add(api.cards.addCheck({ cardId: review.id, text: 'Запит products' }))
    }

    // Knowledge.
    await add(
      api.claude.create({
        kind: 'prompt',
        title: 'Рев’ю компонента за SOLID',
        content:
          'Перевір компонент на SRP і винеси логіку в хуки.\n\n```tsx\nexport function Demo() { return <div/> }\n```',
        works: true
      })
    )
    const snippet = await add(
      api.snippets.create({
        title: 'Hydrogen: запит колекції',
        language: 'graphql',
        code: 'query Collection($handle: String!) {\n  collection(handle: $handle) { id title }\n}',
        tagIds: [shopify.id]
      })
    )
    await add(
      api.links.create({ fromType: 'board', fromId: board.id, toType: 'snippet', toId: snippet.id })
    )
    await add(
      api.libraries.create({
        name: 'motion',
        purpose: 'Анімації для React',
        npmUrl: 'https://www.npmjs.com/package/motion',
        installCmd: 'npm i motion',
        status: 'used',
        tagIds: [motion.id, ui.id]
      })
    )
    await add(
      api.fixes.create({
        title: 'better-sqlite3 не збирається під Electron',
        errorText: 'NODE_MODULE_VERSION mismatch',
        solution: 'У v13 є N-API prebuilds — перезбирати не треба.',
        context: 'Electron'
      })
    )
    await add(
      api.bookmarks.create({
        title: 'Чекліст безпеки Electron',
        url: 'https://www.electronjs.org/docs/latest/tutorial/security',
        status: 'in_progress',
        progress: 40
      })
    )
    await add(
      api.notes.create({ title: 'Як оформлювати рахунки', folder: 'Робота', body: 'Рахунок — до 5 числа.' })
    )

    // English and calendar.
    await add(
      api.english.create({
        term: 'to roll back',
        translation: 'відкотити',
        example: 'We had to roll back the deploy.'
      })
    )
    await add(api.english.create({ term: 'flaky test', translation: 'нестабільний тест' }))
    await add(api.events.create({ title: 'Дзвінок із клієнтом', startAt: at(1, 11), remindMinutes: 15 }))

    // CRM: a client with a project, time and payments.
    const client = await add(
      api.clients.create({
        name: 'Анна Петренко',
        company: 'Bloom Store',
        currency: 'USD',
        defaultRate: 40
      })
    )
    const project = await add(
      api.projects.create({
        clientId: client.id,
        title: 'Bloom Store — редизайн',
        rate: 40,
        dueAt: at(5, 18)
      })
    )
    await add(
      api.time.create({
        projectId: project.id,
        startedAt: at(-1, 10),
        endedAt: at(-1, 13),
        description: 'Верстка'
      })
    )
    await add(api.payments.create({ projectId: project.id, amount: 500, status: 'paid' }))
    await add(api.payments.create({ projectId: project.id, amount: 300, dueAt: at(2, 12) }))

    // Media: a component, a design with a moodboard.
    await add(
      api.components.create({
        title: 'Лаймова кнопка зі стрілкою',
        language: 'tsx',
        code: `export default function Demo() {
  return (
    <button className="rounded-full bg-lime-300 px-5 py-2 font-medium text-neutral-900">
      Підтвердити
    </button>
  )
}`,
        tagIds: [ui.id]
      })
    )
    const design = await add(
      api.designs.importImage({
        source: { kind: 'path', path: this.imagePath },
        input: { title: 'Іконка Vault', kind: 'app', colors: ['#14160f', lime], tagIds: [ui.id] }
      })
    )
    const board2 = await add(api.moodboards.create({ title: 'Лайм і графіт' }))
    await api.moodboards.addDesigns({ moodboardId: board2.id, designIds: [design.id] })

    // A checklist run from the first seeded template, attached to the project.
    const template = (await api.checklists.list({ kind: 'template' }))[0]
    if (template) {
      await add(
        api.checklists.instantiate({
          templateId: template.id,
          title: 'Bloom Store — запуск',
          projectId: project.id
        })
      )
    }

    // Freelance: proposals on the seeded Upwork platform.
    const upwork = (await api.platforms.list()).find((p) => p.kind === 'upwork')
    if (upwork) {
      await add(
        api.proposals.create({
          platformId: upwork.id,
          jobTitle: 'Next.js dashboard for SaaS',
          niche: 'Next.js',
          credits: 16,
          bidAmount: 1200,
          clientName: 'Mark Stone',
          clientCountry: 'USA',
          sentAt: at(-6, 12)
        })
      )
      await add(
        api.proposals.create({
          platformId: upwork.id,
          jobTitle: 'Telegram bot for orders',
          niche: 'Боти',
          credits: 10,
          status: 'replied',
          sentAt: at(-2, 12)
        })
      )
    }

    // Job search: a company, a vacancy on a seeded board, a question to practise.
    const company = await add(api.jobs.createCompany({ name: 'Grammarly', stack: 'React, TS' }))
    const djinni = (await api.jobs.boards()).find((b) => b.name === 'Djinni')
    await add(
      api.jobs.create({
        title: 'Middle Frontend Developer',
        companyId: company.id,
        boardId: djinni?.id,
        salaryMin: 2500,
        salaryMax: 3500
      })
    )
    await add(
      api.jobs.createQuestion({
        category: 'technical',
        topic: 'React',
        question: 'Чим useMemo відрізняється від useCallback?',
        answer: 'useMemo кешує значення, useCallback — саму функцію.',
        companyId: company.id
      })
    )
  }
}
