import { DEFAULT_PORT, getConnection, setFieldError, validPort, vaultFetch } from './shared.js'

const $ = (id) => document.getElementById(id)
const EMPTY_KEY = 'Вставте ключ і натисніть «Зберегти й перевірити»'

function setStatus(kind, text) {
  $('status').dataset.state = kind
  $('status-text').textContent = text
}

/** Saving without a check would show a green «saved» that reads as «connected»: the one button does both. */
async function saveAndCheck() {
  if ($('save').disabled) return
  const port = validPort($('port').value.trim() || DEFAULT_PORT)
  const key = $('key').value.trim()
  setFieldError('port', port ? '' : 'Порт — число від 1024 до 65535')
  setFieldError('key', key ? '' : 'Вставте ключ із Vault')
  if (port) await chrome.storage.local.set({ port, key })
  const invalid = !port ? 'port' : !key ? 'key' : null
  if (invalid) {
    setStatus('pending', invalid === 'key' ? EMPTY_KEY : 'Не перевірено')
    $(invalid).focus()
    return
  }
  await check()
}

async function check() {
  setStatus('pending', 'Перевіряю…')
  $('save').disabled = true
  const res = await vaultFetch('/ping')
  $('save').disabled = false
  if (res.ok) setStatus('ok', `Під’єднано · Vault ${res.version ?? ''}`.trim())
  else setStatus('bad', res.error)
}

async function init() {
  const { port, key } = await getConnection()
  $('port').value = String(port)
  $('key').value = key
  if (key) void check()
  else setStatus('pending', EMPTY_KEY)
}

/** A pasted key is checked by eye before saving: the field is masked only until asked. The spoken name starts
 * with the visible word (WCAG 2.5.3), so «Сховати» works as a voice command; no aria-pressed next to a changing label. */
$('reveal').addEventListener('click', () => {
  const shown = $('key').type === 'password'
  $('key').type = shown ? 'text' : 'password'
  const label = shown ? 'Сховати' : 'Показати'
  $('reveal').textContent = label
  $('reveal').setAttribute('aria-label', `${label} ключ`)
})

$('form').addEventListener('submit', (e) => {
  e.preventDefault()
  void saveAndCheck()
})
$('form').addEventListener('input', (e) => {
  if (e.target.id === 'port' || e.target.id === 'key') setFieldError(e.target.id, '')
})

void init()
