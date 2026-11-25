/**
 * Name of the sidebar toggle for its state: the title-bar button, its tooltip and the Ctrl+K action say the
 * same. Kept out of sidebar.tsx so that file exports components only (fast refresh).
 */
export function sidebarToggleLabel(state: 'expanded' | 'collapsed'): string {
  return state === 'expanded' ? 'Згорнути бічну панель' : 'Розгорнути бічну панель'
}
