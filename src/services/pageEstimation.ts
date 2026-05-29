import type { RawSection, PageViewport } from "../types/bookPages";
import type { Theme } from "../types/storage";
import { clampSectionIndex, normalizeAnchor } from "../utils/readingLocation";
import { getTopmostVisibleAnchor } from "../reader/anchor";
import { applyPaginatedLayout, getColDims } from "../reader/paginated";
import { initShadowHost } from "../reader/shadowHost";

/** Baseline character count used to represent a single page at 100% zoom. */
const BASE_CHARS_PER_PAGE = 1800;

export interface MeasuredPageMap {
  sectionPageStarts: number[][];
  pageCounts: number[];
  total: number;
  zoom: number;
  viewport: PageViewport;
}

export interface PagePosition {
  sectionNumber: number;
  page: number;
  total: number;
  estimated: boolean;
}

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

/**
 * Calculates the effective characters-per-page threshold for a given zoom level.
 * Higher zoom levels reduce the amount of text that fits on one page, so the
 * threshold scales inversely with the square of the zoom factor.
 *
 * @param zoom - Current zoom level as a percentage (e.g. 100 for 100%).
 * @returns Estimated character count per page, clamped to a minimum of 300.
 */
function estimateCharsPerPage(zoom: number): number {
  const zoomFactor = zoom / 100;
  return Math.max(300, Math.round(BASE_CHARS_PER_PAGE / zoomFactor ** 2));
}

function createMeasurementViewport(viewport: PageViewport): HTMLDivElement {
  const element = document.createElement("div");
  element.style.cssText = [
    "position:absolute",
    "left:-100000px",
    "top:0",
    `width:${viewport.width}px`,
    `height:${viewport.height}px`,
    "overflow:hidden",
    "visibility:hidden",
    "pointer-events:none",
    "contain:layout style paint",
    "z-index:-1",
  ].join(";");
  return element;
}

function pageIndexForAnchor(pageStarts: number[], anchor: number): number {
  let low = 0;
  let high = pageStarts.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pageStarts[mid] <= anchor) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
}

export function getEstimatedPagePosition(
  sectionTextLengths: number[],
  currentSection: number,
  anchor: number,
  zoom: number,
): PagePosition {
  const sectionCount = sectionTextLengths.length;
  if (sectionCount === 0) {
    return { sectionNumber: 1, page: 1, total: 1, estimated: true };
  }

  const charsPerPage = estimateCharsPerPage(zoom);
  const safeSection = clampSectionIndex(currentSection, sectionCount);
  let previousPages = 0;
  let total = 0;
  let pageInSection = 1;
  for (let index = 0; index < sectionCount; index++) {
    const pageCount = Math.max(
      1,
      Math.ceil(sectionTextLengths[index] / charsPerPage),
    );
    if (index < safeSection) {
      previousPages += pageCount;
    } else if (index === safeSection) {
      const textLength = sectionTextLengths[safeSection] ?? 0;
      const safeAnchor = Math.min(normalizeAnchor(anchor), textLength);
      pageInSection = Math.min(
        pageCount,
        Math.floor(safeAnchor / charsPerPage) + 1,
      );
    }
    total += pageCount;
  }

  return {
    sectionNumber: safeSection + 1,
    page: previousPages + pageInSection,
    total: Math.max(1, total),
    estimated: true,
  };
}

export function getMeasuredPagePosition(
  pageMap: MeasuredPageMap,
  currentSection: number,
  anchor: number,
): PagePosition {
  const sectionCount = pageMap.pageCounts.length;
  if (sectionCount === 0) {
    return { sectionNumber: 1, page: 1, total: 1, estimated: false };
  }

  const safeSection = clampSectionIndex(currentSection, sectionCount);
  const pageStarts = pageMap.sectionPageStarts[safeSection] ?? [0];
  const pageIndex = Math.min(
    pageStarts.length - 1,
    pageIndexForAnchor(pageStarts, normalizeAnchor(anchor)),
  );
  const previousPages = pageMap.pageCounts
    .slice(0, safeSection)
    .reduce((sum, count) => sum + count, 0);

  return {
    sectionNumber: safeSection + 1,
    page: previousPages + pageIndex + 1,
    total: Math.max(1, pageMap.total),
    estimated: false,
  };
}

export async function measurePageMap(
  sections: RawSection[],
  styles: string[],
  zoom: number,
  viewport: PageViewport,
  theme: Theme,
  signal?: AbortSignal,
): Promise<MeasuredPageMap> {
  const measurementViewport = createMeasurementViewport(viewport);
  const host = document.createElement("div");
  measurementViewport.appendChild(host);
  document.body.appendChild(measurementViewport);

  let disposeFonts: () => void = () => {};
  try {
    const parts = initShadowHost(host, zoom, theme, styles.join("\n"));
    const { clamp, cols, flow } = parts;
    disposeFonts = parts.disposeFonts;
    const sectionPageStarts: number[][] = [];
    const pageCounts: number[] = [];

    for (const [index, section] of sections.entries()) {
      if (signal?.aborted) {
        throw new DOMException("Page measurement aborted", "AbortError");
      }

      const dims = getColDims(section.viewport, measurementViewport, zoom);
      const layout = await applyPaginatedLayout(
        host,
        clamp,
        cols,
        flow,
        dims,
        zoom,
        section.html,
        () => signal?.aborted ?? false,
      );
      if (!layout) {
        throw new DOMException("Page measurement aborted", "AbortError");
      }

      const count = layout.pageCount;
      const starts = [0];
      const rect = cols.getBoundingClientRect();

      for (let page = 1; page < count; page += 1) {
        const left = rect.left + page * dims.pageWidth;
        starts.push(
          getTopmostVisibleAnchor(
            cols,
            rect.top,
            rect.bottom,
            left,
            left + dims.pageWidth,
          ),
        );
      }

      sectionPageStarts[index] = starts;
      pageCounts[index] = count;
    }

    return {
      sectionPageStarts,
      pageCounts,
      total: pageCounts.reduce((sum, count) => sum + count, 0),
      zoom,
      viewport,
    };
  } finally {
    disposeFonts();
    measurementViewport.remove();
  }
}
