const BROWSER_BLOB_URL_PATTERN = /\bblob:[^"'\s<>)]+/i;

export function getFirstBrowserBlobUrl(value: string): string | null {
  return value.match(BROWSER_BLOB_URL_PATTERN)?.[0] ?? null;
}

export function containsBrowserBlobUrl(value: string): boolean {
  return BROWSER_BLOB_URL_PATTERN.test(value);
}
