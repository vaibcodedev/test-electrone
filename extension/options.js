import { DEFAULT_PORT, getConnection, validPort, vaultFetch } from './shared.js'

const $ = (id) => document.getElementById(id)

function setStatus(kind, text) {
  $('status').dataset.state = kind
  $('status-text').textContent = text
}

async function persist() {
  const port = validPort($('port').value.trim() || DEFAULT_PORT)
  if (!port) {
    $('error').textContent = 'Порт — число від 1024 до 65535'
    return false
  }
  $('error').textContent = ''
  await chrome.storage.local.set({ port, key: $('key').value.trim() })
  return true
}

async function check() {
  if (!(await persist())) return
  setStatus('pending', 'Перевіряю…')
  const res = await vaultFetch('/ping')
  if (res.ok) setStatus('ok', `Під’єднано · Vault ${res.version ?? ''}`.trim())
  else setStatus('bad', res.error)
}

async function init() {
  const { port, key } = await getConnection()
  $('port').value = String(port)
  $('key').value = key
  if (key) void check()
}

$('save').addEventListener('click', async () => {
  if (await persist()) setStatus('ok', 'Збережено')
})
$('check').addEventListener('click', () => void check())

void init()
