/**
 * Scrolled-mode DOM utilities: section/sentinel element creation and
 * section-index lookup helpers.
 */

import type { RawSection } from "../../types";
import { setSectionContent } from "../../reader/shadowHost";
import { getTopmostVisibleSection } from "../../reader/anchor";

/**
 * Topmost section element currently intersecting the viewport, plus its
 * section index. Shared by the hook's `readVisiblePosition` and the scrolled
 * controller's viewport tracking.
 */
export function readTopmostVisibleSection(
  contentRoot: Element,
  viewTop: number,
  viewBottom: number,
): { element: HTMLElement; index: number } | null {
  const element = getTopmostVisibleSection(contentRoot, viewTop, viewBottom);
  const index = Number(element?.dataset.sectionIndex);
  if (element && Number.isFinite(index)) {
    return { element, index };
  }
  return null;
}

/**
 * Looks up a section by index.
 *
 * Section array position and {@link RawSection.index} (the epubjs spine index)
 * are guaranteed equal: extraction builds `sections[i]` from spine item `i`,
 * and epubjs assigns contiguous spine indices in spine order. Callers may
 * therefore treat the value as a plain array index.
 */
export function lookupSection(
  sections: RawSection[],
  idx: number,
): RawSection | undefined {
  return sections[idx];
}

export function createScrolledSection(
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

export function createScrolledSentinel(
  position: "top" | "bottom",
): HTMLDivElement {
  const sentinel = document.createElement("div");
  sentinel.className = "flow-sentinel";
  sentinel.dataset.sentinel = position;
  sentinel.style.cssText =
    "display:block;width:100%;height:1px;clear:both;" +
    "pointer-events:none;flex:none;";
  return sentinel;
}

export function getMountedScrolledSection(
  root: Element,
  sectionIndex: number,
): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `[data-section-index="${CSS.escape(String(sectionIndex))}"]`,
  );
}
