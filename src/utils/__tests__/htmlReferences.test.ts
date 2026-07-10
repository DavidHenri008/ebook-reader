import { describe, it, expect } from "vitest";
import {
  getFirstBrowserBlobUrl,
  containsBrowserBlobUrl,
} from "../htmlReferences";

describe("getFirstBrowserBlobUrl", () => {
  it("returns the first browser blob URL found", () => {
    const html = `<img src="blob:https://app.local/abc-123">`;
    expect(getFirstBrowserBlobUrl(html)).toBe("blob:https://app.local/abc-123");
  });

  it("stops at quotes, whitespace, and closing brackets", () => {
    expect(getFirstBrowserBlobUrl(`url(blob:foo/bar)`)).toBe("blob:foo/bar");
    expect(getFirstBrowserBlobUrl(`blob:foo "rest"`)).toBe("blob:foo");
  });

  it("returns null when no blob URL is present", () => {
    expect(getFirstBrowserBlobUrl(`<img src="images/a.png">`)).toBeNull();
    expect(getFirstBrowserBlobUrl("")).toBeNull();
  });

  it("does not match data URLs", () => {
    expect(getFirstBrowserBlobUrl(`data:image/png;base64,AAAA`)).toBeNull();
  });
});

describe("containsBrowserBlobUrl", () => {
  it("detects the presence of a blob URL", () => {
    expect(containsBrowserBlobUrl(`<a href="blob:x/y">`)).toBe(true);
    expect(containsBrowserBlobUrl(`<a href="images/a.png">`)).toBe(false);
  });
});
