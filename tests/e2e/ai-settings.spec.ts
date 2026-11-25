import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Locator, Page } from '@playwright/test'
import { expect, test, uid } from './fixtures'

/**
 * «Налаштування → Штучний інтелект» and «Запропонувати мітки». No real provider is called: the connection
 * check goes to a closed local port, and the tags come from a stub OpenAI-compatible server started here.
 */

const section = (win: Page): Locator => win.locator('#ai')
const pane = (win: Page): Locator => win.locator('[data-detail-mode]').first()

/** Settings changed over rpc reach a page only after a reload (the renderer caches the status for 30 s). */
async function reload(win: Page): Promise<void> {
  await win.reload()
  await win.waitForFunction(
    () => typeof (window as unknown as { vault?: { rpc?: unknown } }).vault?.rpc === 'function'
  )
}

// One app serves every spec of the run: put the AI settings back so other screens never see the button.
test.afterEach(async ({ vault }) => {
  await vault.rpc('ai.clearKey')
  await vault.rpc('ai.setConfig', {
    enabled: false,
    preset: 'gemini',
    baseUrl: '',
    model: '',
    dailyLimit: 100
  })
  await reload(vault.win)
})

test('the section is off by default; a preset brings its price, key field and link', async ({
  vault
}) => {
  const { win, go } = vault
  await go('/settings#ai')
  const ai = section(win)
  await expect(ai.getByRole('heading', { name: 'Штучний інтелект' })).toBeVisible()
  await expect(ai.getByRole('switch', { name: 'Увімкнути ШІ' })).toHaveAttribute(
    'aria-checked',
    'false'
  )
  await expect(ai.getByText('Вимкнено — нічого нікуди не надсилається')).toBeVisible()
  await expect(ai.getByRole('combobox', { name: 'Провайдер' })).toHaveText(
    /Google Gemini — безкоштовно/
  )
  await expect(ai.getByText(/Google навчається на ваших текстах/)).toBeVisible()
  await expect(
    ai.getByRole('button', { name: /Отримати ключ на aistudio\.google\.com/ })
  ).toBeVisible()

  // A saved key comes back only as its last four characters.
  await ai.getByLabel('Ключ Google Gemini').fill('AIzaTEST-e2e-9z8y')
  await ai.getByRole('button', { name: 'Зберегти' }).click()
  await expect(ai.getByText('Ключ збережено ••••9z8y')).toBeVisible()
  expect(await win.content()).not.toContain('AIzaTEST')
  await ai.getByRole('button', { name: 'Видалити' }).click()
  await win.getByRole('alertdialog').getByRole('button', { name: 'Видалити' }).click()
  await expect(ai.getByLabel('Ключ Google Gemini')).toBeVisible()

  // A local app: no key, nothing leaves the computer, the check asks whether it runs.
  await ai.getByRole('combobox', { name: 'Провайдер' }).click()
  await win.getByRole('option', { name: 'Ollama — на цьому комп’ютері' }).click()
  await expect(ai.getByText(/нічого не йде в інтернет/)).toBeVisible()
  await expect(ai.getByLabel(/^Ключ/)).toHaveCount(0)
  await expect(ai.getByRole('button', { name: 'Перевірити, чи запущено' })).toBeVisible()
  await expect(ai.getByText('Якщо лишити порожнім — qwen3.5:9b. Інша: gemma4:12b')).toBeVisible()
  await expect(ai.getByText('Використано сьогодні: 0 з 100 запитів')).toBeVisible()
})

test('the connection check explains a failure in plain words, without the network', async ({
  vault
}) => {
  const { win, go, rpc } = vault
  // A cloud provider without a key: stopped before any request.
  await go('/settings#ai')
  await section(win).getByRole('button', { name: 'Перевірити підключення' }).click()
  await expect(section(win).getByTestId('ai-test-result')).toHaveText(
    'Додайте ключ Google Gemini — Налаштування → Штучний інтелект'
  )

  // A local address nobody listens on: «not answering», not a stack trace.
  const ai = section(win)
  await ai.getByRole('combobox', { name: 'Провайдер' }).click()
  await win.getByRole('option', { name: 'Своя адреса (OpenAI-сумісна)' }).click()
  const address = ai.getByRole('textbox', { name: 'Адреса сервісу' })
  await address.fill('ftp://nope')
  await address.press('Enter')
  await expect(ai.getByText('Адреса має починатися з http:// або https://')).toBeVisible()
  await address.fill('http://127.0.0.1:9/v1')
  await address.press('Enter')
  await ai.getByRole('textbox', { name: 'Модель' }).fill('stub')
  await expect
    .poll(async () => {
      const s = await rpc('ai.status')
      return [s.baseUrl, s.model, s.local]
    })
    .toEqual(['http://127.0.0.1:9/v1', 'stub', true])
  await ai.getByRole('button', { name: 'Перевірити, чи запущено' }).click()
  await expect(section(win).getByTestId('ai-test-result')).toHaveText(
    'Сервіс не відповідає — перевірте адресу й чи запущено сервіс',
    { timeout: 30_000 }
  )
})

test('«Запропонувати мітки» adds a suggested tag to the record', async ({ vault }) => {
  const { win, go, rpc } = vault
  const token = uid()
  const fresh = `ai-${token}`
  const prompts: string[] = []
  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      prompts.push(body)
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          model: 'stub',
          choices: [{ message: { content: `{"tags": ["${fresh}"]}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 50, completion_tokens: 5 }
        })
      )
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  try {
    const { port } = server.address() as AddressInfo
    await rpc('ai.setConfig', {
      enabled: true,
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'stub'
    })
    const idea = await rpc('ideas.create', { title: `Кеш запитів ${token}`, body: 'React Query' })

    await reload(win)
    await go(`/ideas?open=${idea.id}`)
    // Reading a record: no button (tags change only while editing).
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    await expect(pane(win).getByRole('button', { name: 'Запропонувати мітки' })).toHaveCount(0)
    await pane(win).locator('[data-edit-detail]').click()
    await pane(win).getByRole('button', { name: 'Запропонувати мітки' }).click()
    const chip = pane(win).getByRole('button', { name: `Додати мітку «${fresh}»` })
    await expect(chip).toBeVisible()
    expect(prompts.at(-1)).toContain(`Кеш запитів ${token}`)

    await chip.click()
    await expect(chip).toHaveCount(0)
    await expect
      .poll(async () => (await rpc('ideas.get', idea.id)).tags.map((t: { name: string }) => t.name))
      .toEqual([fresh])
    await pane(win).locator('[data-save]').click()
    await expect(pane(win)).toHaveAttribute('data-detail-mode', 'view')
    expect((await rpc('ai.status')).usage.requests).toBeGreaterThanOrEqual(1)
  } finally {
    server.close()
  }
})
