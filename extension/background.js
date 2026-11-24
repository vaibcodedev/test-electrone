// Service worker: finishes the «Выделить область» flow.
// The popup closes while the user drags a rectangle, so the content script reports the
// rectangle here; we capture the visible tab, crop it and keep the result for the popup.

const AREA_TTL = 10 * 60 * 1000

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'vault-area' && sender.tab) {
    handleArea(sender.tab, msg)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }))
    return true // async response
  }
  if (msg?.type === 'vault-area-cancel' && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: '' })
  }
  return false
})

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
  await chrome.storage.session.set({
    [`area:${tab.id}`]: { dataUrl, url: tab.url, at: Date.now() }
  })
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d4f542' })
  await chrome.action.setBadgeText({ tabId: tab.id, text: '1' })
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
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:${blob.type};base64,${btoa(binary)}`
}

// Drop stale area captures.
chrome.runtime.onStartup?.addListener(async () => {
  const all = await chrome.storage.session.get(null)
  const stale = Object.entries(all)
    .filter(([k, v]) => k.startsWith('area:') && Date.now() - (v?.at ?? 0) > AREA_TTL)
    .map(([k]) => k)
  if (stale.length) await chrome.storage.session.remove(stale)
})
