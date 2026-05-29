/**
 * Paginated-mode dimension calculations.
 *
 * Framework-agnostic reader primitives, shared by the section viewer component
 * and the page-estimation service.
 */

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
