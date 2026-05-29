const FALLBACK_BOOK_TITLE = "Untitled";

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function bookTitleToUrlSegment(title: string): string {
  const normalizedTitle = title.trim() || FALLBACK_BOOK_TITLE;
  return encodeURIComponent(normalizedTitle);
}

export function bookTitleFromUrlSegment(
  segment: string | undefined,
): string | null {
  if (!segment) return null;

  const title = safeDecodeURIComponent(segment).trim();
  return title.length > 0 ? title : null;
}

export function readerPathForBookTitle(title: string): string {
  return `/reader/${bookTitleToUrlSegment(title)}`;
}
