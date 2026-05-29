/**
 * Scrolled-mode engine. Owns sentinel mount/unmount, the mounted section
 * range, the `IntersectionObserver` that grows the range, idle position
 * saves, and anchor restore for scrolled reading. Complements the DOM
 * utilities in `./scrolled`.
 *
 * Framework-agnostic: it reads and writes the shared {@link
 * ViewerControllerContext} and never touches React directly.
 */

import type { ViewerControllerContext } from "../../reader/viewerControllerContext";
import { findNodeAtOffset } from "../../reader/anchor";
import { waitForContentLayout } from "../../reader/shadowHost";
import {
  createScrolledSection,
  createScrolledSentinel,
  getMountedScrolledSection,
  lookupSection,
  readTopmostVisibleSection,
} from "./scrolled";

const SCROLLED_POSITION_SAVE_DELAY_MS = 160;

export interface ScrolledController {
  render: (sIdx: number) => void;
  teardown: (flushPosition?: boolean) => void;
  ensureRangeAroundViewport: () => void;
  updateSectionFromViewport: () => void;
  schedulePositionSave: () => void;
  cancelPendingWork: () => void;
  restore: (targetAnchor: number) => void;
}

export function createScrolledController(
  ctx: ViewerControllerContext,
): ScrolledController {
  const cancelPendingWork = (): void => {
    if (ctx.scrollFrameRef.current !== null) {
      cancelAnimationFrame(ctx.scrollFrameRef.current);
      ctx.scrollFrameRef.current = null;
    }

    if (ctx.scrolledPositionSaveTimerRef.current) {
      clearTimeout(ctx.scrolledPositionSaveTimerRef.current);
      ctx.scrolledPositionSaveTimerRef.current = null;
    }
  };

  const schedulePositionSave = (): void => {
    if (ctx.scrolledPositionSaveTimerRef.current) {
      clearTimeout(ctx.scrolledPositionSaveTimerRef.current);
    }

    ctx.scrolledPositionSaveTimerRef.current = setTimeout(() => {
      ctx.scrolledPositionSaveTimerRef.current = null;
      ctx.saveAnchor();
    }, SCROLLED_POSITION_SAVE_DELAY_MS);
  };

  const updateSectionFromViewport = (): void => {
    const wrapper = ctx.wrapperRef.current;
    const contentRoot = ctx.flowRef.current;
    if (!wrapper || !contentRoot || ctx.modeRef.current !== "scrolled") return;

    if (ctx.mountedRangeRef.current.first === 0 && wrapper.scrollTop <= 2) {
      if (ctx.sectionRef.current !== 0) {
        ctx.sectionRef.current = 0;
        ctx.onNavigateRef.current?.(0);
      }
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const visible = readTopmostVisibleSection(
      contentRoot,
      rect.top,
      rect.bottom,
    );

    if (visible && visible.index !== ctx.sectionRef.current) {
      ctx.sectionRef.current = visible.index;
      ctx.onNavigateRef.current?.(visible.index);
    }
  };

  const teardown = (flushPosition = false): void => {
    if (flushPosition) ctx.flushAnchor();
    cancelPendingWork();
    ctx.intersectObserverRef.current?.disconnect();
    ctx.intersectObserverRef.current = null;
    ctx.topSentinelRef.current = null;
    ctx.bottomSentinelRef.current = null;
    ctx.idleHandleRef.current?.cancel();
    ctx.idleHandleRef.current = null;
    ctx.flowRef.current?.replaceChildren();
    ctx.mountedRangeRef.current = {
      first: ctx.sectionRef.current,
      last: ctx.sectionRef.current,
    };
  };

  const mountPreviousSection = (): boolean => {
    const range = ctx.mountedRangeRef.current;
    if (range.first <= 0) return false;

    const prevIdx = range.first - 1;
    const prevSection = lookupSection(ctx.getSections(), prevIdx);
    const topSentinel = ctx.topSentinelRef.current;
    const wrapper = ctx.wrapperRef.current;
    if (!prevSection || !topSentinel || !wrapper) return false;

    const previousScrollHeight = wrapper.scrollHeight;
    topSentinel.after(createScrolledSection(prevSection, prevIdx));
    ctx.mountedRangeRef.current = { ...range, first: prevIdx };

    const heightDelta = wrapper.scrollHeight - previousScrollHeight;
    if (heightDelta > 0) wrapper.scrollTop += heightDelta;
    return true;
  };

  const mountNextSection = (): boolean => {
    const range = ctx.mountedRangeRef.current;
    if (range.last >= ctx.getSections().length - 1) return false;

    const nextIdx = range.last + 1;
    const nextSection = lookupSection(ctx.getSections(), nextIdx);
    const bottomSentinel = ctx.bottomSentinelRef.current;
    if (!nextSection || !bottomSentinel) return false;

    bottomSentinel.before(createScrolledSection(nextSection, nextIdx));
    ctx.mountedRangeRef.current = { ...range, last: nextIdx };
    return true;
  };

  const ensureRangeAroundViewport = (): void => {
    const wrapper = ctx.wrapperRef.current;
    if (!wrapper || ctx.modeRef.current !== "scrolled") return;

    const threshold = Math.max(240, wrapper.clientHeight * 0.75);

    while (
      wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight <
        threshold &&
      ctx.mountedRangeRef.current.last < ctx.getSections().length - 1 &&
      mountNextSection()
    ) {
      // fill short sections until the user can keep scrolling
    }

    while (
      wrapper.scrollTop < threshold &&
      ctx.mountedRangeRef.current.first > 0 &&
      mountPreviousSection()
    ) {
      // preserve scrollTop as content is added above
    }
  };

  const render = (sIdx: number): void => {
    const renderId = ctx.scrolledRenderIdRef.current + 1;
    ctx.scrolledRenderIdRef.current = renderId;

    teardown();

    const { clamp, flow } = ctx.ensureShadow();
    clamp.style.display = "none";
    const host = ctx.hostRef.current!;
    host.style.width = "100%";
    host.style.height = "auto";
    host.style.minHeight = "100%";
    host.style.position = "relative";
    flow.style.cssText =
      "display:block;width:100%;position:relative;overflow:visible;";

    ctx.mountedRangeRef.current = { first: sIdx, last: sIdx };

    const section = lookupSection(ctx.getSections(), sIdx);
    if (!section) return;

    const topSentinel = createScrolledSentinel("top");
    const bottomSentinel = createScrolledSentinel("bottom");
    ctx.topSentinelRef.current = topSentinel;
    ctx.bottomSentinelRef.current = bottomSentinel;

    flow.appendChild(topSentinel);
    flow.appendChild(createScrolledSection(section, sIdx));
    flow.appendChild(bottomSentinel);

    requestAnimationFrame(() => {
      ctx.applyCount(1);
      ctx.applyPage(0);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (renderId !== ctx.scrolledRenderIdRef.current) return;
        let mounted = false;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const sentinel = entry.target as HTMLDivElement;
          if (sentinel.dataset.sentinel === "top") {
            mounted = mountPreviousSection() || mounted;
          } else if (sentinel.dataset.sentinel === "bottom") {
            mounted = mountNextSection() || mounted;
          }
        });
        if (mounted) {
          requestAnimationFrame(() => {
            ensureRangeAroundViewport();
            updateSectionFromViewport();
          });
          schedulePositionSave();
        }
      },
      { root: ctx.wrapperRef.current, rootMargin: "600px 0px" },
    );
    observer.observe(topSentinel);
    observer.observe(bottomSentinel);
    ctx.intersectObserverRef.current = observer;

    requestAnimationFrame(() => {
      if (renderId === ctx.scrolledRenderIdRef.current) {
        ensureRangeAroundViewport();
      }
    });
    void waitForContentLayout(flow).then(() => {
      if (renderId === ctx.scrolledRenderIdRef.current) {
        ensureRangeAroundViewport();
      }
    });
  };

  const restore = (targetAnchor: number): void => {
    const contentRoot = ctx.flowRef.current;
    if (!contentRoot) return;

    if (targetAnchor <= 0) {
      const targetSection = getMountedScrolledSection(
        contentRoot,
        ctx.sectionRef.current,
      );
      if (ctx.sectionRef.current === 0) {
        ctx.wrapperRef.current?.scrollTo({ top: 0, behavior: "instant" });
      } else if (targetSection) {
        targetSection.scrollIntoView({
          block: "start",
          behavior: "instant" as ScrollBehavior,
        });
      } else {
        ctx.wrapperRef.current?.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    const searchRoot =
      getMountedScrolledSection(contentRoot, ctx.sectionRef.current) ??
      contentRoot;
    const found =
      findNodeAtOffset(searchRoot, targetAnchor) ??
      (searchRoot === contentRoot
        ? null
        : findNodeAtOffset(contentRoot, targetAnchor));
    if (!found) return;

    const el = found.node.parentElement;
    if (el) {
      el.scrollIntoView({
        block: "start",
        behavior: "instant" as ScrollBehavior,
      });
    }
  };

  return {
    render,
    teardown,
    ensureRangeAroundViewport,
    updateSectionFromViewport,
    schedulePositionSave,
    cancelPendingWork,
    restore,
  };
}
