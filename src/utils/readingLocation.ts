/**
 * Helpers for normalizing persisted reading-location values (section index and
 * anchor offset). Shared by the reader page and page-estimation service so both
 * clamp stored positions identically.
 */

export function normalizeAnchor(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function normalizeSectionIndex(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function clampSectionIndex(value: number, sectionCount: number): number {
  if (sectionCount <= 0) return 0;
  return Math.min(normalizeSectionIndex(value), sectionCount - 1);
}
