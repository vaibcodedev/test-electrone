/**
 * A record title quoted in a toast or a confirmation: up to 80 characters, then «…». A 500-character title
 * took nine lines and pushed the point of the message («без можливості відновлення») out of sight.
 */
export function shortTitle(title: string): string {
  return title.length > 80 ? `${title.slice(0, 79)}…` : title
}
