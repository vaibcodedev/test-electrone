// The popup's «Під’єднати до Vault» screen: shown instead of the form while there is no working key, during
// pairing and for the self-update. Pairing itself runs in the service worker (pairing.js); this only renders
// the state it keeps in chrome.storage.session and sends the person's clicks there.
import { PAIR_KEY } from './pairing.js'

const $ = (id) => document.getElementById(id)

const MANUAL = ['Ввести ключ вручну', 'options']
/** The sign in the circle: the lime «V» and «✓» are the brand and success; the rest stay neutral. */
const MARKS = { logo: 'V', wait: '⋯', ok: '✓', no: '✕', alert: '!', update: '↻' }
const RESEND = ['Надіслати запит ще раз', 'pair']

/**
 * Every state of the screen: the mark in the circle, the words, the buttons ([label, action]).
 * `text` may take the extra data (port, version, error).
 */
const VIEWS = {
  ready: {
    mark: 'logo',
    title: 'Під’єднайте Vault',
    text: () =>
      'Vault знайдено на цьому комп’ютері. Натисніть кнопку й дозвольте доступ у вікні Vault — ключ копіювати не треба.',
    primary: ['Під’єднати до Vault', 'pair'],
    secondary: MANUAL
  },
  rekey: {
    mark: 'logo',
    title: 'Під’єднайте ще раз',
    text: () =>
      'Ключ більше не підходить: розширення відключили у Vault або там створили новий ключ. Під’єднайте його знову.',
    primary: ['Під’єднати до Vault', 'pair'],
    secondary: MANUAL
  },
  waiting: {
    mark: 'wait',
    title: 'Дозвольте доступ у Vault',
    text: () =>
      'У вікні Vault натисніть «Дозволити». Це вікно може закритися — після дозволу відкрийте розширення знову.',
    secondary: ['Скасувати', 'cancel']
  },
  approved: {
    mark: 'ok',
    title: 'Під’єднано',
    text: () => 'Розширення під’єднано до Vault. Можна зберігати.',
    primary: ['Зберегти сторінку', 'continue']
  },
  denied: {
    mark: 'no',
    title: 'Доступ відхилено',
    text: () => 'У Vault натиснули «Відхилити». Якщо це помилка — надішліть запит ще раз.',
    primary: RESEND,
    secondary: MANUAL
  },
  expired: {
    mark: 'alert',
    title: 'Час минув',
    text: () =>
      'Vault не отримав відповіді за хвилину. Надішліть запит ще раз і натисніть «Дозволити» у вікні Vault.',
    primary: RESEND,
    secondary: MANUAL
  },
  error: {
    mark: 'alert',
    title: 'Не вдалося надіслати запит',
    text: (x) => x.error || 'Спробуйте ще раз за хвилину.',
    primary: ['Спробувати ще раз', 'pair'],
    secondary: MANUAL
  },
  offline: {
    mark: 'alert',
    title: 'Vault не знайдено',
    text: (x) =>
      `Запустіть Vault на цьому комп’ютері (досить іконки в треї) і перевірте ще раз. Порт: ${x.port}.`,
    primary: ['Перевірити знову', 'retry'],
    secondary: ['Змінити порт', 'options']
  },
  unsupported: {
    mark: 'alert',
    title: 'Потрібен ключ',
    text: () =>
      'Ця версія Vault не під’єднує розширення сама. Оновіть Vault або вставте ключ вручну: Налаштування → «Розширення для Chrome».',
    primary: ['Ввести ключ вручну', 'options']
  },
  update: {
    mark: 'update',
    title: 'Оновлюю розширення',
    text: (x) =>
      `У Vault новіша версія розширення — ${x.version}. Перезапускаю його; якщо вікно не відкриється саме, натисніть іконку Vault.`
  }
}

/** Screens the result of a ping must not replace: the person is in the middle of pairing or reading its answer. */
const STICKY = new Set(['waiting', 'approved', 'denied', 'expired', 'error', 'update'])
/** Final pairing answers are shown once: the stored state is cleared after rendering them. */
const FINAL = new Set(['approved', 'denied', 'expired', 'error', 'unsupported'])

/**
 * `onContinue` — back to the form («Зберегти сторінку»); `onRetry` — ask Vault again («Перевірити знову»).
 * Returns { show, hide, applyPairing, state, sticky }.
 */
export function createConnect({ onContinue, onRetry }) {
  let current = null
  let expiresAt = 0
  let timer = 0

  const actions = {
    pair: () => void pair(),
    options: () => chrome.runtime.openOptionsPage(),
    cancel: () => void cancel(),
    continue: () => {
      hide()
      onContinue()
    },
    retry: () => onRetry()
  }

  function button(el, spec) {
    el.hidden = !spec
    if (!spec) return
    el.textContent = spec[0]
    el.onclick = actions[spec[1]]
    el.disabled = false
  }

  function tick() {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    $('connect-timer').textContent = left ? `Запит діє ще ${left} с` : ''
    // The worker may have been stopped by Chrome: past the deadline the popup says so itself.
    if (!left && Date.now() > expiresAt + 3000) {
      show('expired')
      void chrome.storage.session.remove(PAIR_KEY)
    }
  }

  function show(name, extra = {}) {
    const view = VIEWS[name]
    const changed = current !== name
    current = name
    document.body.dataset.screen = 'connect'
    const box = $('connect')
    box.dataset.state = name
    $('connect-mark').dataset.mark = view.mark
    $('connect-mark').textContent = MARKS[view.mark]
    $('connect-title').textContent = view.title
    $('connect-text').textContent = view.text(extra)
    clearInterval(timer)
    $('connect-timer').textContent = ''
    if (name === 'waiting') {
      expiresAt = extra.expiresAt ?? Date.now() + 60_000
      tick()
      timer = setInterval(tick, 1000)
    }
    button($('connect-primary'), view.primary)
    button($('connect-secondary'), view.secondary)
    // Lone secondary actions («Скасувати») take the whole row, like «Готово» on the saved screen.
    $('connect-secondary').classList.toggle('wide', !view.primary)
    // Keyboard and screen reader land on the new screen's main action (or its title), not on <body>.
    if (changed) {
      const target = [$('connect-primary'), $('connect-secondary')].find((b) => !b.hidden)
      ;(target ?? $('connect-title')).focus()
    }
  }

  function hide() {
    clearInterval(timer)
    current = null
    delete document.body.dataset.screen
  }

  async function pair() {
    $('connect-primary').disabled = true
    let next
    try {
      next = await chrome.runtime.sendMessage({ type: 'vault-pair' })
    } catch (e) {
      console.error('[vault pair]', e)
    }
    applyPairing(next ?? { state: 'error' })
  }

  async function cancel() {
    await chrome.runtime.sendMessage({ type: 'vault-pair-cancel' }).catch(() => {})
    show('ready')
  }

  /** Renders the worker's pairing state; final answers are shown once and then forgotten. */
  function applyPairing(p) {
    if (!p?.state || !VIEWS[p.state]) return false
    show(p.state, p)
    if (FINAL.has(p.state)) void chrome.storage.session.remove(PAIR_KEY)
    return true
  }

  // The worker writes every step: the popup follows without polling.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[PAIR_KEY]?.newValue) applyPairing(changes[PAIR_KEY].newValue)
  })

  return {
    show,
    hide,
    applyPairing,
    get state() {
      return current
    },
    get sticky() {
      return STICKY.has(current)
    }
  }
}
