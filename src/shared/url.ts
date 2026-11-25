/** «github.com» from «https://www.github.com/x»; undefined for anything that isn't a URL. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}
