/**
 * Shadow DOM initialisation, styling, and content-mounting helpers.
 *
 * Framework-agnostic reader primitives, shared by the section viewer component
 * and the page-estimation service.
 */

import type { Theme } from "../types";

const THEME_CSS: Record<Theme, string> = {
  light:
    "--bg:#ffffff;--text:#6b6375;--text-heading:#08060d;--border:#e5e4e7;color-scheme:light;",
  dark: "--bg:#16171d;--text:#9ca3af;--text-heading:#f3f4f6;--border:#2e303a;color-scheme:dark;",
};

export function buildHostStyle(zoom: number, theme: Theme): string {
  return `
    :host{display:block;width:100%;${THEME_CSS[theme]}}
    .clamp,.flow{zoom:${zoom / 100};}
    .flow{display:block;position:relative;overflow:visible;}
    .cols,.flow-section{position:relative;z-index:0;isolation:isolate;}
    .flow-section html,.flow-section body{display:block;margin:0;padding:0;max-width:100%;}
    .flow-sentinel{display:block;width:100%;height:1px;clear:both;pointer-events:none;}
    img,svg{max-width:100%;height:auto;}
  `;
}

export function setSectionContent(container: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const htmlElement = document.createElement("html");
  Array.from(parsed.documentElement.attributes).forEach((attr) => {
    htmlElement.setAttribute(attr.name, attr.value);
  });

  const head = document.createElement("head");
  Array.from(parsed.head.childNodes).forEach((node) => {
    head.appendChild(document.importNode(node, true));
  });

  const body = document.createElement("body");
  Array.from(parsed.body.attributes).forEach((attr) => {
    body.setAttribute(attr.name, attr.value);
  });
  Array.from(parsed.body.childNodes).forEach((node) => {
    body.appendChild(document.importNode(node, true));
  });

  htmlElement.append(head, body);
  container.replaceChildren(htmlElement);
}

export function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function waitForContentLayout(root: Element): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return image.decode?.().catch(() => undefined) ?? Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      }).then(() => image.decode?.().catch(() => undefined));
    }),
  );
  await document.fonts?.ready.catch(() => undefined);
  await nextAnimationFrame();
  await nextAnimationFrame();
}

export function measureLogicalContentHeight(
  root: HTMLElement,
  zoomFactor: number,
  minimumHeight: number,
): number {
  const rootRect = root.getBoundingClientRect();
  let contentHeight = root.scrollHeight;

  Array.from(root.querySelectorAll("*")).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    contentHeight = Math.max(
      contentHeight,
      (rect.bottom - rootRect.top) / zoomFactor,
    );
  });

  return Math.ceil(Math.max(minimumHeight, contentHeight));
}

const FONT_FACE_BLOCK = /@font-face\s*\{[^}]*\}/gi;

/**
 * Splits book CSS into its `@font-face` rules and everything else.
 *
 * `@font-face` rules must be registered at the document level: rules declared
 * inside a shadow root are silently ignored by the browser, so fonts never load
 * and content falls back to a default face. The remaining rules (layout,
 * classes) stay scoped to the shadow root.
 */
export function extractFontFaces(css: string): { fonts: string; rest: string } {
  const fonts: string[] = [];
  const rest = css.replace(FONT_FACE_BLOCK, (block) => {
    fonts.push(block);
    return "";
  });
  return { fonts: fonts.join("\n"), rest };
}

// Ref-counted registry of document-level `@font-face` styles, keyed by their
// CSS text. The live reader and the off-screen measurement host can share the
// same (large) inlined font payload without duplicating it in the DOM.
const documentFontRegistry = new Map<
  string,
  { element: HTMLStyleElement; count: number }
>();

/**
 * Registers `@font-face` CSS at the document level so the declared fonts load
 * and become usable inside shadow roots. Returns a disposer that releases the
 * registration; the underlying `<style>` is removed once no host references it.
 */
export function registerDocumentFonts(fontCss: string): () => void {
  if (!fontCss.trim()) {
    return () => {};
  }

  let entry = documentFontRegistry.get(fontCss);
  if (!entry) {
    const element = document.createElement("style");
    element.dataset.readerFonts = "";
    element.textContent = fontCss;
    document.head.appendChild(element);
    entry = { element, count: 0 };
    documentFontRegistry.set(fontCss, entry);
  }
  entry.count += 1;

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const current = documentFontRegistry.get(fontCss);
    if (!current) return;
    current.count -= 1;
    if (current.count <= 0) {
      current.element.remove();
      documentFontRegistry.delete(fontCss);
    }
  };
}

/**
 * Applies book stylesheets to a shadow root: non-font rules go into the scoped
 * `bookStyle` element, while `@font-face` rules are (re)registered at the
 * document level. Disposes the previous font registration first and returns the
 * new disposer.
 */
export function applyBookStyles(
  bookStyle: HTMLStyleElement,
  bookStyles: string,
  disposePreviousFonts: () => void = () => {},
): () => void {
  disposePreviousFonts();
  const { fonts, rest } = extractFontFaces(bookStyles);
  bookStyle.textContent = rest;
  return registerDocumentFonts(fonts);
}

export interface ShadowParts {
  shadow: ShadowRoot;
  style: HTMLStyleElement;
  clamp: HTMLDivElement;
  cols: HTMLDivElement;
  flow: HTMLDivElement;
  /** Holds the hoisted book stylesheets (with fonts inlined), minus fonts. */
  bookStyle: HTMLStyleElement;
  /** Releases the document-level `@font-face` styles for this host. */
  disposeFonts: () => void;
}

export function initShadowHost(
  host: HTMLElement,
  zoom: number,
  theme: Theme,
  bookStyles = "",
): ShadowParts {
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildHostStyle(zoom, theme);
  shadow.appendChild(style);

  // Book stylesheets come after the base host style so the book's own layout
  // rules win. Non-font rules stay scoped to the shadow root; `@font-face`
  // rules are hoisted to the document level via `applyBookStyles` because
  // shadow-scoped `@font-face` rules never load.
  const bookStyle = document.createElement("style");
  shadow.appendChild(bookStyle);
  const disposeFonts = applyBookStyles(bookStyle, bookStyles);

  const clamp = document.createElement("div");
  clamp.className = "clamp";

  const cols = document.createElement("div");
  cols.className = "cols";
  clamp.appendChild(cols);

  const flow = document.createElement("div");
  flow.className = "flow";

  shadow.appendChild(clamp);
  shadow.appendChild(flow);

  return { shadow, style, clamp, cols, flow, bookStyle, disposeFonts };
}
