const HAS_SCHEME = /^[a-z][\w+.-]*:\/\//i

/**
 * «github.com» from «https://www.github.com/x» or «www.github.com/x» (an address saved without a scheme
 * is read as https); undefined for anything that isn't a URL.
 */
export function hostOf(url: string): string | undefined {
  const text = url.trim()
  if (!text) return undefined
  try {
    return (
      new URL(HAS_SCHEME.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, '') ||
      undefined
    )
  } catch {
    return undefined
  }
}
