import ePub from "epubjs";
import type { RawSection, RawExtractedBook } from "../types/bookPages";
import type { TocItem } from "../types/epub";
import { getPlainTextLength } from "../utils/htmlText";
import { getFirstBrowserBlobUrl } from "../utils/htmlReferences";
import { yieldToBrowser } from "../utils/async";
import { blobToDataUrl } from "../utils/blob";

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
  replaceCss?: () => Promise<unknown>;
  settings: {
    archive?: {
      getBase64: (
        url: string,
        mimeType?: string,
      ) => Promise<string> | undefined;
    };
    resolver: (href: string) => string;
    request: (href: string, type?: string) => Promise<unknown>;
  };
};

type EpubBook = {
  ready: Promise<unknown>;
  loaded: {
    resources: Promise<unknown>;
    navigation: Promise<unknown>;
  };
  resources?: ResourceCollection;
  spine: {
    each: (callback: (item: SpineItem) => void) => void;
    hooks?: { serialize?: { clear: () => void } };
  };
  load: (path: string) => Promise<unknown>;
  navigation?: { toc?: NavItem[] };
  destroy: () => void;
};

type EpubFactory = (
  fileData: ArrayBuffer,
  options: { replacements: "none" },
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

type ExtractionProgressCallback = (
  done: number,
  total: number,
  message?: string,
) => void;

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

/**
 * Collect every local asset reference contained in a section's HTML.
 *
 * Exported for unit testing: this scanner is the behavior contract that any
 * future DOMParser-based rewrite (PLAN2 step C1) must preserve.
 */
export function collectAssetReferences(html: string): Set<string> {
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

function disableEpubJsResourceSubstitution(book: EpubBook): void {
  if (book.resources) {
    book.resources.replaceCss = () => Promise.resolve();
  }
  book.spine.hooks?.serialize?.clear();
}

async function resourceToDataUrl(
  resources: ResourceCollection,
  absUrl: string,
): Promise<string | null> {
  const archivedDataUrl = resources.settings.archive?.getBase64(absUrl);
  if (archivedDataUrl) return archivedDataUrl;

  const asset = await resources.settings.request(absUrl, "blob");
  return asset instanceof Blob ? blobToDataUrl(asset) : null;
}

async function reportProgress(
  onProgress: ExtractionProgressCallback | undefined,
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
  onProgress?: ExtractionProgressCallback,
  signal?: AbortSignal,
): Promise<RawExtractedBook> {
  throwIfAborted(signal);
  await reportProgress(onProgress, 0, 0, "Loading EPUB parser...");
  throwIfAborted(signal);

  await reportProgress(onProgress, 0, 0, "Opening book...");
  throwIfAborted(signal);

  const book = createBook(fileData, { replacements: "none" });

  try {
    await reportProgress(onProgress, 0, 0, "Reading book resources...");
    throwIfAborted(signal);

    await book.loaded.resources;
    throwIfAborted(signal);
    disableEpubJsResourceSubstitution(book);

    await book.ready;
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

      if (needed.length === 0) return html;

      const uncached = needed.filter(({ absUrl }) => !assetCache.has(absUrl));
      await Promise.all(
        uncached.map(async ({ absUrl }) => {
          try {
            const dataUrl = await resourceToDataUrl(resources, absUrl);
            if (dataUrl) assetCache.set(absUrl, dataUrl);
          } catch {
            // Ignore broken assets and keep the section readable.
          }
        }),
      );

      let result = html;
      for (const { relUrl, absUrl } of needed) {
        const dataUri = assetCache.get(absUrl);
        if (dataUri) {
          result = result.split(relUrl).join(dataUri);
        }
      }
      return result;
    }

    const spineItems: SpineItem[] = [];
    book.spine.each((item) => spineItems.push(item));
    await reportProgress(
      onProgress,
      0,
      spineItems.length,
      `Found ${spineItems.length} sections.`,
    );

    const sections: RawSection[] = new Array(spineItems.length);
    const loadFn = book.load.bind(book);

    for (let index = 0; index < spineItems.length; index++) {
      throwIfAborted(signal);
      const item = spineItems[index];
      const sectionNumber = index + 1;
      await reportProgress(
        onProgress,
        index,
        spineItems.length,
        `Section ${sectionNumber} / ${spineItems.length}`,
      );
      throwIfAborted(signal);

      try {
        let html = await item.render(loadFn);
        throwIfAborted(signal);

        html = await inlineAssets(html, item.url);
        throwIfAborted(signal);

        const temporaryBlobUrl = getFirstBrowserBlobUrl(html);
        if (temporaryBlobUrl) {
          throw new Error(
            `Extracted section ${sectionNumber} still contains a temporary browser blob URL (${temporaryBlobUrl}).`,
          );
        }

        const textLength = getPlainTextLength(html);
        const viewport = extractViewport(html);

        sections[index] = {
          index: item.index,
          href: item.href,
          html,
          textLength,
          viewport,
        };
      } finally {
        item.unload();
      }

      await reportProgress(
        onProgress,
        index + 1,
        spineItems.length,
        `Extracted section ${sectionNumber} / ${spineItems.length}.`,
      );
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
  for (let arrayIndex = 0; arrayIndex < sections.length; arrayIndex++) {
    const section = sections[arrayIndex];
    const cleanSectionHref = section.href.split("#")[0];
    if (cleanSectionHref === cleanHref || section.href === href) {
      return arrayIndex;
    }
  }
  return 0;
}
