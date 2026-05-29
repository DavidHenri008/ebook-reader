import { describe, it, expect } from "vitest";
import {
  bookTitleFromUrlSegment,
  readerPathForBookTitle,
} from "./bookTitleUrl";

describe("readerPathForBookTitle", () => {
  it("encodes the title into the reader path", () => {
    expect(readerPathForBookTitle("The Hobbit")).toBe("/reader/The%20Hobbit");
    expect(readerPathForBookTitle("A/B & C")).toBe("/reader/A%2FB%20%26%20C");
  });

  it("falls back to Untitled for blank titles", () => {
    expect(readerPathForBookTitle("   ")).toBe("/reader/Untitled");
    expect(readerPathForBookTitle("")).toBe("/reader/Untitled");
  });
});

describe("bookTitleFromUrlSegment", () => {
  it("decodes a URL segment back to the title", () => {
    expect(bookTitleFromUrlSegment("The%20Hobbit")).toBe("The Hobbit");
    expect(bookTitleFromUrlSegment("A%2FB%20%26%20C")).toBe("A/B & C");
  });

  it("round-trips with readerPathForBookTitle", () => {
    const title = "Café Déjà Vu & Co.";
    const segment = readerPathForBookTitle(title).replace("/reader/", "");
    expect(bookTitleFromUrlSegment(segment)).toBe(title);
  });

  it("returns null for missing or empty segments", () => {
    expect(bookTitleFromUrlSegment(undefined)).toBeNull();
    expect(bookTitleFromUrlSegment("")).toBeNull();
    expect(bookTitleFromUrlSegment("   ")).toBeNull();
  });

  it("returns the raw value when decoding fails", () => {
    expect(bookTitleFromUrlSegment("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
