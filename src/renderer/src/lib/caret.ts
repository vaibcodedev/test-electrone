/** Styles that decide where text wraps and lands inside a textarea (copied onto the measuring mirror). */
const MIRRORED = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontKerning',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
  'overflowWrap',
  'wordBreak'
] as const

/**
 * Where character `position` of a textarea sits, in px from the textarea's top-left corner (its own scroll
 * subtracted), and the line height: a menu can open right under the text being typed. A textarea has no API
 * for it, so a hidden mirror with the same box and font is measured.
 */
export function caretCoordinates(
  el: HTMLTextAreaElement,
  position: number
): { top: number; left: number; height: number } {
  const computed = getComputedStyle(el)
  const mirror = document.createElement('div')
  const style = mirror.style
  for (const key of MIRRORED) style[key] = computed[key]
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.top = '0'
  style.left = '-9999px'
  style.whiteSpace = 'pre-wrap'
  style.overflow = 'hidden'
  // Wrap exactly like the field: a scrollbar narrows its lines, the mirror has none — so its width is the field's
  // inner width (clientWidth: padding, no scrollbar) plus the borders.
  style.boxSizing = 'border-box'
  style.width = `${el.clientWidth + parseFloat(computed.borderLeftWidth) + parseFloat(computed.borderRightWidth)}px`
  mirror.textContent = el.value.slice(0, position)
  const marker = document.createElement('span')
  // Something after the caret, so the marker has a box even at the very end of the text.
  marker.textContent = el.value.slice(position) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.4
  const top = marker.offsetTop + parseFloat(computed.borderTopWidth) - el.scrollTop
  const left = marker.offsetLeft + parseFloat(computed.borderLeftWidth) - el.scrollLeft
  mirror.remove()
  // Scrolled out of the box: keep the anchor on the field's edge.
  return {
    top: Math.min(Math.max(top, 0), Math.max(el.clientHeight - lineHeight, 0)),
    left: Math.min(Math.max(left, 0), el.clientWidth),
    height: lineHeight
  }
}
