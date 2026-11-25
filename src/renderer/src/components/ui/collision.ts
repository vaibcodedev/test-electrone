/**
 * Room overlays (tooltips, popovers, menus) keep from the window's edges. The top is the 44px strip where Windows
 * draws the native window buttons over the page (titleBarOverlay in window-manager.ts): a tooltip on a button at
 * the top placed itself under them and was cut off. With this padding Radix flips it below instead.
 */
export const OVERLAY_COLLISION = { top: 52, right: 12, bottom: 12, left: 12 }
