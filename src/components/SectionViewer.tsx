import { useRef, useEffect, useCallback, useState } from "react";
import styled from "@emotion/styled";
import type { RawSection } from "../types/bookPages";
import type { Theme } from "../types/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const OuterContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

const Wrapper = styled.div<{ $mode: "paginated" | "scrolled" }>`
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg, #fff);
  display: ${(p) => (p.$mode === "paginated" ? "grid" : "block")};
  align-items: ${(p) => (p.$mode === "paginated" ? "safe center" : "stretch")};
  justify-items: ${(p) =>
    p.$mode === "paginated" ? "safe center" : "stretch"};
`;

const NavButton = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  cursor: pointer;
  font-size: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 12px;
  &:hover {
    background: rgba(0, 0, 0, 0.65);
  }

  &:disabled {
    cursor: default;
    opacity: 0.35;
    background: rgba(0, 0, 0, 0.25);
  }
`;

// ---------------------------------------------------------------------------
// Shadow DOM style builder
// ---------------------------------------------------------------------------

const THEME_CSS: Record<Theme, string> = {
  light:
    "--bg:#ffffff;--text:#6b6375;--text-heading:#08060d;--border:#e5e4e7;color-scheme:light;",
  dark: "--bg:#16171d;--text:#9ca3af;--text-heading:#f3f4f6;--border:#2e303a;color-scheme:dark;",
};

function buildHostStyle(zoom: number, theme: Theme): string {
  return `
    :host{display:block;width:100%;${THEME_CSS[theme]}}
    .clamp,.flow{zoom:${zoom / 100};}
    .flow{display:block;position:relative;overflow:visible;}
    .cols,.flow-section{position:relative;z-index:0;isolation:isolate;}
    .flow-section html,.flow-section body{display:block;margin:0;padding:0;max-width:100%;}
    .flow-sentinel{display:block;width:100%;height:1px;clear:both;pointer-events:none;}
    img,svg{max-width:100%;height:auto;}
  `;
}

function setSectionContent(container: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const htmlElement = document.createElement("html");
  Array.from(parsed.documentElement.attributes).forEach((attr) => {
    htmlElement.setAttribute(attr.name, attr.value);
  });

  const head = document.createElement("head");
  Array.from(parsed.head.childNodes).forEach((node) => {
    head.appendChild(document.importNode(node, true));
  });

  const body = document.createElement("body");
  Array.from(parsed.body.attributes).forEach((attr) => {
    body.setAttribute(attr.name, attr.value);
  });
  Array.from(parsed.body.childNodes).forEach((node) => {
    body.appendChild(document.importNode(node, true));
  });

  htmlElement.append(head, body);
  container.replaceChildren(htmlElement);
}

function createScrolledSection(
  section: RawSection,
  sectionIndex: number,
): HTMLDivElement {
  const sectionWrapper = document.createElement("div");
  sectionWrapper.className = "flow-section";
  sectionWrapper.dataset.sectionIndex = String(sectionIndex);

  const viewportStyle = section.viewport
    ? `width:${section.viewport.width}px;min-height:${section.viewport.height}px;`
    : "width:100%;min-height:0;";

  sectionWrapper.style.cssText =
    "display:block;position:relative;box-sizing:border-box;" +
    "isolation:isolate;z-index:0;flex:none;margin:0 auto;" +
    "overflow:visible;" +
    viewportStyle;

  setSectionContent(sectionWrapper, section.html);
  return sectionWrapper;
}

function createScrolledSentinel(position: "top" | "bottom"): HTMLDivElement {
  const sentinel = document.createElement("div");
  sentinel.className = "flow-sentinel";
  sentinel.dataset.sentinel = position;
  sentinel.style.cssText =
    "display:block;width:100%;height:1px;clear:both;" +
    "pointer-events:none;flex:none;";
  return sentinel;
}

function getMountedScrolledSection(
  root: Element,
  sectionIndex: number,
): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-section-index]")).find(
      (element) => Number(element.dataset.sectionIndex) === sectionIndex,
    ) ?? null
  );
}

function getTopmostVisibleSection(
  root: Element,
  viewTop: number,
  viewBottom: number,
): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestTop = Number.POSITIVE_INFINITY;

  Array.from(
    root.querySelectorAll<HTMLElement>("[data-section-index]"),
  ).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    if (rect.bottom <= viewTop || rect.top >= viewBottom) return;

    const visibleTop = Math.max(rect.top, viewTop);
    if (visibleTop < bestTop) {
      best = element;
      bestTop = visibleTop;
    }
  });

  return best;
}

function isReadableTextNode(node: Text): boolean {
  const parent = node.parentElement;
  return !parent?.closest("style,script,noscript,head,title,meta,link");
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForContentLayout(root: Element): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return image.decode?.().catch(() => undefined) ?? Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }).then(() => image.decode?.().catch(() => undefined));
    }),
  );
  await document.fonts?.ready.catch(() => undefined);
  await nextAnimationFrame();
  await nextAnimationFrame();
}

function measureLogicalContentHeight(
  root: HTMLElement,
  zoomFactor: number,
  minimumHeight: number,
): number {
  const rootRect = root.getBoundingClientRect();
  let contentHeight = root.scrollHeight;

  Array.from(root.querySelectorAll("*")).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    contentHeight = Math.max(
      contentHeight,
      (rect.bottom - rootRect.top) / zoomFactor,
    );
  });

  return Math.ceil(Math.max(minimumHeight, contentHeight));
}

// ---------------------------------------------------------------------------
// Anchor utilities
// ---------------------------------------------------------------------------

/**
 * Walk text nodes inside `root` and return the char offset of the first
 * text node whose bounding rect is at least partially inside
 * [viewTop, viewBottom] in viewport coords.
 */
function getTopmostVisibleAnchor(
  root: Element,
  viewTop: number,
  viewBottom: number,
): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!isReadableTextNode(node)) continue;
    const len = node.textContent?.length ?? 0;
    if (len > 0) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width > 0 && r.bottom > viewTop && r.top < viewBottom) {
          return charOffset;
        }
      }
    }
    charOffset += len;
  }
  return charOffset;
}

/**
 * Walk text nodes inside `root` and find the node + in-node offset
 * corresponding to `targetOffset` total characters.
 */
function findNodeAtOffset(
  root: Element,
  targetOffset: number,
): { node: Text; offsetInNode: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let charOffset = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (!isReadableTextNode(node)) continue;
    const len = node.textContent?.length ?? 0;
    if (charOffset + len > targetOffset) {
      return { node, offsetInNode: targetOffset - charOffset };
    }
    charOffset += len;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section lookup (by index or spine position)
// ---------------------------------------------------------------------------

function lookupSection(
  sections: RawSection[],
  idx: number,
): RawSection | undefined {
  return sections[idx] ?? sections.find((s) => s.index === idx);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SectionViewer({
  sections,
  currentSection,
  anchor,
  zoom,
  mode,
  theme,
  onPositionChange,
  onNavigate,
}: SectionViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // React state (for button visibility)
  const [pageInSection, setPageInSection] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  // Shadow DOM refs — created once on mount
  const shadowRef = useRef<ShadowRoot | null>(null);
  const hostStyleRef = useRef<HTMLStyleElement | null>(null);
  /** Clips the column container in paginated mode */
  const clampRef = useRef<HTMLDivElement | null>(null);
  /** Multi-column container; translated horizontally to show current page */
  const colsRef = useRef<HTMLDivElement | null>(null);
  /** Single-flow container for scrolled mode */
  const flowRef = useRef<HTMLDivElement | null>(null);

  // Mutable "live" refs — avoid stale closures
  const sectionRef = useRef(currentSection);
  const anchorRef = useRef(anchor);
  const modeRef = useRef(mode);
  const zoomRef = useRef(zoom);
  const themeRef = useRef(theme);
  const pageRef = useRef(0);
  const pageCountRef = useRef(1);
  const paginatedRenderIdRef = useRef(0);
  const scrolledRenderIdRef = useRef(0);
  /** Viewport declared by the current section's meta viewport tag, if any */
  const sectionViewportRef = useRef<
    { width: number; height: number } | undefined
  >(undefined);
  const lastPaginatedViewportRef = useRef<{
    width: number;
    height: number;
  } | null>(null);

  // Scrolled mode: tracks which section indices are currently in the DOM
  const mountedRangeRef = useRef({
    first: currentSection,
    last: currentSection,
  });
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);

  // Timer / observer refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intersectObserverRef = useRef<IntersectionObserver | null>(null);

  // Stable ref to onNavigate so sentinel callbacks never go stale
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  // Stable ref to onPositionChange
  const onPositionChangeRef = useRef(onPositionChange);
  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  // ── Atomic state update helpers ─────────────────────────────────────────

  const applyPage = useCallback((p: number) => {
    pageRef.current = p;
    setPageInSection(p);
  }, []);

  const applyCount = useCallback((c: number) => {
    pageCountRef.current = c;
    setPageCount(c);
  }, []);

  // ── Column dimension math ────────────────────────────────────────────────

  /**
   * Logical page dimensions for the content plus the physical page box reserved
   * by the outer host. Border-box dimensions avoid resize feedback when
   * scrollbars appear or disappear.
   */
  const getColDims = useCallback((zoomValue: number) => {
    const zoomFactor = zoomValue / 100;

    // Prefer the section's declared viewport dimensions when available.
    const sv = sectionViewportRef.current;
    if (sv) {
      return {
        colWidth: sv.width,
        colHeight: sv.height,
        pageWidth: sv.width * zoomFactor,
        pageHeight: sv.height * zoomFactor,
      };
    }

    // Fall back to the wrapper's border-box dimensions.
    const w = wrapperRef.current;
    const rect = w?.getBoundingClientRect();
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
  }, []);

  // ── Shadow DOM initialisation ────────────────────────────────────────────

  /**
   * Create the shadow root and its child elements on first call.
   * Subsequent calls are no-ops (returns existing refs).
   */
  const ensureShadow = useCallback((): {
    shadow: ShadowRoot;
    clamp: HTMLDivElement;
    cols: HTMLDivElement;
    flow: HTMLDivElement;
  } => {
    const host = hostRef.current!;
    let shadow = shadowRef.current;
    if (!shadow) {
      shadow = host.attachShadow({ mode: "open" });
      shadowRef.current = shadow;

      const style = document.createElement("style");
      style.textContent = buildHostStyle(zoomRef.current, themeRef.current);
      hostStyleRef.current = style;
      shadow.appendChild(style);

      const clamp = document.createElement("div");
      clamp.className = "clamp";
      clampRef.current = clamp;

      const cols = document.createElement("div");
      cols.className = "cols";
      colsRef.current = cols;
      clamp.appendChild(cols);

      const flow = document.createElement("div");
      flow.className = "flow";
      flowRef.current = flow;

      shadow.appendChild(clamp);
      shadow.appendChild(flow);
    }
    return {
      shadow,
      clamp: clampRef.current!,
      cols: colsRef.current!,
      flow: flowRef.current!,
    };
  }, []);

  // ── Anchor save / restore ────────────────────────────────────────────────

  const saveAnchor = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const contentRoot =
      modeRef.current === "paginated" ? colsRef.current : flowRef.current;
    if (!contentRoot) return;

    const rect = wrapper.getBoundingClientRect();
    let anchorRoot: Element = contentRoot;
    let sectionIndex = sectionRef.current;

    if (modeRef.current === "scrolled") {
      const visibleSection = getTopmostVisibleSection(
        contentRoot,
        rect.top,
        rect.bottom,
      );
      if (visibleSection) {
        anchorRoot = visibleSection;
        sectionIndex = Number(visibleSection.dataset.sectionIndex);
      }
    }

    const newAnchor = getTopmostVisibleAnchor(
      anchorRoot,
      rect.top,
      rect.bottom,
    );
    anchorRef.current = newAnchor;

    if (modeRef.current === "scrolled" && sectionIndex !== sectionRef.current) {
      sectionRef.current = sectionIndex;
      onNavigateRef.current?.(sectionIndex);
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onPositionChangeRef.current({
        sectionIndex,
        anchor: newAnchor,
      });
    }, 300);
  }, []);

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
      if (targetAnchor <= 0) return;

      const contentRoot =
        targetMode === "paginated" ? colsRef.current : flowRef.current;
      if (!contentRoot) return;

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
        // Reset any existing translation so getBoundingClientRect gives raw content position
        cols.style.transform = "";

        const range = document.createRange();
        range.setStart(found.node, found.offsetInNode);
        range.collapse(true);
        const rects = range.getClientRects();
        if (rects.length === 0) return;

        // In physical pixels, column N starts at hostLeft + N * pageWidth.
        const host = hostRef.current!;
        const hostRect = host.getBoundingClientRect();
        const { pageWidth: physColWidth } = getColDims(targetZoom);
        const page = Math.max(
          0,
          Math.floor((rects[0].left - hostRect.left) / physColWidth),
        );
        const clamped = Math.min(page, pageCountRef.current - 1);

        const { colWidth } = getColDims(targetZoom);
        applyPage(clamped);
        cols.style.transform = `translateX(-${clamped * colWidth}px)`;
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
    [applyPage, getColDims],
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
      if (!section) {
        return 1;
      }

      // Update the active viewport so getColDims uses the section's own dimensions.
      sectionViewportRef.current = section.viewport;

      const { colWidth, colHeight, pageWidth, pageHeight } =
        getColDims(zoomValue);
      lastPaginatedViewportRef.current = {
        width: colWidth,
        height: colHeight,
      };
      const host = hostRef.current!;
      host.style.width = `${pageWidth}px`;
      host.style.height = `${pageHeight}px`;

      flow.style.display = "none";
      clamp.style.cssText = `display:block;width:${colWidth}px;height:${colHeight}px;overflow:hidden;`;
      cols.style.cssText = `column-width:${colWidth}px;column-gap:0;column-fill:auto;width:${colWidth}px;height:${colHeight}px;`;
      cols.style.transform = "";
      setSectionContent(cols, section.html);

      await waitForContentLayout(cols);

      if (renderId !== paginatedRenderIdRef.current) {
        return pageCountRef.current;
      }

      const zoomFactor = zoomValue / 100;
      const contentHeight = measureLogicalContentHeight(
        cols,
        zoomFactor,
        colHeight,
      );
      host.style.height = `${contentHeight * zoomFactor}px`;
      clamp.style.height = `${contentHeight}px`;
      cols.style.height = `${contentHeight}px`;

      await nextAnimationFrame();

      const count = Math.max(1, Math.ceil(cols.scrollWidth / colWidth));
      const page = Math.min(Math.max(0, targetPage), count - 1);
      applyCount(count);
      applyPage(page);
      cols.style.transform = `translateX(-${page * colWidth}px)`;
      return count;
    },
    [ensureShadow, sections, getColDims, applyCount, applyPage],
  );

  // ── Scrolled render ──────────────────────────────────────────────────────

  const mountPreviousScrolledSection = useCallback((): boolean => {
    const range = mountedRangeRef.current;
    if (range.first <= 0) return false;

    const prevIdx = range.first - 1;
    const prevSection = lookupSection(sections, prevIdx);
    const topSentinel = topSentinelRef.current;
    const wrapper = wrapperRef.current;
    if (!prevSection || !topSentinel || !wrapper) return false;

    const previousScrollHeight = wrapper.scrollHeight;
    const sectionElement = createScrolledSection(prevSection, prevIdx);
    topSentinel.after(sectionElement);
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

    const sectionElement = createScrolledSection(nextSection, nextIdx);
    bottomSentinel.before(sectionElement);
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
      // Keep filling short sections until the user can keep scrolling.
    }

    while (
      wrapper.scrollTop < threshold &&
      mountedRangeRef.current.first > 0 &&
      mountPreviousScrolledSection()
    ) {
      // Preserve scrollTop in mountPreviousScrolledSection as content is added.
    }
  }, [mountNextScrolledSection, mountPreviousScrolledSection, sections.length]);

  const renderScrolled = useCallback(
    (sIdx: number) => {
      const renderId = scrolledRenderIdRef.current + 1;
      scrolledRenderIdRef.current = renderId;

      const { clamp, flow } = ensureShadow();

      // Disconnect any previous observer
      intersectObserverRef.current?.disconnect();
      intersectObserverRef.current = null;
      topSentinelRef.current = null;
      bottomSentinelRef.current = null;

      clamp.style.display = "none";
      const host = hostRef.current!;
      host.style.width = "100%";
      host.style.height = "auto";
      host.style.minHeight = "100%";
      host.style.position = "relative";
      flow.style.cssText =
        "display:block;width:100%;position:relative;overflow:visible;";
      flow.replaceChildren();

      mountedRangeRef.current = { first: sIdx, last: sIdx };

      const section = lookupSection(sections, sIdx);
      if (!section) return;

      // Sentinel elements for lazy adjacent-section loading
      const topSentinel = createScrolledSentinel("top");
      const bottomSentinel = createScrolledSentinel("bottom");
      topSentinelRef.current = topSentinel;
      bottomSentinelRef.current = bottomSentinel;

      flow.appendChild(topSentinel);
      flow.appendChild(createScrolledSection(section, sIdx));
      flow.appendChild(bottomSentinel);

      applyCount(1);
      applyPage(0);

      const observer = new IntersectionObserver(
        (entries) => {
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
    const { colWidth } = getColDims(zoomRef.current);

    if (pageRef.current > 0) {
      const newPage = pageRef.current - 1;
      applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * colWidth}px)`;
      saveAnchor();
    } else if (sectionRef.current > 0) {
      const prev = sectionRef.current - 1;
      sectionRef.current = prev;
      renderPaginated(prev, zoomRef.current, 99999).then((count) => {
        const lastPage = count - 1;
        const { colWidth: cw } = getColDims(zoomRef.current);
        applyPage(lastPage);
        cols.style.transform = `translateX(-${lastPage * cw}px)`;
        saveAnchor();
      });
      onNavigateRef.current?.(prev);
    }
  }, [getColDims, applyPage, saveAnchor, renderPaginated]);

  const navigateNext = useCallback(() => {
    if (modeRef.current !== "paginated") return;
    const cols = colsRef.current;
    if (!cols) return;
    const { colWidth } = getColDims(zoomRef.current);

    if (pageRef.current < pageCountRef.current - 1) {
      const newPage = pageRef.current + 1;
      applyPage(newPage);
      cols.style.transform = `translateX(-${newPage * colWidth}px)`;
      saveAnchor();
    } else if (sectionRef.current < sections.length - 1) {
      const next = sectionRef.current + 1;
      sectionRef.current = next;
      renderPaginated(next, zoomRef.current, 0);
      onNavigateRef.current?.(next);
    }
  }, [getColDims, applyPage, saveAnchor, renderPaginated, sections.length]);

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

  // ── Mount: init shadow + initial render ──────────────────────────────────

  useEffect(() => {
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

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      intersectObserverRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── React to currentSection prop change ──────────────────────────────────

  useEffect(() => {
    if (sectionRef.current === currentSection) return;
    sectionRef.current = currentSection;

    if (modeRef.current === "paginated") {
      renderPaginated(currentSection, zoomRef.current, 0).then(() => {
        requestAnimationFrame(() =>
          restoreAnchor(anchor, modeRef.current, zoomRef.current),
        );
      });
    } else {
      renderScrolled(currentSection);
      requestAnimationFrame(() =>
        restoreAnchor(anchor, modeRef.current, zoomRef.current),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection]);

  // ── React to zoom change ──────────────────────────────────────────────────

  useEffect(() => {
    if (zoomRef.current === zoom) return;
    zoomRef.current = zoom;

    // Update content zoom in the shadow style sheet
    if (hostStyleRef.current) {
      hostStyleRef.current.textContent = buildHostStyle(zoom, themeRef.current);
    }

    if (modeRef.current === "paginated") {
      // Re-paginate with new column dimensions
      renderPaginated(sectionRef.current, zoom, 0).then(() => {
        requestAnimationFrame(() =>
          restoreAnchor(anchorRef.current, modeRef.current, zoom),
        );
      });
    }
    // Scrolled mode: CSS zoom reflows content automatically; just restore position
    else {
      requestAnimationFrame(() =>
        restoreAnchor(anchorRef.current, modeRef.current, zoom),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // ── React to theme change ─────────────────────────────────────────────────

  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;

    if (hostStyleRef.current) {
      hostStyleRef.current.textContent = buildHostStyle(zoomRef.current, theme);
    }
  }, [theme]);

  // ── React to mode change ──────────────────────────────────────────────────

  useEffect(() => {
    if (modeRef.current === mode) return;
    modeRef.current = mode;

    if (mode === "paginated") {
      renderPaginated(sectionRef.current, zoomRef.current, 0).then(() => {
        requestAnimationFrame(() =>
          restoreAnchor(anchorRef.current, mode, zoomRef.current),
        );
      });
    } else {
      renderScrolled(sectionRef.current);
      requestAnimationFrame(() =>
        restoreAnchor(anchorRef.current, mode, zoomRef.current),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── ResizeObserver ────────────────────────────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
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
          // Scrolled: CSS zoom handles reflow; restore position
          requestAnimationFrame(() =>
            restoreAnchor(anchorRef.current, modeRef.current, zoomRef.current),
          );
        }
      }, 100);
    });

    ro.observe(wrapper);
    return () => {
      ro.disconnect();
      if (debounce) clearTimeout(debounce);
    };
  }, [renderPaginated, restoreAnchor]);

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

  // ── Render ────────────────────────────────────────────────────────────────

  const isFirstSection = sectionRef.current === 0;
  const isLastSection = sectionRef.current === sections.length - 1;
  const atFirstPage = pageInSection === 0;
  const atLastPage = pageInSection === pageCount - 1;

  return (
    <OuterContainer>
      <Wrapper ref={wrapperRef} $mode={mode} tabIndex={0}>
        {/* Shadow DOM host — sized by the active renderer. */}
        <div ref={hostRef} />
      </Wrapper>

      {/* Paginated navigation buttons — positioned against OuterContainer, not the scroll area */}
      {mode === "paginated" && (
        <NavButton
          aria-label="Previous page"
          disabled={isFirstSection && atFirstPage}
          onClick={navigatePrev}
          style={{ left: 16 }}
        >
          &#8249;
        </NavButton>
      )}
      {mode === "paginated" && (
        <NavButton
          aria-label="Next page"
          disabled={isLastSection && atLastPage}
          onClick={navigateNext}
          style={{ right: 16 }}
        >
          &#8250;
        </NavButton>
      )}
    </OuterContainer>
  );
}

export default SectionViewer;
