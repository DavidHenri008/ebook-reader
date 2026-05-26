/** Baseline character count used to represent a single page at 100% zoom. */
export const BASE_CHARS_PER_PAGE = 1800;

/**
 * Strips HTML tags from the given markup and returns the length of the
 * resulting plain text, with consecutive whitespace collapsed to a single space.
 *
 * @param html - Raw HTML string to measure.
 * @returns Number of characters in the visible text content.
 */
export function getPlainTextLength(html: string): number {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.body.textContent?.replace(/\s+/g, " ").trim().length ?? 0;
}

/**
 * Calculates the effective characters-per-page threshold for a given zoom level.
 * Higher zoom levels reduce the amount of text that fits on one page, so the
 * threshold scales inversely with the square of the zoom factor.
 *
 * @param zoom - Current zoom level as a percentage (e.g. 100 for 100%).
 * @returns Estimated character count per page, clamped to a minimum of 300.
 */
export function estimateCharsPerPage(zoom: number): number {
  const zoomFactor = zoom / 100;
  return Math.max(300, Math.round(BASE_CHARS_PER_PAGE / zoomFactor ** 2));
}
