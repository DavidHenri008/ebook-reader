/**
 * Paginated-mode engine. Owns the column transform, render-id cancellation,
 * page state, anchor restore, and prev/next navigation for paginated reading.
 *
 * Framework-agnostic: it reads and writes the shared {@link
 * ViewerControllerContext} (React refs + a few stable callbacks) and never
 * touches React directly. The hook wires it up and exposes thin delegators.
 */

import type { ViewerControllerContext } from "./viewerControllerContext";
import { findNodeAtOffset } from "./anchor";
import {
  applyPaginatedLayout,
  getColDims,
  pageForAnchorRect,
  type ColDims,
} from "./paginated";

export interface PaginatedController {
  /** Column dimensions for the live paginated state. */
  currentColDims: () => ColDims;
  /** Render a paginated section, clamping to `targetPage`. Resolves page count. */
  render: (
    sIdx: number,
    zoomValue: number,
    targetPage: number,
  ) => Promise<number>;
  /** Restore the given anchor offset within the current paginated section. */
  restore: (targetAnchor: number, targetZoom: number) => void;
  navigatePrev: () => void;
  navigateNext: () => void;
}

export function createPaginatedController(
  ctx: ViewerControllerContext,
): PaginatedController {
  const currentColDims = (): ColDims =>
    getColDims(
      ctx.sectionViewportRef.current,
      ctx.wrapperRef.current,
      ctx.zoomRef.current,
    );

  const render = async (
    sIdx: number,
    zoomValue: number,
    targetPage: number,
  ): Promise<number> => {
    const renderId = ctx.paginatedRenderIdRef.current + 1;
    ctx.paginatedRenderIdRef.current = renderId;

    const { clamp, cols, flow } = ctx.ensureShadow();
    const section = ctx.getSections()[sIdx];
    if (!section) return 1;

    ctx.sectionViewportRef.current = section.viewport;
    const dims = getColDims(
      section.viewport,
      ctx.wrapperRef.current,
      zoomValue,
    );
    ctx.lastPaginatedViewportRef.current = {
      width: dims.colWidth,
      height: dims.colHeight,
    };

    const host = ctx.hostRef.current!;
    const layout = await applyPaginatedLayout(
      host,
      clamp,
      cols,
      flow,
      dims,
      zoomValue,
      section.html,
      () => renderId !== ctx.paginatedRenderIdRef.current,
    );
    if (!layout) return ctx.pageCountRef.current;

    const count = layout.pageCount;
    const page = Math.min(Math.max(0, targetPage), count - 1);
    ctx.applyCount(count);
    ctx.applyPage(page);
    cols.style.transform = `translateX(-${page * dims.colWidth}px)`;
    return count;
  };

  const restore = (targetAnchor: number, targetZoom: number): void => {
    const cols = ctx.colsRef.current;
    if (!cols) return;

    if (targetAnchor <= 0) {
      ctx.applyPage(0);
      cols.style.transform = "translateX(0)";
      return;
    }

    const found = findNodeAtOffset(cols, targetAnchor);
    if (!found) return;

    cols.style.transform = "";

    const range = document.createRange();
    range.setStart(found.node, found.offsetInNode);
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length === 0) return;

    const host = ctx.hostRef.current!;
    const dims = getColDims(
      ctx.sectionViewportRef.current,
      ctx.wrapperRef.current,
      targetZoom,
    );
    const page = pageForAnchorRect(host, dims, rects[0]);
    const clamped = Math.min(page, ctx.pageCountRef.current - 1);
    ctx.applyPage(clamped);
    cols.style.transform = `translateX(-${clamped * dims.colWidth}px)`;
  };

  const navigatePrev = (): void => {
    if (ctx.modeRef.current !== "paginated") return;
    const cols = ctx.colsRef.current;
    if (!cols) return;
    const dims = currentColDims();

    if (ctx.pageRef.current > 0) {
      const newPage = ctx.pageRef.current - 1;
      ctx.applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * dims.colWidth}px)`;
      ctx.saveAnchor();
    } else if (ctx.sectionRef.current > 0) {
      const prev = ctx.sectionRef.current - 1;
      ctx.sectionRef.current = prev;
      render(prev, ctx.zoomRef.current, 99999).then((count) => {
        const lastPage = count - 1;
        const d = currentColDims();
        ctx.applyPage(lastPage);
        cols.style.transform = `translateX(-${lastPage * d.colWidth}px)`;
        ctx.saveAnchor();
      });
      ctx.onNavigateRef.current?.(prev);
    }
  };

  const navigateNext = (): void => {
    if (ctx.modeRef.current !== "paginated") return;
    const cols = ctx.colsRef.current;
    if (!cols) return;
    const dims = currentColDims();

    if (ctx.pageRef.current < ctx.pageCountRef.current - 1) {
      const newPage = ctx.pageRef.current + 1;
      ctx.applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * dims.colWidth}px)`;
      ctx.saveAnchor();
    } else if (ctx.sectionRef.current < ctx.getSections().length - 1) {
      const next = ctx.sectionRef.current + 1;
      ctx.sectionRef.current = next;
      render(next, ctx.zoomRef.current, 0).then(() => ctx.saveAnchor());
      ctx.onNavigateRef.current?.(next);
    }
  };

  return { currentColDims, render, restore, navigatePrev, navigateNext };
}
