import { describe, it, expect } from "vitest";
import {
  normalizeAnchor,
  normalizeSectionIndex,
  clampSectionIndex,
} from "../readingLocation";

describe("normalizeAnchor", () => {
  it("clamps to >= 0 and passes through finite values", () => {
    expect(normalizeAnchor(42)).toBe(42);
    expect(normalizeAnchor(0)).toBe(0);
    expect(normalizeAnchor(-5)).toBe(0);
  });

  it("falls back to 0 for undefined or non-finite input", () => {
    expect(normalizeAnchor(undefined)).toBe(0);
    expect(normalizeAnchor(Number.NaN)).toBe(0);
    expect(normalizeAnchor(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("normalizeSectionIndex", () => {
  it("truncates to an integer and clamps to >= 0", () => {
    expect(normalizeSectionIndex(3.9)).toBe(3);
    expect(normalizeSectionIndex(0)).toBe(0);
    expect(normalizeSectionIndex(-2.5)).toBe(0);
  });

  it("falls back to 0 for undefined or non-finite input", () => {
    expect(normalizeSectionIndex(undefined)).toBe(0);
    expect(normalizeSectionIndex(Number.NaN)).toBe(0);
  });
});

describe("clampSectionIndex", () => {
  it("clamps to the last section index", () => {
    expect(clampSectionIndex(10, 5)).toBe(4);
    expect(clampSectionIndex(2, 5)).toBe(2);
  });

  it("returns 0 when there are no sections", () => {
    expect(clampSectionIndex(3, 0)).toBe(0);
    expect(clampSectionIndex(3, -1)).toBe(0);
  });
});
