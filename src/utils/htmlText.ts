/**
 * Plain-text helpers operating on raw HTML markup.
 */

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
