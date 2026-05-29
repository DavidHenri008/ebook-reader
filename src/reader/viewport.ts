import type { PageViewport } from "../types/bookPages";

/**
 * Returns true when two viewports are equal within a small pixel tolerance.
 * Used to suppress redundant re-measurement/re-render caused by sub-pixel
 * resize noise.
 *
 * @param a - First viewport.
 * @param b - Second viewport.
 * @param eps - Maximum per-axis difference treated as equal (default 0.5px).
 */
export function viewportsAlmostEqual(
  a: PageViewport,
  b: PageViewport,
  eps = 0.5,
): boolean {
  return (
    Math.abs(a.width - b.width) < eps && Math.abs(a.height - b.height) < eps
  );
}
