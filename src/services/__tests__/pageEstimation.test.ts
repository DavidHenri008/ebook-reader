import { describe, expect, it } from "vitest";
import { measurePageMap } from "../pageEstimation";
import type { RawSection } from "../../types";

describe("measurePageMap", () => {
  it("maps fixed-layout sections without mounting off-screen content", async () => {
    const sections: RawSection[] = [
      {
        index: 0,
        href: "page-1.xhtml",
        html: '<img src="data:image/png;base64,unused">',
        textLength: 0,
        viewport: { width: 1200, height: 1600 },
      },
      {
        index: 1,
        href: "page-2.xhtml",
        html: '<img src="data:image/png;base64,unused">',
        textLength: 0,
        viewport: { width: 1200, height: 1600 },
      },
    ];
    const observer = new MutationObserver(() => {});
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const pageMap = await measurePageMap(
      sections,
      [
        "@font-face { font-family: Test; src: url(data:font/woff;base64,unused); }",
      ],
      125,
      { width: 800, height: 1000 },
      "light",
    );

    expect(pageMap).toEqual({
      sectionPageStarts: [[0], [0]],
      pageCounts: [1, 1],
      total: 2,
      zoom: 125,
      viewport: { width: 800, height: 1000 },
    });
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });
});
