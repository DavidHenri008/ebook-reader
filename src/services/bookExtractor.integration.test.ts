import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import JSZip from "jszip";
import { collectAssetReferences } from "./bookExtractor";

const here = dirname(fileURLToPath(import.meta.url));
const EPUB_PATH = resolve(here, "../../SMALL.epub");

const ASSET_ATTRIBUTE_NAMES = new Set([
  "src",
  "href",
  "poster",
  "data",
  "xlink:href",
]);
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;
const ASSET_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|css|woff2?|ttf|otf)$/i;

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference);
}

/** Normalize a raw reference the way the extractor's scanner does. */
function cleanReference(rawValue: string): string | null {
  const clean = rawValue.trim();
  if (!clean || clean.startsWith("#") || isExternalReference(clean)) {
    return null;
  }
  return clean;
}

function cssUrls(css: string): string[] {
  const urls: string[] = [];
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    const clean = cleanReference(match[2] ?? "");
    if (clean) urls.push(clean);
  }
  return urls;
}

/**
 * Independently enumerate the local asset references a real DOM parse would
 * surface from a section's HTML. This mirrors the DOMParser-based rewrite that
 * PLAN2 step C1 proposes, so it acts as an oracle: the hand-rolled scanner must
 * not miss any reference this DOM walk finds.
 */
function domReferences(html: string): Set<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const refs = new Set<string>();

  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === "srcset") {
        for (const candidate of attr.value.split(",")) {
          const [url] = candidate.trim().split(/\s+/, 1);
          const clean = url ? cleanReference(url) : null;
          if (clean) refs.add(clean);
        }
      } else if (ASSET_ATTRIBUTE_NAMES.has(name)) {
        const clean = cleanReference(attr.value);
        if (clean) refs.add(clean);
      } else if (name === "style") {
        for (const url of cssUrls(attr.value)) refs.add(url);
      }
    }
    if (el.tagName.toLowerCase() === "style") {
      for (const url of cssUrls(el.textContent ?? "")) refs.add(url);
    }
  }

  return refs;
}

/** Resolve a relative reference against a directory inside the archive. */
function resolveArchivePath(baseDir: string, ref: string): string | null {
  const stripped = ref.split("#")[0].split("?")[0];
  if (!stripped) return null;
  const parts = baseDir ? baseDir.split("/") : [];
  for (const segment of stripped.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

interface SectionDoc {
  path: string;
  dir: string;
  html: string;
}

/**
 * Real-EPUB coverage for the asset-reference scanner. This is the integration
 * safety net for PLAN2 step C1: the DOMParser rewrite of asset collection must
 * keep finding every local reference (no false negatives) and must not invent
 * references that do not resolve to a real archive entry (no false positives).
 *
 * It intentionally avoids the full epubjs extraction (rendering + base64
 * inlining of every image), which is far too slow for a large fixed-layout
 * book; it operates directly on the section XHTML inside the EPUB instead.
 */
describe("collectAssetReferences (SMALL.epub)", () => {
  const archiveFiles = new Set<string>();
  let sectionDocs: SectionDoc[] = [];

  beforeAll(async () => {
    if (!existsSync(EPUB_PATH)) return;
    const zip = await JSZip.loadAsync(readFileSync(EPUB_PATH));

    const entries = Object.entries(zip.files).filter(([, file]) => !file.dir);
    for (const [path] of entries) archiveFiles.add(path);

    const docs: SectionDoc[] = [];
    for (const [path, file] of entries) {
      if (!/\.(?:xhtml|html|htm)$/i.test(path)) continue;
      const html = await file.async("string");
      const slash = path.lastIndexOf("/");
      docs.push({ path, dir: slash === -1 ? "" : path.slice(0, slash), html });
    }
    sectionDocs = docs;
  }, 120_000);

  it("found section documents and archive entries", () => {
    expect(archiveFiles.size).toBeGreaterThan(0);
    expect(sectionDocs.length).toBeGreaterThan(0);
  });

  it("collects at least one asset reference across the book", () => {
    const total = sectionDocs.reduce(
      (sum, doc) => sum + collectAssetReferences(doc.html).size,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it("misses no reference a DOM parse would find (no false negatives)", () => {
    const missing: string[] = [];
    for (const doc of sectionDocs) {
      const scanned = collectAssetReferences(doc.html);
      for (const ref of domReferences(doc.html)) {
        if (!scanned.has(ref)) missing.push(`${doc.path} -> ${ref}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("only collects references that resolve to real archive files (no false positives)", () => {
    const unresolved: string[] = [];
    for (const doc of sectionDocs) {
      for (const ref of collectAssetReferences(doc.html)) {
        if (!ASSET_EXTENSION.test(ref.split("#")[0])) continue;
        const resolved = resolveArchivePath(doc.dir, ref);
        const decoded = resolved ? safeDecode(resolved) : null;
        const exists =
          (resolved !== null && archiveFiles.has(resolved)) ||
          (decoded !== null && archiveFiles.has(decoded));
        if (!exists) unresolved.push(`${doc.path} -> ${ref}`);
      }
    }
    expect(unresolved).toEqual([]);
  });
});

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
