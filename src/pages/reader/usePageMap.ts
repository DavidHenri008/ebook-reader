import { useEffect, useMemo, useState } from "react";
import {
  measurePageMap,
  type MeasuredPageMap,
} from "../../services/pageEstimation";
import { viewportsAlmostEqual } from "../../reader/viewport";
import type { PageViewport, RawExtractedBook, Theme } from "../../types";

/**
 * Measures the paginated page map for the current book/viewport/zoom/theme and
 * returns it only while it still matches the live inputs. A stale map (wrong
 * book, zoom, section count, or viewport size) yields `null` so the caller
 * falls back to estimated page positions until a fresh measurement lands.
 */
export function usePageMap(
  extractedBook: RawExtractedBook | null,
  viewport: PageViewport | null,
  zoom: number,
  theme: Theme,
  bookId: string | null,
): MeasuredPageMap | null {
  const [measuredPages, setMeasuredPages] = useState<{
    bookId: string | null;
    pageMap: MeasuredPageMap;
  } | null>(null);

  const sectionCount = extractedBook?.sections.length ?? 0;

  useEffect(() => {
    if (!extractedBook || !viewport) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    measurePageMap(
      extractedBook.sections,
      extractedBook.styles,
      zoom,
      viewport,
      theme,
      controller.signal,
    )
      .then((nextPageMap) => {
        if (!cancelled) setMeasuredPages({ bookId, pageMap: nextPageMap });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn("Failed to measure page map:", error);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bookId, extractedBook, theme, viewport, zoom]);

  return useMemo(() => {
    if (!measuredPages || !viewport) return null;
    const { pageMap } = measuredPages;

    if (measuredPages.bookId !== bookId) return null;
    if (pageMap.zoom !== zoom) return null;
    if (pageMap.pageCounts.length !== sectionCount) return null;
    if (!viewportsAlmostEqual(pageMap.viewport, viewport)) return null;

    return pageMap;
  }, [bookId, measuredPages, sectionCount, viewport, zoom]);
}
