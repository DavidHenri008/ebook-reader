/**
 * Platform abstraction seam.
 *
 * Exposes feature flags for branching web vs native (Capacitor) behavior without
 * scattering platform checks across the app. Phase 1 has no Capacitor dependency
 * yet, so `isNative()` reads the global `Capacitor` shim that the native runtime
 * injects into the WebView. This is upgraded to use `@capacitor/core` directly in
 * a later phase once the dependency is added.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/**
 * Whether the app is running inside a native Capacitor WebView.
 *
 * Returns `false` on the web (including the PWA) and in non-DOM environments
 * (e.g. tests).
 */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap?.isNativePlatform?.() ?? false;
}
