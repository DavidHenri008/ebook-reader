import ePub from "epubjs";
import type { RawSection, RawExtractedBook } from "../types/bookPages";
import type { TocItem } from "../types/epub";
import type { BookTimingReporter } from "../types/performance";
import { getPlainTextLength } from "./pageEstimation";
import {
  getTimestamp,
  measureAsync,
  measureSync,
  reportTiming,
} from "../utils/timing";

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
const ASSET_ATTRIBUTE_NAMES = [
  "srcset",
  "src",
  "href",
  "poster",
  "data",
  "xlink:href",
] as const;
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

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

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference);
}

function addAssetReferenceVariant(
  references: Set<string>,
  value: string,
): void {
  references.add(value);
  if (value.startsWith("./")) {
    references.add(value.slice(2));
  } else {
    references.add(`./${value}`);
  }
}

function addAssetReference(references: Set<string>, rawValue: string): void {
  const cleanValue = rawValue.trim().replace(/&amp;/g, "&");
  if (
    !cleanValue ||
    cleanValue.startsWith("#") ||
    isExternalReference(cleanValue)
  ) {
    return;
  }

  addAssetReferenceVariant(references, cleanValue);

  const withoutFragment = cleanValue.split("#")[0];
  if (withoutFragment) addAssetReferenceVariant(references, withoutFragment);
}

function addSrcsetReferences(references: Set<string>, rawValue: string): void {
  rawValue.split(",").forEach((candidate) => {
    const [url] = candidate.trim().split(/\s+/, 1);
    if (url) addAssetReference(references, url);
  });
}

function isAttributeNameBoundary(char: string | undefined): boolean {
  return !char || !/[A-Za-z0-9:_-]/.test(char);
}

function findAttributeValueEnd(html: string, cursor: number): number {
  while (cursor < html.length && /[^\s>]/.test(html[cursor])) {
    cursor++;
  }
  return cursor;
}

function collectAttributeReferences(
  html: string,
  references: Set<string>,
  attributeName: string,
): void {
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const attributeIndex = html.indexOf(attributeName, searchFrom);
    if (attributeIndex === -1) return;

    searchFrom = attributeIndex + attributeName.length;
    if (!isAttributeNameBoundary(html[attributeIndex - 1])) continue;

    let cursor = searchFrom;
    while (cursor < html.length && /\s/.test(html[cursor])) cursor++;
    if (html[cursor] !== "=") continue;

    cursor++;
    while (cursor < html.length && /\s/.test(html[cursor])) cursor++;

    const quote = html[cursor];
    if (quote === '"' || quote === "'") {
      const valueStart = cursor + 1;
      const valueEnd = html.indexOf(quote, valueStart);
      if (valueEnd === -1) return;

      const value = html.slice(valueStart, valueEnd);
      if (attributeName === "srcset") {
        addSrcsetReferences(references, value);
      } else {
        addAssetReference(references, value);
      }

      searchFrom = valueEnd + 1;
      continue;
    }

    const valueEnd = findAttributeValueEnd(html, cursor);
    const value = html.slice(cursor, valueEnd);
    if (attributeName === "srcset") {
      addSrcsetReferences(references, value);
    } else {
      addAssetReference(references, value);
    }
    searchFrom = valueEnd;
  }
}

function collectStyleUrls(references: Set<string>, css: string): void {
  CSS_URL_PATTERN.lastIndex = 0;
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    addAssetReference(references, match[2] ?? "");
  }
}

function collectStyleAttributeUrls(
  html: string,
  references: Set<string>,
): void {
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const attributeIndex = html.indexOf("style", searchFrom);
    if (attributeIndex === -1) return;

    searchFrom = attributeIndex + "style".length;
    if (!isAttributeNameBoundary(html[attributeIndex - 1])) continue;

    let cursor = searchFrom;
    while (cursor < html.length && /\s/.test(html[cursor])) cursor++;
    if (html[cursor] !== "=") continue;

    cursor++;
    while (cursor < html.length && /\s/.test(html[cursor])) cursor++;

    const quote = html[cursor];
    if (quote === '"' || quote === "'") {
      const valueStart = cursor + 1;
      const valueEnd = html.indexOf(quote, valueStart);
      if (valueEnd === -1) return;
      collectStyleUrls(references, html.slice(valueStart, valueEnd));
      searchFrom = valueEnd + 1;
      continue;
    }

    const valueEnd = findAttributeValueEnd(html, cursor);
    collectStyleUrls(references, html.slice(cursor, valueEnd));
    searchFrom = valueEnd;
  }
}

function collectStyleElementUrls(html: string, references: Set<string>): void {
  let searchFrom = 0;

  while (searchFrom < html.length) {
    const openIndex = html.indexOf("<style", searchFrom);
    if (openIndex === -1) return;

    const contentStart = html.indexOf(">", openIndex + 6);
    if (contentStart === -1) return;

    const closeIndex = html.indexOf("</style", contentStart + 1);
    if (closeIndex === -1) return;

    collectStyleUrls(references, html.slice(contentStart + 1, closeIndex));
    searchFrom = closeIndex + 8;
  }
}

function collectAssetReferences(html: string): Set<string> {
  const references = new Set<string>();

  for (const attributeName of ASSET_ATTRIBUTE_NAMES) {
    collectAttributeReferences(html, references, attributeName);
  }

  if (
    html.includes("url(") ||
    html.includes("url (") ||
    html.includes("URL(") ||
    html.includes("URL (")
  ) {
    collectStyleAttributeUrls(html, references);
    collectStyleElementUrls(html, references);
  }

  return references;
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
  onTiming?: BookTimingReporter,
): Promise<RawExtractedBook> {
  const extractionStartedAt = getTimestamp();
  throwIfAborted(signal);
  await reportProgress(onProgress, 0, 0, "Loading EPUB parser...");
  throwIfAborted(signal);

  await reportProgress(onProgress, 0, 0, "Opening book...");
  throwIfAborted(signal);

  const book = measureSync(
    onTiming,
    "extract:create-parser",
    () => createBook(fileData, { replacements: "base64" }),
    { detail: `${fileData.byteLength} bytes` },
  );

  try {
    await measureAsync(onTiming, "extract:parser-ready", () => book.ready);
    throwIfAborted(signal);

    await reportProgress(onProgress, 0, 0, "Reading book resources...");
    throwIfAborted(signal);

    await measureAsync(
      onTiming,
      "extract:resources",
      () => book.loaded.resources,
    );
    throwIfAborted(signal);

    const resources = book.resources;
    const navPromise = measureAsync(
      onTiming,
      "extract:navigation",
      async () => {
        await book.loaded.navigation;
        return mapTocItems(book.navigation?.toc ?? []);
      },
    ).catch(() => [] as TocItem[]);

    const assetCache = new Map<string, string>();
    async function inlineAssets(
      html: string,
      sectionUrl: string,
      sectionIndex: number,
      href: string,
    ): Promise<string> {
      if (!resources) return html;

      const scanStartedAt = getTimestamp();
      const relUrls = resources.relativeTo(sectionUrl);
      const references = collectAssetReferences(html);
      const needed: Array<{ relUrl: string; absUrl: string }> = [];
      relUrls.forEach((relUrl, index) => {
        if (relUrl && references.has(relUrl)) {
          needed.push({
            relUrl,
            absUrl: resources.settings.resolver(resources.urls[index]),
          });
        }
      });
      reportTiming(onTiming, "section:asset-scan", scanStartedAt, {
        sectionIndex,
        href,
        detail: `${needed.length} matches from ${references.size} references and ${relUrls.length} resources`,
      });

      if (needed.length === 0) return html;

      const uncached = needed.filter(({ absUrl }) => !assetCache.has(absUrl));
      await measureAsync(
        onTiming,
        "section:asset-load",
        async () => {
          await Promise.all(
            uncached.map(async ({ absUrl }) => {
              try {
                assetCache.set(absUrl, await resources.createUrl(absUrl));
              } catch {
                // Ignore broken assets and keep the section readable.
              }
            }),
          );
        },
        {
          sectionIndex,
          href,
          detail: `${uncached.length} uncached of ${needed.length} referenced`,
        },
      );

      return measureSync(
        onTiming,
        "section:asset-replace",
        () => {
          let result = html;
          for (const { relUrl, absUrl } of needed) {
            const dataUri = assetCache.get(absUrl);
            if (dataUri) result = result.split(relUrl).join(dataUri);
          }
          return result;
        },
        { sectionIndex, href, detail: `${needed.length} referenced assets` },
      );
    }

    const spineItems: SpineItem[] = [];
    const spineStartedAt = getTimestamp();
    book.spine.each((item) => spineItems.push(item));
    reportTiming(onTiming, "extract:spine-list", spineStartedAt, {
      detail: `${spineItems.length} sections`,
    });
    await reportProgress(onProgress, 0, spineItems.length);

    const sections: RawSection[] = new Array(spineItems.length);
    const loadFn = book.load.bind(book);

    for (let index = 0; index < spineItems.length; index++) {
      throwIfAborted(signal);
      const item = spineItems[index];
      const sectionStartedAt = getTimestamp();
      await reportProgress(
        onProgress,
        index + 1,
        spineItems.length,
        `Extracting section ${index + 1} / ${spineItems.length}...`,
      );
      throwIfAborted(signal);

      try {
        let html = await measureAsync(
          onTiming,
          "section:render",
          () => item.render(loadFn),
          { sectionIndex: item.index, href: item.href },
        );
        throwIfAborted(signal);

        html = await inlineAssets(html, item.url, item.index, item.href);
        throwIfAborted(signal);

        const textLength = measureSync(
          onTiming,
          "section:text-length",
          () => getPlainTextLength(html),
          {
            sectionIndex: item.index,
            href: item.href,
            detail: `${html.length} html chars`,
          },
        );

        sections[index] = {
          index: item.index,
          href: item.href,
          html,
          textLength,
          viewport: extractViewport(html),
        };
      } finally {
        const unloadStartedAt = getTimestamp();
        try {
          item.unload();
        } finally {
          reportTiming(onTiming, "section:unload", unloadStartedAt, {
            sectionIndex: item.index,
            href: item.href,
          });
          reportTiming(onTiming, "section:total", sectionStartedAt, {
            sectionIndex: item.index,
            href: item.href,
          });
        }
      }
    }

    await reportProgress(
      onProgress,
      spineItems.length,
      spineItems.length,
      "Finalizing book...",
    );

    const toc = await navPromise;
    throwIfAborted(signal);

    return { bookId, sections, toc, extractedAt: Date.now() };
  } finally {
    const destroyStartedAt = getTimestamp();
    try {
      book.destroy();
    } finally {
      reportTiming(onTiming, "extract:destroy", destroyStartedAt);
      reportTiming(onTiming, "extract:total", extractionStartedAt, {
        detail: bookId,
      });
    }
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
