import type { RawSection } from "../types/bookPages";
import type { Theme } from "../types/storage";
import { getTopmostVisibleAnchor } from "../components/sectionViewer/anchor";
import { getColDims } from "../components/sectionViewer/paginated";
import {
  initShadowHost,
  measureLogicalContentHeight,
  nextAnimationFrame,
  setSectionContent,
  waitForContentLayout,
} from "../components/sectionViewer/shadowHost";

/** Baseline character count used to represent a single page at 100% zoom. */
const BASE_CHARS_PER_PAGE = 1800;

export interface PageViewport {
  width: number;
  height: number;
}

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
function estimateCharsPerPage(zoom: number): number {
  const zoomFactor = zoom / 100;
  return Math.max(300, Math.round(BASE_CHARS_PER_PAGE / zoomFactor ** 2));
}

function normalizeAnchor(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function normalizeSectionIndex(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function clampSectionIndex(value: number, sectionCount: number): number {
  if (sectionCount <= 0) return 0;
  return Math.min(normalizeSectionIndex(value), sectionCount - 1);
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
  const pageCounts = sectionTextLengths.map((textLength) =>
    Math.max(1, Math.ceil(textLength / charsPerPage)),
  );
  const safeSection = clampSectionIndex(currentSection, sectionCount);
  const previousPages = pageCounts
    .slice(0, safeSection)
    .reduce((sum, count) => sum + count, 0);
  const textLength = sectionTextLengths[safeSection] ?? 0;
  const safeAnchor = Math.min(normalizeAnchor(anchor), textLength);
  const pageInSection = Math.min(
    pageCounts[safeSection] ?? 1,
    Math.floor(safeAnchor / charsPerPage) + 1,
  );
  const total = Math.max(
    1,
    pageCounts.reduce((sum, count) => sum + count, 0),
  );

  return {
    sectionNumber: safeSection + 1,
    page: previousPages + pageInSection,
    total,
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
  zoom: number,
  viewport: PageViewport,
  theme: Theme,
  signal?: AbortSignal,
): Promise<MeasuredPageMap> {
  const measurementViewport = createMeasurementViewport(viewport);
  const host = document.createElement("div");
  measurementViewport.appendChild(host);
  document.body.appendChild(measurementViewport);

  try {
    const { clamp, cols, flow } = initShadowHost(host, zoom, theme);
    const sectionPageStarts: number[][] = [];
    const pageCounts: number[] = [];

    flow.style.display = "none";

    for (const [index, section] of sections.entries()) {
      if (signal?.aborted) {
        throw new DOMException("Page measurement aborted", "AbortError");
      }

      const dims = getColDims(section.viewport, measurementViewport, zoom);
      host.style.width = `${dims.pageWidth}px`;
      host.style.height = `${dims.pageHeight}px`;
      clamp.style.cssText = `display:block;width:${dims.colWidth}px;height:${dims.colHeight}px;overflow:hidden;`;
      cols.style.cssText = `column-width:${dims.colWidth}px;column-gap:0;column-fill:auto;width:${dims.colWidth}px;height:${dims.colHeight}px;`;
      cols.style.transform = "";
      setSectionContent(cols, section.html);

      await waitForContentLayout(cols);
      if (signal?.aborted) {
        throw new DOMException("Page measurement aborted", "AbortError");
      }

      const zoomFactor = zoom / 100;
      const contentHeight = measureLogicalContentHeight(
        cols,
        zoomFactor,
        dims.colHeight,
      );
      host.style.height = `${contentHeight * zoomFactor}px`;
      clamp.style.height = `${contentHeight}px`;
      cols.style.height = `${contentHeight}px`;

      await nextAnimationFrame();
      const count = Math.max(1, Math.ceil(cols.scrollWidth / dims.colWidth));
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
    measurementViewport.remove();
  }
}
