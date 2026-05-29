/**
 * Paginated-mode dimension calculations.
 *
 * Framework-agnostic reader primitives, shared by the section viewer component
 * and the page-estimation service.
 */

import {
  measureLogicalContentHeight,
  nextAnimationFrame,
  setSectionContent,
  waitForContentLayout,
} from "./shadowHost";

export interface ColDims {
  colWidth: number;
  colHeight: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Compute the logical column dimensions and physical page box size.
 * Prefers the section's declared viewport; falls back to the wrapper element.
 */
export function getColDims(
  sectionViewport: { width: number; height: number } | undefined,
  wrapper: HTMLElement | null,
  zoom: number,
): ColDims {
  const zoomFactor = zoom / 100;

  if (sectionViewport) {
    return {
      colWidth: sectionViewport.width,
      colHeight: sectionViewport.height,
      pageWidth: sectionViewport.width * zoomFactor,
      pageHeight: sectionViewport.height * zoomFactor,
    };
  }

  const rect = wrapper?.getBoundingClientRect();
  const viewportWidth = rect?.width ?? 0;
  const viewportHeight = rect?.height ?? 0;
  if (viewportWidth === 0 || viewportHeight === 0) {
    return {
      colWidth: 768,
      colHeight: 1024,
      pageWidth: 768 * zoomFactor,
      pageHeight: 1024 * zoomFactor,
    };
  }
  return {
    colWidth: viewportWidth,
    colHeight: viewportHeight,
    pageWidth: viewportWidth * zoomFactor,
    pageHeight: viewportHeight * zoomFactor,
  };
}

export interface PaginatedLayoutResult {
  /** Number of pages (columns) the section occupies at the given dimensions. */
  pageCount: number;
}

/**
 * Apply the deterministic paginated DOM layout for a single section into the
 * shadow host/clamp/cols elements, then measure how many pages it occupies.
 *
 * This is the shared layout block used by both the live paginated renderer and
 * the off-screen page-map measurement. Caller-specific orchestration (render-id
 * bumping, ref mutation, page translation, abort throwing) stays with the
 * caller.
 *
 * @param host - Physical page box element.
 * @param clamp - Clamp element wrapping the columns.
 * @param cols - Column flow element that receives the section HTML.
 * @param flow - Scrolled-mode flow element (hidden in paginated mode).
 * @param dims - Column/page dimensions for this section.
 * @param zoom - Zoom level as a percentage (e.g. 100 for 100%).
 * @param html - Section HTML to render.
 * @param shouldCancel - Optional check run after layout settles; when it
 *   returns true the helper bails out and resolves to `null`.
 * @returns The measured page count, or `null` if cancelled.
 */
export async function applyPaginatedLayout(
  host: HTMLElement,
  clamp: HTMLElement,
  cols: HTMLElement,
  flow: HTMLElement,
  dims: ColDims,
  zoom: number,
  html: string,
  shouldCancel?: () => boolean,
): Promise<PaginatedLayoutResult | null> {
  host.style.width = `${dims.pageWidth}px`;
  host.style.height = `${dims.pageHeight}px`;

  flow.style.display = "none";
  clamp.style.cssText = `display:block;width:${dims.colWidth}px;height:${dims.colHeight}px;overflow:hidden;`;
  cols.style.cssText = `column-width:${dims.colWidth}px;column-gap:0;column-fill:auto;width:${dims.colWidth}px;height:${dims.colHeight}px;`;
  cols.style.transform = "";
  setSectionContent(cols, html);

  await waitForContentLayout(cols);
  if (shouldCancel?.()) return null;

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
  const pageCount = Math.max(1, Math.ceil(cols.scrollWidth / dims.colWidth));
  return { pageCount };
}

/**
 * Map an anchor's client rect to its 0-based page (column) index within the
 * paginated host box. Shared so anchor restoration and any other paginated
 * page-resolution agree on how a rect's horizontal offset becomes a page.
 */
export function pageForAnchorRect(
  host: HTMLElement,
  dims: ColDims,
  rect: { left: number },
): number {
  const hostLeft = host.getBoundingClientRect().left;
  return Math.max(0, Math.floor((rect.left - hostLeft) / dims.pageWidth));
}
