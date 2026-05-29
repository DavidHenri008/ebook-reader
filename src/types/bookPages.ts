// Types for the reflowable rendering system

import type { TocItem } from "./epub";

/** Pixel dimensions of the reader viewport used for page measurement. */
export interface PageViewport {
  width: number;
  height: number;
}

/** A section extracted from the EPUB, raw HTML only */
export interface RawSection {
  /** Index in the spine */
  index: number;
  /** href identifier for TOC navigation */
  href: string;
  /** Self-contained HTML string with inlined assets */
  html: string;
  /** Precomputed plain-text character count, used for page estimation */
  textLength: number;
  /** Viewport dimensions declared by the section's meta viewport tag, if present */
  viewport?: { width: number; height: number };
}

/** Full extracted book data, cached in IndexedDB (no page size dependency) */
export interface RawExtractedBook {
  /** Book identifier (hash) */
  bookId: string;
  /** All extracted sections */
  sections: RawSection[];
  /**
   * Shared stylesheets hoisted out of the section `<link>` tags, with internal
   * `url(...)` references (fonts, images) inlined as data URLs. One entry per
   * unique stylesheet, in cascade order. Injected once into the reader shadow
   * root so fonts and layout apply without duplicating ~MB of font data per
   * section.
   */
  styles: string[];
  /** Table of contents */
  toc: TocItem[];
  /** Timestamp of extraction */
  extractedAt: number;
}
