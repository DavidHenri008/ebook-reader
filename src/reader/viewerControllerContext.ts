/**
 * Shared mutable context handed to the paginated and scrolled viewer
 * controllers. It bundles the React refs and a small set of stable callbacks
 * the `useSectionViewer` hook owns, so each engine can read/write live state
 * and delegate React wiring (state setters, shadow init, anchor saves) back to
 * the hook.
 *
 * The hook builds this object once (all members are stable across renders) and
 * passes it to `createPaginatedController` / `createScrolledController`.
 */

import type { RefObject } from "react";
import type { RawSection } from "../types/bookPages";

export type ReaderMode = "paginated" | "scrolled";

export interface ViewerDimensions {
  width: number;
  height: number;
}

export interface ViewerControllerContext {
  // ── DOM refs ──────────────────────────────────────────────────────────
  hostRef: RefObject<HTMLDivElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
  clampRef: RefObject<HTMLDivElement | null>;
  colsRef: RefObject<HTMLDivElement | null>;
  flowRef: RefObject<HTMLDivElement | null>;

  // ── Live prop mirrors ─────────────────────────────────────────────────
  sectionRef: RefObject<number>;
  modeRef: RefObject<ReaderMode>;
  zoomRef: RefObject<number>;

  // ── Paginated state ───────────────────────────────────────────────────
  pageRef: RefObject<number>;
  pageCountRef: RefObject<number>;
  paginatedRenderIdRef: RefObject<number>;
  sectionViewportRef: RefObject<ViewerDimensions | undefined>;
  lastPaginatedViewportRef: RefObject<ViewerDimensions | null>;

  // ── Scrolled state ────────────────────────────────────────────────────
  scrolledRenderIdRef: RefObject<number>;
  mountedRangeRef: RefObject<{ first: number; last: number }>;
  topSentinelRef: RefObject<HTMLDivElement | null>;
  bottomSentinelRef: RefObject<HTMLDivElement | null>;
  scrollFrameRef: RefObject<number | null>;
  scrolledPositionSaveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  intersectObserverRef: RefObject<IntersectionObserver | null>;
  idleHandleRef: RefObject<{ cancel: () => void } | null>;

  // ── Callback mirror ───────────────────────────────────────────────────
  onNavigateRef: RefObject<((sectionIndex: number) => void) | undefined>;

  // ── Shared operations owned by the hook ───────────────────────────────
  getSections: () => RawSection[];
  applyPage: (page: number) => void;
  applyCount: (count: number) => void;
  ensureShadow: () => {
    clamp: HTMLDivElement;
    cols: HTMLDivElement;
    flow: HTMLDivElement;
  };
  saveAnchor: () => void;
  flushAnchor: () => void;
}
