// Service worker: finishes the «Виділити область» flow and sends captures.
// The popup closes while the user drags a rectangle, so the content script reports the
// rectangle here; we capture the visible tab, crop it and keep the result for the popup.
import { AREA_TTL, sendCapture } from './shared.js'

/** Area PNGs live in storage.session (10 MB quota): keep only the freshest few. */
const AREA_KEEP = 3

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vault-area' && sender.tab) {
    const tab = sender.tab
    handleArea(tab, msg)
      .then(() => sendResponse({ ok: true }))
      .catch(async (e) => {
        // The overlay is already gone: without this the user would see nothing happen at all.
        console.error('[vault area]', e)
        await chrome.storage.session.set({
          [`area-error:${tab.id}`]: { url: tab.url, at: Date.now() }
        })
        await showBadge(tab.id, '!', '#b02a33')
        await chrome.action.openPopup().catch(() => {})
        sendResponse({ ok: false, error: String(e?.message || e) })
      })
    return true // async response
  }
  if (msg?.type === 'vault-area-cancel' && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' })
  }
  // Only from the popup (an extension page has no sender.tab), never from a content script.
  if (msg?.type === 'vault-capture' && !sender.tab && Number.isInteger(msg.tabId)) {
    sendCapture(msg.tabId, msg.body)
      .then(sendResponse)
      .catch((e) => {
        console.error('[vault capture]', e)
        sendResponse({
          ok: false,
          status: 'error',
          error: 'Не вдалося зберегти. Спробуйте ще раз.'
        })
      })
    return true
  }
  return false
})

async function showBadge(tabId, text, color) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color })
  await chrome.action.setBadgeText({ tabId, text })
}

async function pruneAreas(keepTabId) {
  const all = await chrome.storage.session.get(null)
  const areas = Object.entries(all)
    .filter(([k]) => k.startsWith('area:') && k !== `area:${keepTabId}`)
    .sort(([, a], [, b]) => (b?.at ?? 0) - (a?.at ?? 0))
  const drop = areas
    .filter(([, v], i) => i >= AREA_KEEP - 1 || Date.now() - (v?.at ?? 0) > AREA_TTL)
    .map(([k]) => k)
  if (drop.length) await chrome.storage.session.remove(drop)
}

async function handleArea(tab, { rect, dpr }) {
  const full = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const blob = await (await fetch(full)).blob()
  const bitmap = await createImageBitmap(blob)
  const scale = Number(dpr) > 0 ? Number(dpr) : 1
  const sx = Math.max(0, Math.round(rect.x * scale))
  const sy = Math.max(0, Math.round(rect.y * scale))
  const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(rect.width * scale)))
  const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(rect.height * scale)))
  const canvas = new OffscreenCanvas(sw, sh)
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
  const png = await canvas.convertToBlob({ type: 'image/png' })
  const dataUrl = await blobToDataUrl(png)
  await pruneAreas(tab.id)
  await chrome.storage.session.set({
    [`area:${tab.id}`]: { dataUrl, url: tab.url, at: Date.now() }
  })
  await chrome.storage.session.remove(`area-error:${tab.id}`)
  await showBadge(tab.id, '1', '#d4f542')
  try {
    await chrome.action.openPopup() // Chrome 127+
  } catch {
    /* older Chrome: the badge tells the user to click the icon again */
  }
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:${blob.type};base64,${btoa(binary)}`
}
