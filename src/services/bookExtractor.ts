import ePub from "epubjs";
import type { TocItem } from "../types/epub";
import type { RawSection, RawExtractedBook } from "../types/bookPages";

// ---------- types internal to epub.js we need to reach ----------

type NavItem = {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
};

interface SpineItem {
  index: number;
  href: string;
  url: string;
  linear: string;
  load: (request: unknown) => Promise<unknown>;
  render: (request?: unknown) => Promise<string>;
  unload: () => void;
}

// ---------- helpers ----------

function mapTocItems(items: NavItem[]): TocItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label.trim(),
    href: item.href,
    subitems: item.subitems?.length ? mapTocItems(item.subitems) : undefined,
  }));
}

/**
 * Parse the `content` attribute of a `<meta name="viewport">` tag and return
 * the numeric width and height if both are present, otherwise undefined.
 *
 * Example: `<meta name="viewport" content="width=1200, height=1600"/>`
 */
function extractViewport(
  html: string,
): { width: number; height: number } | undefined {
  const match =
    html.match(
      /<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']+)["']/i,
    ) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']viewport["']/i);
  if (!match) return undefined;
  const content = match[1];
  const w = content.match(/width\s*=\s*([0-9]+)/i);
  const h = content.match(/height\s*=\s*([0-9]+)/i);
  if (!w || !h) return undefined;
  return { width: parseInt(w[1], 10), height: parseInt(h[1], 10) };
}

// ---------- public API ----------

export interface RawExtractionResult {
  raw: RawExtractedBook;
  toc: TocItem[];
}

/**
 * Extract an EPUB file into self-contained section HTML strings.
 * No page measurement is performed — the cache is size-independent.
 *
 * Uses epub.js only as a parser – no Rendition or iframes are created.
 */
export async function extractRawBook(
  fileData: ArrayBuffer,
  bookId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<RawExtractionResult> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const book = ePub(fileData, { replacements: "base64" } as any);
  await book.ready;

  // Wait for resource replacement so section HTML has inlined assets
  await (book as any).loaded.resources;
  const resources = (book as any).resources;
  if (resources?.replacements) {
    await resources.replacements();
    if (resources.replaceCss) await resources.replaceCss();
  }

  // Extract TOC
  await (book as any).loaded.navigation;
  const rawToc = ((book as any).navigation as { toc: NavItem[] })?.toc ?? [];
  const toc = mapTocItems(rawToc);

  // Iterate spine sections
  const spineItems: SpineItem[] = [];
  (book.spine as any).each((item: SpineItem) => spineItems.push(item));

  const sections: RawSection[] = [];
  const loadFn = (book as any).load.bind(book);

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    onProgress?.(i, spineItems.length);

    // render() loads the section and serializes it to an XHTML string
    let html = await item.render(loadFn);

    // Substitute resource URLs (images, CSS, fonts) with base64 data-URIs
    if (resources?.substitute) {
      html = resources.substitute(html, item.url);
    }

    sections.push({
      index: item.index,
      href: item.href,
      html,
      viewport: extractViewport(html),
    });

    item.unload();
  }

  book.destroy();
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const raw: RawExtractedBook = {
    bookId,
    sections,
    toc,
    extractedAt: Date.now(),
  };

  return { raw, toc };
}

/**
 * Return the section index for a given TOC href.
 * Returns 0 if not found.
 */
export function sectionIndexForHref(
  sections: RawSection[],
  href: string,
): number {
  const cleanHref = href.split("#")[0];
  for (const section of sections) {
    const cleanSectionHref = section.href.split("#")[0];
    if (cleanSectionHref === cleanHref || section.href === href) {
      return section.index;
    }
  }
  return 0;
}
