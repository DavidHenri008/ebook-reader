// Types for the reflowable rendering system

import type { TocItem } from "./epub";

/** A section extracted from the EPUB, raw HTML only */
export interface RawSection {
  /** Index in the spine */
  index: number;
  /** href identifier for TOC navigation */
  href: string;
  /** Self-contained HTML string with inlined assets */
  html: string;
  /** Viewport dimensions declared by the section's meta viewport tag, if present */
  viewport?: { width: number; height: number };
}

/** Full extracted book data, cached in IndexedDB (no page size dependency) */
export interface RawExtractedBook {
  /** Book identifier (hash) */
  bookId: string;
  /** All extracted sections */
  sections: RawSection[];
  /** Table of contents */
  toc: TocItem[];
  /** Timestamp of extraction */
  extractedAt: number;
}
