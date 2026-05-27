import ePub from "epubjs";
import type { RawSection, RawExtractedBook } from "../types/bookPages";
import type { TocItem } from "../types/epub";
import { getPlainTextLength } from "./pageEstimation";

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
  render: (request?: unknown) => Promise<string>;
  unload: () => void;
}

type ResourceCollection = {
  urls: string[];
  relativeTo: (url: string) => string[];
  createUrl: (url: string) => Promise<string>;
  settings: { resolver: (href: string) => string };
};

type EpubBook = {
  ready: Promise<unknown>;
  loaded: {
    resources: Promise<unknown>;
    navigation: Promise<unknown>;
  };
  resources?: ResourceCollection;
  spine: { each: (callback: (item: SpineItem) => void) => void };
  load: (path: string) => Promise<unknown>;
  navigation?: { toc?: NavItem[] };
  destroy: () => void;
};

type EpubFactory = (
  fileData: ArrayBuffer,
  options: { replacements: "base64" },
) => EpubBook;

const createBook = ePub as unknown as EpubFactory;

function mapTocItems(items: NavItem[]): TocItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label.trim(),
    href: item.href,
    subitems: item.subitems?.length ? mapTocItems(item.subitems) : undefined,
  }));
}

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
  const width = content.match(/width\s*=\s*([0-9]+)/i);
  const height = content.match(/height\s*=\s*([0-9]+)/i);
  if (!width || !height) return undefined;
  return { width: parseInt(width[1], 10), height: parseInt(height[1], 10) };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Extraction cancelled", "AbortError");
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function reportProgress(
  onProgress:
    | ((done: number, total: number, message?: string) => void)
    | undefined,
  done: number,
  total: number,
  message?: string,
): Promise<void> {
  if (!onProgress) return;
  onProgress(done, total, message);
  await yieldToBrowser();
}

/** Extract an EPUB file into self-contained section HTML strings. */
export async function extractRawBook(
  fileData: ArrayBuffer,
  bookId: string,
  onProgress?: (done: number, total: number, message?: string) => void,
  signal?: AbortSignal,
): Promise<RawExtractedBook> {
  throwIfAborted(signal);
  await reportProgress(onProgress, 0, 0, "Loading EPUB parser...");
  throwIfAborted(signal);

  await reportProgress(onProgress, 0, 0, "Opening book...");
  throwIfAborted(signal);

  const book = createBook(fileData, { replacements: "base64" });

  try {
    await book.ready;
    throwIfAborted(signal);

    await reportProgress(onProgress, 0, 0, "Reading book resources...");
    throwIfAborted(signal);

    await book.loaded.resources;
    throwIfAborted(signal);

    const resources = book.resources;
    const navPromise = book.loaded.navigation
      .then(() => mapTocItems(book.navigation?.toc ?? []))
      .catch(() => [] as TocItem[]);

    const assetCache = new Map<string, string>();
    async function inlineAssets(
      html: string,
      sectionUrl: string,
    ): Promise<string> {
      if (!resources) return html;

      const relUrls = resources.relativeTo(sectionUrl);
      const needed: Array<{ relUrl: string; absUrl: string }> = [];
      relUrls.forEach((relUrl, index) => {
        if (relUrl && html.includes(relUrl)) {
          needed.push({
            relUrl,
            absUrl: resources.settings.resolver(resources.urls[index]),
          });
        }
      });

      if (needed.length === 0) return html;

      await Promise.all(
        needed.map(async ({ absUrl }) => {
          if (assetCache.has(absUrl)) return;
          try {
            assetCache.set(absUrl, await resources.createUrl(absUrl));
          } catch {
            // Ignore broken assets and keep the section readable.
          }
        }),
      );

      let result = html;
      for (const { relUrl, absUrl } of needed) {
        const dataUri = assetCache.get(absUrl);
        if (dataUri) result = result.split(relUrl).join(dataUri);
      }
      return result;
    }

    const spineItems: SpineItem[] = [];
    book.spine.each((item) => spineItems.push(item));
    await reportProgress(onProgress, 0, spineItems.length);

    const sections: RawSection[] = new Array(spineItems.length);
    const loadFn = book.load.bind(book);

    for (let index = 0; index < spineItems.length; index++) {
      throwIfAborted(signal);
      const item = spineItems[index];

      try {
        let html = await item.render(loadFn);
        throwIfAborted(signal);

        html = await inlineAssets(html, item.url);
        throwIfAborted(signal);

        sections[index] = {
          index: item.index,
          href: item.href,
          html,
          textLength: getPlainTextLength(html),
          viewport: extractViewport(html),
        };
      } finally {
        item.unload();
      }

      await reportProgress(onProgress, index + 1, spineItems.length);
    }

    const toc = await navPromise;
    throwIfAborted(signal);

    return { bookId, sections, toc, extractedAt: Date.now() };
  } finally {
    book.destroy();
  }
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
