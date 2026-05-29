/**
 * Orchestration hook for SectionViewer: manages all shadow-DOM refs, renders,
 * and navigation. The presentational component is a thin wrapper around this.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { RawSection, PageViewport } from "../../types/bookPages";
import type { Theme } from "../../types/storage";
import { scheduleIdle, getTopmostVisibleAnchor } from "../../reader/anchor";
import {
  buildHostStyle,
  initShadowHost,
  applyBookStyles,
} from "../../reader/shadowHost";
import { readTopmostVisibleSection } from "./scrolled";
import { viewportsAlmostEqual } from "../../reader/viewport";
import type { ViewerControllerContext } from "../../reader/viewerControllerContext";
import {
  createPaginatedController,
  type PaginatedController,
} from "../../reader/paginatedController";
import {
  createScrolledController,
  type ScrolledController,
} from "./scrolledController";

export interface SectionViewerProps {
  sections: RawSection[];
  styles: string[];
  bookId: string;
  currentSection: number;
  anchor: number;
  zoom: number; // 20–400, maps to CSS zoom = zoom/100
  mode: "paginated" | "scrolled";
  theme: Theme;
  onPositionChange: (pos: { sectionIndex: number; anchor: number }) => void;
  onNavigate?: (sectionIndex: number) => void;
  onViewportChange?: (viewport: PageViewport) => void;
}

interface UseSectionViewerResult {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  hostRef: React.RefObject<HTMLDivElement | null>;
  pageInSection: number;
  pageCount: number;
  navigatePrev: () => void;
  navigateNext: () => void;
}

// Topmost section element currently intersecting the viewport, plus its
// section index, is provided by `readTopmostVisibleSection` from `./scrolled`.

export function useSectionViewer({
  sections,
  styles,
  currentSection,
  anchor,
  zoom,
  mode,
  theme,
  onPositionChange,
  onNavigate,
  onViewportChange,
}: SectionViewerProps): UseSectionViewerResult {
  // ── DOM refs ────────────────────────────────────────────────────────────
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // ── React state (drives button visibility / page counter) ───────────────
  const [pageInSection, setPageInSection] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  // ── Shadow DOM refs (created once on mount) ────────────────────────────
  const shadowRef = useRef<ShadowRoot | null>(null);
  const hostStyleRef = useRef<HTMLStyleElement | null>(null);
  const bookStyleRef = useRef<HTMLStyleElement | null>(null);
  const disposeFontsRef = useRef<() => void>(() => {});
  const clampRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);

  // ── Live prop mirrors — avoid stale closures in callbacks ───────────────
  const sectionRef = useRef(currentSection);
  const anchorRef = useRef(anchor);
  const modeRef = useRef(mode);
  const zoomRef = useRef(zoom);
  const themeRef = useRef(theme);
  const stylesRef = useRef(styles);
  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const paginatedRenderIdRef = useRef(0);
  const scrolledRenderIdRef = useRef(0);
  const sectionViewportRef = useRef<
    { width: number; height: number } | undefined
  >(undefined);
  const lastPaginatedViewportRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const reportedViewportRef = useRef<PageViewport | null>(null);

  // ── Scrolled-mode range tracking ────────────────────────────────────────
  const mountedRangeRef = useRef({
    first: currentSection,
    last: currentSection,
  });
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrolledPositionSaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ── Idle/timer handle (replaces separate saveTimer + saveIdleCallback) ──
  const idleHandleRef = useRef<{ cancel: () => void } | null>(null);

  // ── Observer refs ───────────────────────────────────────────────────────
  const intersectObserverRef = useRef<IntersectionObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── Mount guard (used by the combined prop-change effect) ───────────────
  const mountedRef = useRef(false);

  // ── Live sections mirror (read by the controllers) ─────────────────────
  const sectionsRef = useRef(sections);
  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  // ── Stable callback mirrors ─────────────────────────────────────────────
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const reportViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const previous = reportedViewportRef.current;
    if (previous && viewportsAlmostEqual(previous, rect)) {
      return;
    }

    const next = { width: rect.width, height: rect.height };
    reportedViewportRef.current = next;
    onViewportChangeRef.current?.(next);
  }, []);

  // ── Atomic state helpers ────────────────────────────────────────────────

  const applyPage = useCallback((p: number) => {
    pageRef.current = p;
    setPageInSection(p);
  }, []);

  const applyCount = useCallback((c: number) => {
    pageCountRef.current = c;
    setPageCount(c);
  }, []);

  // ── Shadow DOM init ──────────────────────────────────────────────────────

  const ensureShadow = useCallback((): {
    clamp: HTMLDivElement;
    cols: HTMLDivElement;
    flow: HTMLDivElement;
  } => {
    if (shadowRef.current) {
      return {
        clamp: clampRef.current!,
        cols: colsRef.current!,
        flow: flowRef.current!,
      };
    }
    const parts = initShadowHost(
      hostRef.current!,
      zoomRef.current,
      themeRef.current,
      stylesRef.current.join("\n"),
    );
    shadowRef.current = parts.shadow;
    hostStyleRef.current = parts.style;
    bookStyleRef.current = parts.bookStyle;
    disposeFontsRef.current = parts.disposeFonts;
    clampRef.current = parts.clamp;
    colsRef.current = parts.cols;
    flowRef.current = parts.flow;
    return { clamp: parts.clamp, cols: parts.cols, flow: parts.flow };
  }, []);

  // Keep the hoisted book stylesheets in sync with the shadow root. They are
  // normally set once on mount, but a book swap or a late cache load can change
  // them after the shadow host already exists.
  useEffect(() => {
    stylesRef.current = styles;
    if (bookStyleRef.current) {
      disposeFontsRef.current = applyBookStyles(
        bookStyleRef.current,
        styles.join("\n"),
        disposeFontsRef.current,
      );
    }
  }, [styles]);

  // ── Anchor save / restore ────────────────────────────────────────────────

  const readVisiblePosition = useCallback((): {
    sectionIndex: number;
    anchor: number;
  } | null => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return null;
    const contentRoot =
      modeRef.current === "paginated" ? colsRef.current : flowRef.current;
    if (!contentRoot) return null;

    if (
      modeRef.current === "scrolled" &&
      mountedRangeRef.current.first === 0 &&
      wrapper.scrollTop <= 2
    ) {
      return { sectionIndex: 0, anchor: 0 };
    }

    const rect = wrapper.getBoundingClientRect();
    let anchorRoot: Element = contentRoot;
    let sectionIndex = sectionRef.current;

    if (modeRef.current === "paginated" && pageRef.current === 0) {
      return { sectionIndex, anchor: 0 };
    }

    if (modeRef.current === "scrolled") {
      const visible = readTopmostVisibleSection(
        contentRoot,
        rect.top,
        rect.bottom,
      );
      if (visible) {
        anchorRoot = visible.element;
        sectionIndex = visible.index;
      }
    }

    const newAnchor = getTopmostVisibleAnchor(
      anchorRoot,
      rect.top,
      rect.bottom,
      modeRef.current === "paginated" ? rect.left : undefined,
      modeRef.current === "paginated" ? rect.right : undefined,
    );

    return { sectionIndex, anchor: newAnchor };
  }, []);

  // Persist a visible position. With `defer`, the report is scheduled on idle
  // (scroll/page saves); otherwise it fires synchronously (flush on teardown
  // or mode switch). Scrolled-mode section changes notify onNavigate.
  const commitPosition = useCallback(
    (
      position: { sectionIndex: number; anchor: number },
      { defer }: { defer: boolean },
    ) => {
      anchorRef.current = position.anchor;

      if (
        modeRef.current === "scrolled" &&
        position.sectionIndex !== sectionRef.current
      ) {
        sectionRef.current = position.sectionIndex;
        onNavigateRef.current?.(position.sectionIndex);
      }

      idleHandleRef.current?.cancel();
      if (defer) {
        idleHandleRef.current = scheduleIdle(() => {
          onPositionChangeRef.current(position);
        });
      } else {
        idleHandleRef.current = null;
        onPositionChangeRef.current(position);
      }
    },
    [],
  );

  const saveAnchor = useCallback(() => {
    const position = readVisiblePosition();
    if (position) commitPosition(position, { defer: true });
  }, [readVisiblePosition, commitPosition]);

  const flushAnchor = useCallback(() => {
    const position = readVisiblePosition();
    if (position) commitPosition(position, { defer: false });
  }, [readVisiblePosition, commitPosition]);

  // ── Controller context + engines ─────────────────────────────────────────
  // The hook owns React state/refs and the shared anchor save/restore glue; the
  // paginated and scrolled engines read and mutate this shared context. Created
  // once via lazy state initializers — every member is stable across renders.
  const [ctx] = useState<ViewerControllerContext>(() => ({
    hostRef,
    wrapperRef,
    clampRef,
    colsRef,
    flowRef,
    sectionRef,
    modeRef,
    zoomRef,
    pageRef,
    pageCountRef,
    paginatedRenderIdRef,
    sectionViewportRef,
    lastPaginatedViewportRef,
    scrolledRenderIdRef,
    mountedRangeRef,
    topSentinelRef,
    bottomSentinelRef,
    scrollFrameRef,
    scrolledPositionSaveTimerRef,
    intersectObserverRef,
    idleHandleRef,
    onNavigateRef,
    getSections: () => sectionsRef.current,
    applyPage,
    applyCount,
    ensureShadow,
    saveAnchor,
    flushAnchor,
  }));

  const [paginated] = useState<PaginatedController>(() =>
    createPaginatedController(ctx),
  );
  const [scrolled] = useState<ScrolledController>(() =>
    createScrolledController(ctx),
  );

  // ── Scrolled-engine delegators (referenced by effects) ───────────────────

  const cancelPendingScrolledWork = useCallback(() => {
    scrolled.cancelPendingWork();
  }, [scrolled]);

  const updateScrolledSectionFromViewport = useCallback(() => {
    scrolled.updateSectionFromViewport();
  }, [scrolled]);

  const scheduleScrolledPositionSave = useCallback(() => {
    scrolled.schedulePositionSave();
  }, [scrolled]);

  // Dispatches anchor restore to the active mode's controller.
  const restoreAnchor = useCallback(
    (
      targetAnchor: number,
      targetMode: "paginated" | "scrolled",
      targetZoom: number,
    ) => {
      if (targetMode === "paginated") {
        paginated.restore(targetAnchor, targetZoom);
      } else {
        scrolled.restore(targetAnchor);
      }
    },
    [paginated, scrolled],
  );

  // Restores the given anchor on the next animation frame. Used after a render
  // (or layout-affecting change) so the DOM has settled before measuring.
  const restoreOnNextFrame = useCallback(
    (
      targetAnchor: number,
      targetMode: "paginated" | "scrolled",
      targetZoom: number,
    ) => {
      requestAnimationFrame(() =>
        restoreAnchor(targetAnchor, targetMode, targetZoom),
      );
    },
    [restoreAnchor],
  );

  // ── Paginated render ─────────────────────────────────────────────────────

  // ── Paginated render ─────────────────────────────────────────────────────

  const renderPaginated = useCallback(
    (sIdx: number, zoomValue: number, targetPage: number): Promise<number> =>
      paginated.render(sIdx, zoomValue, targetPage),
    [paginated],
  );

  // Renders a paginated section from its first page, then restores the target
  // anchor on the next frame. Wraps the common render→restore sequence shared
  // by the mount/prop-change effect and the ResizeObserver.
  const renderPaginatedThenRestore = useCallback(
    (sIdx: number, zoomValue: number, targetAnchor: number) =>
      renderPaginated(sIdx, zoomValue, 0).then(() => {
        restoreOnNextFrame(targetAnchor, "paginated", zoomValue);
      }),
    [renderPaginated, restoreOnNextFrame],
  );

  // ── Scrolled render (referenced by effects) ──────────────────────────────

  const teardownScrolled = useCallback(
    (flushPosition = false) => {
      scrolled.teardown(flushPosition);
    },
    [scrolled],
  );

  const ensureScrolledRangeAroundViewport = useCallback(() => {
    scrolled.ensureRangeAroundViewport();
  }, [scrolled]);

  const renderScrolled = useCallback(
    (sIdx: number) => {
      scrolled.render(sIdx);
    },
    [scrolled],
  );

  // ── Paginated navigation ─────────────────────────────────────────────────

  const navigatePrev = useCallback(() => {
    paginated.navigatePrev();
  }, [paginated]);

  const navigateNext = useCallback(() => {
    paginated.navigateNext();
  }, [paginated]);

  // ── Keyboard navigation ──────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (modeRef.current !== "paginated") return;
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        navigatePrev();
      } else if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) {
        e.preventDefault();
        navigateNext();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [navigatePrev, navigateNext]);

  // ── Combined mount + prop-change effect ──────────────────────────────────
  //
  // Handles initial render (mountedRef.current === false) and all subsequent
  // prop changes in one effect, so all dependencies are declared explicitly
  // and no eslint-disable directives are needed.

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      sectionRef.current = currentSection;
      anchorRef.current = anchor;
      modeRef.current = mode;
      zoomRef.current = zoom;
      themeRef.current = theme;

      if (mode === "paginated") {
        renderPaginatedThenRestore(currentSection, zoom, anchor);
      } else {
        renderScrolled(currentSection);
        restoreOnNextFrame(anchor, mode, zoom);
      }
      return;
    }

    const sectionChanged = sectionRef.current !== currentSection;
    const zoomChanged = zoomRef.current !== zoom;
    const themeChanged = themeRef.current !== theme;
    const modeChanged = modeRef.current !== mode;

    const positionBeforeModeChange = modeChanged ? readVisiblePosition() : null;

    if (!sectionChanged && !zoomChanged && !themeChanged && !modeChanged) {
      if (mode === "scrolled" && flowRef.current?.childElementCount === 0) {
        renderScrolled(currentSection);
        restoreOnNextFrame(anchor, mode, zoom);
      }
      return;
    }

    const targetSection =
      positionBeforeModeChange?.sectionIndex ?? currentSection;
    const targetAnchor = positionBeforeModeChange?.anchor ?? anchorRef.current;

    if (positionBeforeModeChange) {
      anchorRef.current = positionBeforeModeChange.anchor;
      idleHandleRef.current?.cancel();
      idleHandleRef.current = null;
      onPositionChangeRef.current(positionBeforeModeChange);
    }

    sectionRef.current = targetSection;
    zoomRef.current = zoom;
    themeRef.current = theme;
    modeRef.current = mode;

    if ((zoomChanged || themeChanged) && hostStyleRef.current) {
      hostStyleRef.current.textContent = buildHostStyle(zoom, theme);
    }

    if (modeChanged) {
      teardownScrolled();
      if (mode === "paginated") {
        renderPaginatedThenRestore(targetSection, zoom, targetAnchor);
      } else {
        renderScrolled(targetSection);
        restoreOnNextFrame(targetAnchor, mode, zoom);
      }
      return;
    }

    if (sectionChanged) {
      if (mode === "paginated") {
        renderPaginatedThenRestore(currentSection, zoom, anchor);
      } else {
        teardownScrolled();
        renderScrolled(currentSection);
        restoreOnNextFrame(anchor, mode, zoom);
      }
      return;
    }

    if (zoomChanged) {
      if (mode === "paginated") {
        renderPaginatedThenRestore(currentSection, zoom, anchorRef.current);
      } else {
        restoreOnNextFrame(anchorRef.current, mode, zoom);
      }
    }
    // theme-only: style already updated above; no re-render needed
  }, [
    currentSection,
    zoom,
    theme,
    mode,
    anchor,
    readVisiblePosition,
    renderPaginatedThenRestore,
    renderScrolled,
    teardownScrolled,
    restoreOnNextFrame,
  ]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      teardownScrolled(true);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      disposeFontsRef.current();
      disposeFontsRef.current = () => {};
    };
  }, [teardownScrolled]);

  // ── ResizeObserver ────────────────────────────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    reportViewport();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      reportViewport();
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (modeRef.current === "paginated") {
          const rect = wrapper.getBoundingClientRect();
          const last = lastPaginatedViewportRef.current;
          if (last && viewportsAlmostEqual(last, rect)) {
            return;
          }
          renderPaginatedThenRestore(
            sectionRef.current,
            zoomRef.current,
            anchorRef.current,
          );
        } else {
          restoreOnNextFrame(
            anchorRef.current,
            modeRef.current,
            zoomRef.current,
          );
        }
      }, 100);
    });

    resizeObserverRef.current = ro;
    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      resizeObserverRef.current = null;
      if (debounce) clearTimeout(debounce);
    };
  }, [renderPaginatedThenRestore, restoreOnNextFrame, reportViewport]);

  // ── Scroll → save anchor (scrolled mode) ─────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || mode !== "scrolled") return;
    const handleScroll = () => {
      if (scrollFrameRef.current === null) {
        scrollFrameRef.current = requestAnimationFrame(() => {
          scrollFrameRef.current = null;
          ensureScrolledRangeAroundViewport();
          updateScrolledSectionFromViewport();
        });
      }
      scheduleScrolledPositionSave();
    };
    wrapper.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      wrapper.removeEventListener("scroll", handleScroll);
      cancelPendingScrolledWork();
    };
  }, [
    mode,
    ensureScrolledRangeAroundViewport,
    updateScrolledSectionFromViewport,
    scheduleScrolledPositionSave,
    cancelPendingScrolledWork,
  ]);

  return {
    wrapperRef,
    hostRef,
    pageInSection,
    pageCount,
    navigatePrev,
    navigateNext,
  };
}
