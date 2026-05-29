/**
 * Scrolled-mode DOM utilities: section/sentinel element creation and
 * section-index lookup helpers.
 */

import type { RawSection } from "../../types";
import { setSectionContent } from "../../reader/shadowHost";

export function lookupSection(
  sections: RawSection[],
  idx: number,
): RawSection | undefined {
  return sections[idx] ?? sections.find((s) => s.index === idx);
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
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-section-index]")).find(
      (element) => Number(element.dataset.sectionIndex) === sectionIndex,
    ) ?? null
  );
}
