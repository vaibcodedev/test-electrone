import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * «Чат ШІ» against a stub OpenAI-compatible server on this computer (a local address: no consent question,
 * nothing leaves the machine): an action card creates an idea only on «Застосувати», and «Шукати в моїй базі»
 * answers with a link to the record it found.
 */

const panel = (win: Page): Locator => win.locator('#ai-chat')
const composer = (win: Page): Locator =>
  panel(win).getByRole('textbox', { name: 'Повідомлення для ШІ' })

interface ChatRequest {
  messages: { role: string; content: string }[]
}

/** Four sections, twelve steps: what a model answers to «Додай шаблон чек-листа для лендингу». */
const LANDING = [
  {
    title: 'Контент',
    items: [
      'Тексти вичитано',
      { text: 'Фавікон і og:image', hint: 'Прев’ю в Telegram' },
      'Контакти'
    ]
  },
  { title: 'Дизайн', items: ['Мобільна версія', 'Темна тема', 'Шрифти'] },
  { title: 'Технічне', items: ['Lighthouse ≥ 90', 'Форма надсилає заявки', 'Аналітика'] },
  { title: 'Запуск', items: ['Домен і HTTPS', 'Редіректи', 'Резервна копія'] }
]

/**
 * Answers like a model: an action block for «додай ідею», a checklist template for «чек-листа», a citation when
 * the base results come with it. `systems` — the system prompts it got (the app map, the current page).
 */
function stubServer(token: string, prompts: string[], systems: string[] = []): Server {
  return createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const data = JSON.parse(body) as ChatRequest
      const last = data.messages.at(-1)?.content ?? ''
      prompts.push(last)
      systems.push(data.messages[0]?.content ?? '')
      const block = (actions: unknown[]): string =>
        ['```vault-actions', JSON.stringify({ actions }), '```'].join('\n')
      const content = last.includes('<base_results>')
        ? 'Так, це записано в нотатці [1].'
        : last.includes('чек-листа')
          ? `Ось шаблон чек-листа.\n${block([
              { type: 'create_checklist', title: `Лендинг ${token}`, sections: LANDING },
              { type: 'create_idea', title: `Зайва ідея ${token}` }
            ])}`
          : last.includes('додай ідею')
            ? [
                'Пропоную таку ідею.',
                '```vault-actions',
                JSON.stringify({
                  actions: [
                    { type: 'create_idea', title: `Кеш запитів ${token}`, body: 'React Query' }
                  ]
                }),
                '```'
              ].join('\n')
            : 'Привіт!'
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          model: 'stub',
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 40, completion_tokens: 10 }
        })
      )
    })
  })
}

test.afterEach(async ({ vault }) => {
  await vault.rpc('ai.setConfig', {
    enabled: false,
    preset: 'gemini',
    baseUrl: '',
    model: '',
    dailyLimit: 100
  })
  await vault.win.reload()
  await vault.win.waitForFunction(
    () => typeof (window as unknown as { vault?: { rpc?: unknown } }).vault?.rpc === 'function'
  )
})

test('the chat proposes an idea, and only «Застосувати» creates it; «Шукати в моїй базі» cites a record', async ({
  vault
}) => {
  const { win, go, rpc } = vault
  const token = uid()
  const prompts: string[] = []
  const server = stubServer(token, prompts)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    // Off: the panel leads to the settings instead of a dead composer.
    await go('/')
    await win.keyboard.press('Control+J')
    await expect(panel(win).getByText('ШІ вимкнено')).toBeVisible()
    await expect(panel(win).getByRole('button', { name: 'Відкрити налаштування' })).toBeVisible()
    await win.keyboard.press('Control+J')
    await expect(panel(win)).toHaveCount(0)

    const { port } = server.address() as AddressInfo
    await rpc('ai.setConfig', {
      enabled: true,
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'stub'
    })
    const note = await rpc('notes.create', {
      title: `Docker на Windows ${token}`,
      body: `Для Docker потрібен WSL2 ${token}`
    })
    await win.reload()
    await win.waitForFunction(
      () => typeof (window as unknown as { vault?: { rpc?: unknown } }).vault?.rpc === 'function'
    )

    // «ШІ» in the title bar opens the panel with the focus in the composer.
    await go('/')
    await win.getByRole('button', { name: 'Чат ШІ' }).click()
    await expect(composer(win)).toBeFocused()
    await composer(win).fill(`додай ідею про кеш ${token}`)
    await composer(win).press('Enter')

    const card = panel(win).locator('[data-ai-action="create_idea"]')
    await expect(card).toContainText('Ідея ·')
    await expect(card).toContainText(`Кеш запитів ${token}`)
    // Nothing is in the base until the click.
    const titles = async (): Promise<string[]> =>
      ((await rpc('ideas.list', { search: token })) as { title: string }[]).map((i) => i.title)
    expect(await titles()).toEqual([])
    await card.getByRole('button', { name: 'Застосувати' }).click()
    await expect(win.getByText('Ідею створено')).toBeVisible()
    await expect(card).toContainText(`Створено: Ідея «Кеш запитів ${token}»`)
    await expect.poll(titles).toEqual([`Кеш запитів ${token}`])

    // Ctrl+K «Спитати ШІ: …»: a new chat that searches the base and links the note it found.
    await win.keyboard.press('Control+K')
    const palette = win.getByRole('dialog')
    await palette.getByRole('combobox').fill(`WSL2 ${token}`)
    await palette.getByRole('option', { name: `Спитати ШІ: WSL2 ${token}` }).click()
    await expect(panel(win).getByText('Так, це записано в нотатці')).toBeVisible()
    const cited = panel(win).locator('[data-wikilink="live"]', { hasText: note.title })
    await expect(cited).toBeVisible()
    await expect(panel(win).getByText('Джерела з бази')).toBeVisible()
    expect(prompts.at(-1)).toContain(`[1] Нотатка «${note.title}»`)
    await expect(panel(win).getByRole('button', { name: 'Шукати в моїй базі' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // A citation opens the record; Esc in the composer closes the panel.
    await cited.click()
    await expect(win).toHaveURL(new RegExp(`/notes\\?open=${note.id}`))
    await composer(win).focus()
    await win.keyboard.press('Escape')
    await expect(panel(win)).toHaveCount(0)
    expect((await rpc('ai.status')).usage.requests).toBeGreaterThanOrEqual(2)
  } finally {
    server.close()
  }
})

test('a checklist template: the card sums it up, the preview shows it whole, «Змінити» renames it before «Застосувати»', async ({
  vault
}) => {
  const { win, go, rpc } = vault
  const token = uid()
  const prompts: string[] = []
  const systems: string[] = []
  const server = stubServer(token, prompts, systems)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    const { port } = server.address() as AddressInfo
    await rpc('ai.setConfig', {
      enabled: true,
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'stub'
    })
    await win.reload()
    await win.waitForFunction(
      () => typeof (window as unknown as { vault?: { rpc?: unknown } }).vault?.rpc === 'function'
    )
    // Asked on «Чек-листи»: the model is told where the person is and what the app has.
    await go('/checklists')
    await win.keyboard.press('Control+J')
    await composer(win).fill('Додай шаблон чек-листа для створення лендингу. Достатньо детальний.')
    await composer(win).press('Enter')

    const card = panel(win).locator('[data-ai-action="create_checklist"]')
    await expect(card).toContainText('Чек-лист · 12 пунктів у 4 розділах')
    await expect(card).toContainText(`Лендинг ${token}`)
    expect(systems.at(-1)).toContain('The person is now on «Інструменти › Чек-листи»')
    expect(systems.at(-1)).toContain('create_checklist')

    // «Переглянути»: every section and step, as the checklist page shows them.
    await card.getByRole('button', { name: 'Переглянути' }).click()
    const dialog = win.getByRole('dialog')
    for (const s of LANDING)
      await expect(dialog.getByRole('heading', { name: s.title })).toBeVisible()
    await expect(dialog.getByText('Прев’ю в Telegram')).toBeVisible()
    await expect(dialog.getByRole('checkbox')).toHaveCount(12)

    // «Змінити»: the title, with the form's limits; the edited one is what gets applied.
    await dialog.getByRole('radio', { name: 'Змінити' }).click()
    const title = dialog.getByRole('textbox', { name: 'Назва' })
    await title.fill(`Запуск лендингу ${token}`)
    await dialog.getByRole('radio', { name: 'Перегляд' }).click()
    await expect(dialog.getByRole('heading', { name: `Запуск лендингу ${token}` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Застосувати' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(card).toContainText(`Створено: Чек-лист «Запуск лендингу ${token}»`)
    const lists = (await rpc('checklists.list', { kind: 'template', search: token })) as {
      title: string
      total: number
    }[]
    expect(lists.map((l) => [l.title, l.total])).toEqual([[`Запуск лендингу ${token}`, 12]])

    // «Скасувати» folds the other card into one line; «Повернути» brings it back.
    const idea = panel(win).locator('[data-ai-action="create_idea"]')
    await idea.getByRole('button', { name: 'Скасувати' }).click()
    await expect(idea).toContainText(`Скасовано: Ідея «Зайва ідея ${token}»`)
    await idea.getByRole('button', { name: 'Повернути' }).click()
    await expect(idea.getByRole('button', { name: 'Застосувати' })).toBeVisible()
    expect(((await rpc('ideas.list', { search: token })) as unknown[]).length).toBe(0)
  } finally {
    server.close()
  }
})
