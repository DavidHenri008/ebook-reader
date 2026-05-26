import ePub from "epubjs";
import type { TocItem } from "../types/epub";
import type { RawSection, RawExtractedBook } from "../types/bookPages";
import { getPlainTextLength } from "./pageEstimation";

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
  signal?: AbortSignal,
): Promise<RawExtractedBook> {
  const t0 = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const book = ePub(fileData, { replacements: "base64" } as any);
  await book.ready;
  const tReady = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (book as any).loaded.resources;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources = (book as any).resources as
    | {
        urls: string[];
        relativeTo: (url: string) => string[];
        createUrl: (url: string) => Promise<string>;
        settings: { resolver: (href: string) => string };
      }
    | undefined;
  const tResources = performance.now();

  // NOTE: We intentionally skip resources.replacements() which eagerly
  // decompresses and base64-encodes every asset in the book upfront (serial
  // JSZip work). Instead we inline assets lazily per section using a shared
  // cache so each asset is decompressed exactly once.

  // Start navigation loading now — it runs in parallel with section rendering.
  // .catch(() => []) prevents an unhandled rejection if the book is destroyed
  // before navigation finishes (e.g. when the user cancels extraction).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navPromise: Promise<TocItem[]> = (book as any).loaded.navigation
    .then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = ((book as any).navigation as { toc: NavItem[] })?.toc ?? [];
      return mapTocItems(raw);
    })
    .catch(() => [] as TocItem[]);

  if (signal?.aborted) {
    book.destroy();
    throw new DOMException("Extraction cancelled", "AbortError");
  }

  // ── Lazy per-section asset inlining ──────────────────────────────────────
  // Cache: absolute archive URL → data URI (shared across all sections so
  // assets used by multiple sections are only decompressed once).
  const assetCache = new Map<string, string>();

  async function inlineAssets(
    html: string,
    sectionUrl: string,
  ): Promise<string> {
    if (!resources) return html;

    // How each asset URL appears relative to this section
    const relUrls = resources.relativeTo(sectionUrl);

    // Only process assets that actually appear in this section's HTML
    const needed: Array<{ relUrl: string; absUrl: string }> = [];
    relUrls.forEach((relUrl, i) => {
      if (relUrl && html.includes(relUrl)) {
        needed.push({
          relUrl,
          absUrl: resources.settings.resolver(resources.urls[i]),
        });
      }
    });

    if (needed.length === 0) return html;

    // Fetch uncached assets in parallel
    await Promise.all(
      needed.map(async ({ absUrl }) => {
        if (assetCache.has(absUrl)) return;
        try {
          assetCache.set(absUrl, await resources.createUrl(absUrl));
        } catch {
          /* broken asset — leave absent, skip replacement */
        }
      }),
    );

    // Replace all occurrences in HTML
    let result = html;
    for (const { relUrl, absUrl } of needed) {
      const dataUri = assetCache.get(absUrl);
      if (dataUri) result = result.split(relUrl).join(dataUri);
    }
    return result;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Iterate spine sections
  const spineItems: SpineItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (book.spine as any).each((item: SpineItem) => spineItems.push(item));

  const sections: RawSection[] = new Array(spineItems.length);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadFn = (book as any).load.bind(book);

  // Render sections with a concurrency limit so multiple spine items are
  // in-flight simultaneously while staying within epub.js's resource cache.
  const CONCURRENCY = 6;

  let sumRenderMs = 0;
  let sumInlineMs = 0;
  let toc: TocItem[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      if (spineItems.length === 0) {
        resolve();
        return;
      }
      if (signal?.aborted) {
        reject(new DOMException("Extraction cancelled", "AbortError"));
        return;
      }

      let nextIndex = 0;
      let inFlight = 0;
      let completed = 0;

      const startNext = () => {
        while (nextIndex < spineItems.length && inFlight < CONCURRENCY) {
          if (signal?.aborted) {
            reject(new DOMException("Extraction cancelled", "AbortError"));
            return;
          }

          const i = nextIndex++;
          inFlight++;
          const item = spineItems[i];
          onProgress?.(i, spineItems.length);

          (async () => {
            const tA = performance.now();
            // render() loads the section and serializes it to an XHTML string
            let html = await item.render(loadFn);
            if (signal?.aborted) {
              item.unload();
              throw new DOMException("Extraction cancelled", "AbortError");
            }
            const tB = performance.now();
            // Inline only the assets referenced by this section (lazy, cached)
            html = await inlineAssets(html, item.url);
            const tC = performance.now();

            sumRenderMs += tB - tA;
            sumInlineMs += tC - tB;

            item.unload();
            sections[i] = {
              index: item.index,
              href: item.href,
              html,
              textLength: getPlainTextLength(html),
              viewport: extractViewport(html),
            };
          })()
            .then(() => {
              inFlight--;
              completed++;
              if (completed === spineItems.length) resolve();
              else startNext();
            })
            .catch(reject);
        }
      };

      startNext();
    });

    // Await TOC resolution inside the try block while the book is still alive.
    // On abort the pool rejects before reaching here, so this is only reached
    // on successful completion.
    toc = await navPromise;
  } finally {
    book.destroy();
  }

  const tDone = performance.now();

  console.group(
    `[extractRawBook] ${spineItems.length} sections — ${(tDone - t0).toFixed(0)} ms total`,
  );
  console.log(`  book.ready         ${(tReady - t0).toFixed(0)} ms`);
  console.log(`  loaded.resources   ${(tResources - tReady).toFixed(0)} ms`);
  console.log(
    `  render (sum)       ${sumRenderMs.toFixed(0)} ms  (wall: ${(tDone - tResources).toFixed(0)} ms, ×${CONCURRENCY} concurrency)`,
  );
  console.log(
    `  asset inline (sum) ${sumInlineMs.toFixed(0)} ms  (${assetCache.size} unique assets cached)`,
  );
  console.groupEnd();

  return {
    bookId,
    sections,
    toc,
    extractedAt: Date.now(),
  };
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
