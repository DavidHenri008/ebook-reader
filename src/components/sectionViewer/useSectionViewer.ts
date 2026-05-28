/**
 * Orchestration hook for SectionViewer: manages all shadow-DOM refs, renders,
 * and navigation. The presentational component is a thin wrapper around this.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import type { RawSection } from "../../types/bookPages";
import type { Theme } from "../../types/storage";
import type { PageViewport } from "../../services/pageEstimation";
import {
  scheduleIdle,
  getTopmostVisibleAnchor,
  findNodeAtOffset,
  getTopmostVisibleSection,
} from "./anchor";
import {
  buildHostStyle,
  setSectionContent,
  waitForContentLayout,
  measureLogicalContentHeight,
  nextAnimationFrame,
  initShadowHost,
} from "./shadowHost";
import {
  lookupSection,
  createScrolledSection,
  createScrolledSentinel,
  getMountedScrolledSection,
} from "./scrolled";
import { getColDims } from "./paginated";

export interface SectionViewerProps {
  sections: RawSection[];
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

export interface UseSectionViewerResult {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  hostRef: React.RefObject<HTMLDivElement | null>;
  pageInSection: number;
  pageCount: number;
  navigatePrev: () => void;
  navigateNext: () => void;
}

export function useSectionViewer({
  sections,
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
  const clampRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<HTMLDivElement | null>(null);

  // ── Live prop mirrors — avoid stale closures in callbacks ───────────────
  const sectionRef = useRef(currentSection);
  const anchorRef = useRef(anchor);
  const modeRef = useRef(mode);
  const zoomRef = useRef(zoom);
  const themeRef = useRef(theme);
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

  // ── Idle/timer handle (replaces separate saveTimer + saveIdleCallback) ──
  const idleHandleRef = useRef<{ cancel: () => void } | null>(null);

  // ── Observer refs ───────────────────────────────────────────────────────
  const intersectObserverRef = useRef<IntersectionObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── Mount guard (used by the combined prop-change effect) ───────────────
  const mountedRef = useRef(false);

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
    if (
      previous &&
      Math.abs(previous.width - rect.width) < 0.5 &&
      Math.abs(previous.height - rect.height) < 0.5
    ) {
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
    );
    shadowRef.current = parts.shadow;
    hostStyleRef.current = parts.style;
    clampRef.current = parts.clamp;
    colsRef.current = parts.cols;
    flowRef.current = parts.flow;
    return { clamp: parts.clamp, cols: parts.cols, flow: parts.flow };
  }, []);

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
      const visibleSection = getTopmostVisibleSection(
        contentRoot,
        rect.top,
        rect.bottom,
      );
      const visibleSectionIndex = Number(visibleSection?.dataset.sectionIndex);
      if (visibleSection && Number.isFinite(visibleSectionIndex)) {
        anchorRoot = visibleSection;
        sectionIndex = visibleSectionIndex;
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

  const saveAnchor = useCallback(() => {
    const position = readVisiblePosition();
    if (!position) return;

    const { sectionIndex, anchor: newAnchor } = position;
    anchorRef.current = newAnchor;

    if (modeRef.current === "scrolled" && sectionIndex !== sectionRef.current) {
      sectionRef.current = sectionIndex;
      onNavigateRef.current?.(sectionIndex);
    }

    idleHandleRef.current?.cancel();
    idleHandleRef.current = scheduleIdle(() => {
      onPositionChangeRef.current(position);
    });
  }, [readVisiblePosition]);

  const flushAnchor = useCallback(() => {
    const position = readVisiblePosition();
    if (!position) return;

    anchorRef.current = position.anchor;
    if (
      modeRef.current === "scrolled" &&
      position.sectionIndex !== sectionRef.current
    ) {
      sectionRef.current = position.sectionIndex;
      onNavigateRef.current?.(position.sectionIndex);
    }

    idleHandleRef.current?.cancel();
    idleHandleRef.current = null;
    onPositionChangeRef.current(position);
  }, [readVisiblePosition]);

  // Stable ref so IntersectionObserver callbacks always call the latest version
  const saveAnchorRef = useRef(saveAnchor);
  useEffect(() => {
    saveAnchorRef.current = saveAnchor;
  }, [saveAnchor]);

  const restoreAnchor = useCallback(
    (
      targetAnchor: number,
      targetMode: "paginated" | "scrolled",
      targetZoom: number,
    ) => {
      const contentRoot =
        targetMode === "paginated" ? colsRef.current : flowRef.current;
      if (!contentRoot) return;

      if (targetAnchor <= 0) {
        if (targetMode === "paginated") {
          const cols = colsRef.current;
          if (cols) {
            applyPage(0);
            cols.style.transform = "translateX(0)";
          }
        } else {
          const targetSection = getMountedScrolledSection(
            contentRoot,
            sectionRef.current,
          );
          if (sectionRef.current === 0) {
            wrapperRef.current?.scrollTo({ top: 0, behavior: "instant" });
          } else if (targetSection) {
            targetSection.scrollIntoView({
              block: "start",
              behavior: "instant" as ScrollBehavior,
            });
          } else {
            wrapperRef.current?.scrollTo({ top: 0, behavior: "instant" });
          }
        }
        return;
      }

      const searchRoot =
        targetMode === "scrolled"
          ? (getMountedScrolledSection(contentRoot, sectionRef.current) ??
            contentRoot)
          : contentRoot;
      const found =
        findNodeAtOffset(searchRoot, targetAnchor) ??
        (searchRoot === contentRoot
          ? null
          : findNodeAtOffset(contentRoot, targetAnchor));
      if (!found) return;

      if (targetMode === "paginated") {
        const cols = colsRef.current!;
        cols.style.transform = "";

        const range = document.createRange();
        range.setStart(found.node, found.offsetInNode);
        range.collapse(true);
        const rects = range.getClientRects();
        if (rects.length === 0) return;

        const host = hostRef.current!;
        const hostRect = host.getBoundingClientRect();
        const dims = getColDims(
          sectionViewportRef.current,
          wrapperRef.current,
          targetZoom,
        );
        const page = Math.max(
          0,
          Math.floor((rects[0].left - hostRect.left) / dims.pageWidth),
        );
        const clamped = Math.min(page, pageCountRef.current - 1);
        applyPage(clamped);
        cols.style.transform = `translateX(-${clamped * dims.colWidth}px)`;
      } else {
        const el = found.node.parentElement;
        if (el) {
          el.scrollIntoView({
            block: "start",
            behavior: "instant" as ScrollBehavior,
          });
        }
      }
    },
    [applyPage],
  );

  // ── Paginated render ─────────────────────────────────────────────────────

  const renderPaginated = useCallback(
    async (
      sIdx: number,
      zoomValue: number,
      targetPage: number,
    ): Promise<number> => {
      const renderId = paginatedRenderIdRef.current + 1;
      paginatedRenderIdRef.current = renderId;

      const { clamp, cols, flow } = ensureShadow();
      const section = lookupSection(sections, sIdx);
      if (!section) return 1;

      sectionViewportRef.current = section.viewport;
      const dims = getColDims(section.viewport, wrapperRef.current, zoomValue);
      lastPaginatedViewportRef.current = {
        width: dims.colWidth,
        height: dims.colHeight,
      };

      const host = hostRef.current!;
      host.style.width = `${dims.pageWidth}px`;
      host.style.height = `${dims.pageHeight}px`;

      flow.style.display = "none";
      clamp.style.cssText = `display:block;width:${dims.colWidth}px;height:${dims.colHeight}px;overflow:hidden;`;
      cols.style.cssText = `column-width:${dims.colWidth}px;column-gap:0;column-fill:auto;width:${dims.colWidth}px;height:${dims.colHeight}px;`;
      cols.style.transform = "";
      setSectionContent(cols, section.html);

      await waitForContentLayout(cols);
      if (renderId !== paginatedRenderIdRef.current)
        return pageCountRef.current;

      const zoomFactor = zoomValue / 100;
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
      const page = Math.min(Math.max(0, targetPage), count - 1);
      applyCount(count);
      applyPage(page);
      cols.style.transform = `translateX(-${page * dims.colWidth}px)`;
      return count;
    },
    [ensureShadow, sections, applyCount, applyPage],
  );

  // ── Scrolled render + helpers ────────────────────────────────────────────

  const teardownScrolled = useCallback(
    (flushPosition = false) => {
      if (flushPosition) flushAnchor();
      intersectObserverRef.current?.disconnect();
      intersectObserverRef.current = null;
      topSentinelRef.current = null;
      bottomSentinelRef.current = null;
      idleHandleRef.current?.cancel();
      idleHandleRef.current = null;
      flowRef.current?.replaceChildren();
      mountedRangeRef.current = {
        first: sectionRef.current,
        last: sectionRef.current,
      };
    },
    [flushAnchor],
  );

  const mountPreviousScrolledSection = useCallback((): boolean => {
    const range = mountedRangeRef.current;
    if (range.first <= 0) return false;

    const prevIdx = range.first - 1;
    const prevSection = lookupSection(sections, prevIdx);
    const topSentinel = topSentinelRef.current;
    const wrapper = wrapperRef.current;
    if (!prevSection || !topSentinel || !wrapper) return false;

    const previousScrollHeight = wrapper.scrollHeight;
    topSentinel.after(createScrolledSection(prevSection, prevIdx));
    mountedRangeRef.current = { ...range, first: prevIdx };

    const heightDelta = wrapper.scrollHeight - previousScrollHeight;
    if (heightDelta > 0) wrapper.scrollTop += heightDelta;
    return true;
  }, [sections]);

  const mountNextScrolledSection = useCallback((): boolean => {
    const range = mountedRangeRef.current;
    if (range.last >= sections.length - 1) return false;

    const nextIdx = range.last + 1;
    const nextSection = lookupSection(sections, nextIdx);
    const bottomSentinel = bottomSentinelRef.current;
    if (!nextSection || !bottomSentinel) return false;

    bottomSentinel.before(createScrolledSection(nextSection, nextIdx));
    mountedRangeRef.current = { ...range, last: nextIdx };
    return true;
  }, [sections]);

  const ensureScrolledRangeAroundViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || modeRef.current !== "scrolled") return;

    const threshold = Math.max(240, wrapper.clientHeight * 0.75);

    while (
      wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight <
        threshold &&
      mountedRangeRef.current.last < sections.length - 1 &&
      mountNextScrolledSection()
    ) {
      // fill short sections until the user can keep scrolling
    }

    while (
      wrapper.scrollTop < threshold &&
      mountedRangeRef.current.first > 0 &&
      mountPreviousScrolledSection()
    ) {
      // preserve scrollTop as content is added above
    }
  }, [mountNextScrolledSection, mountPreviousScrolledSection, sections.length]);

  const renderScrolled = useCallback(
    (sIdx: number) => {
      const renderId = scrolledRenderIdRef.current + 1;
      scrolledRenderIdRef.current = renderId;

      teardownScrolled();

      const { clamp, flow } = ensureShadow();
      clamp.style.display = "none";
      const host = hostRef.current!;
      host.style.width = "100%";
      host.style.height = "auto";
      host.style.minHeight = "100%";
      host.style.position = "relative";
      flow.style.cssText =
        "display:block;width:100%;position:relative;overflow:visible;";

      mountedRangeRef.current = { first: sIdx, last: sIdx };

      const section = lookupSection(sections, sIdx);
      if (!section) return;

      const topSentinel = createScrolledSentinel("top");
      const bottomSentinel = createScrolledSentinel("bottom");
      topSentinelRef.current = topSentinel;
      bottomSentinelRef.current = bottomSentinel;

      flow.appendChild(topSentinel);
      flow.appendChild(createScrolledSection(section, sIdx));
      flow.appendChild(bottomSentinel);

      requestAnimationFrame(() => {
        applyCount(1);
        applyPage(0);
      });

      const observer = new IntersectionObserver(
        (entries) => {
          if (renderId !== scrolledRenderIdRef.current) return;
          let mounted = false;
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const sentinel = entry.target as HTMLDivElement;
            if (sentinel.dataset.sentinel === "top") {
              mounted = mountPreviousScrolledSection() || mounted;
            } else if (sentinel.dataset.sentinel === "bottom") {
              mounted = mountNextScrolledSection() || mounted;
            }
          });
          if (mounted) {
            requestAnimationFrame(ensureScrolledRangeAroundViewport);
            saveAnchorRef.current();
          }
        },
        { root: wrapperRef.current, rootMargin: "600px 0px" },
      );
      observer.observe(topSentinel);
      observer.observe(bottomSentinel);
      intersectObserverRef.current = observer;

      requestAnimationFrame(() => {
        if (renderId === scrolledRenderIdRef.current) {
          ensureScrolledRangeAroundViewport();
        }
      });
      void waitForContentLayout(flow).then(() => {
        if (renderId === scrolledRenderIdRef.current) {
          ensureScrolledRangeAroundViewport();
        }
      });
    },
    [
      teardownScrolled,
      ensureShadow,
      sections,
      applyCount,
      applyPage,
      mountPreviousScrolledSection,
      mountNextScrolledSection,
      ensureScrolledRangeAroundViewport,
    ],
  );

  // ── Paginated navigation ─────────────────────────────────────────────────

  const navigatePrev = useCallback(() => {
    if (modeRef.current !== "paginated") return;
    const cols = colsRef.current;
    if (!cols) return;
    const dims = getColDims(
      sectionViewportRef.current,
      wrapperRef.current,
      zoomRef.current,
    );

    if (pageRef.current > 0) {
      const newPage = pageRef.current - 1;
      applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * dims.colWidth}px)`;
      saveAnchor();
    } else if (sectionRef.current > 0) {
      const prev = sectionRef.current - 1;
      sectionRef.current = prev;
      renderPaginated(prev, zoomRef.current, 99999).then((count) => {
        const lastPage = count - 1;
        const d = getColDims(
          sectionViewportRef.current,
          wrapperRef.current,
          zoomRef.current,
        );
        applyPage(lastPage);
        cols.style.transform = `translateX(-${lastPage * d.colWidth}px)`;
        saveAnchor();
      });
      onNavigateRef.current?.(prev);
    }
  }, [applyPage, saveAnchor, renderPaginated]);

  const navigateNext = useCallback(() => {
    if (modeRef.current !== "paginated") return;
    const cols = colsRef.current;
    if (!cols) return;
    const dims = getColDims(
      sectionViewportRef.current,
      wrapperRef.current,
      zoomRef.current,
    );

    if (pageRef.current < pageCountRef.current - 1) {
      const newPage = pageRef.current + 1;
      applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * dims.colWidth}px)`;
      saveAnchor();
    } else if (sectionRef.current < sections.length - 1) {
      const next = sectionRef.current + 1;
      sectionRef.current = next;
      renderPaginated(next, zoomRef.current, 0).then(() => saveAnchor());
      onNavigateRef.current?.(next);
    }
  }, [applyPage, saveAnchor, renderPaginated, sections.length]);

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
        renderPaginated(currentSection, zoom, 0).then(() => {
          requestAnimationFrame(() => restoreAnchor(anchor, mode, zoom));
        });
      } else {
        renderScrolled(currentSection);
        requestAnimationFrame(() => restoreAnchor(anchor, mode, zoom));
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
        requestAnimationFrame(() => restoreAnchor(anchor, mode, zoom));
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
      if (mode === "paginated") {
        teardownScrolled();
        renderPaginated(targetSection, zoom, 0).then(() => {
          requestAnimationFrame(() => restoreAnchor(targetAnchor, mode, zoom));
        });
      } else {
        teardownScrolled();
        renderScrolled(targetSection);
        requestAnimationFrame(() => restoreAnchor(targetAnchor, mode, zoom));
      }
      return;
    }

    if (sectionChanged) {
      if (mode === "paginated") {
        renderPaginated(currentSection, zoom, 0).then(() => {
          requestAnimationFrame(() => restoreAnchor(anchor, mode, zoom));
        });
      } else {
        teardownScrolled();
        renderScrolled(currentSection);
        requestAnimationFrame(() => restoreAnchor(anchor, mode, zoom));
      }
      return;
    }

    if (zoomChanged) {
      if (mode === "paginated") {
        renderPaginated(currentSection, zoom, 0).then(() => {
          requestAnimationFrame(() =>
            restoreAnchor(anchorRef.current, mode, zoom),
          );
        });
      } else {
        requestAnimationFrame(() =>
          restoreAnchor(anchorRef.current, mode, zoom),
        );
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
    renderPaginated,
    renderScrolled,
    teardownScrolled,
    restoreAnchor,
  ]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      teardownScrolled(true);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
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
          if (
            last &&
            Math.abs(last.width - rect.width) < 0.5 &&
            Math.abs(last.height - rect.height) < 0.5
          ) {
            return;
          }
          renderPaginated(sectionRef.current, zoomRef.current, 0).then(() => {
            requestAnimationFrame(() =>
              restoreAnchor(
                anchorRef.current,
                modeRef.current,
                zoomRef.current,
              ),
            );
          });
        } else {
          requestAnimationFrame(() =>
            restoreAnchor(anchorRef.current, modeRef.current, zoomRef.current),
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
  }, [renderPaginated, restoreAnchor, reportViewport]);

  // ── Scroll → save anchor (scrolled mode) ─────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || mode !== "scrolled") return;
    const handleScroll = () => {
      ensureScrolledRangeAroundViewport();
      saveAnchor();
    };
    wrapper.addEventListener("scroll", handleScroll, { passive: true });
    return () => wrapper.removeEventListener("scroll", handleScroll);
  }, [mode, saveAnchor, ensureScrolledRangeAroundViewport]);

  return {
    wrapperRef,
    hostRef,
    pageInSection,
    pageCount,
    navigatePrev,
    navigateNext,
  };
}
