/**
 * Shadow DOM initialisation, styling, and content-mounting helpers.
 */

import type { Theme } from "../../types";

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

export interface ShadowParts {
  shadow: ShadowRoot;
  style: HTMLStyleElement;
  clamp: HTMLDivElement;
  cols: HTMLDivElement;
  flow: HTMLDivElement;
}

export function initShadowHost(
  host: HTMLElement,
  zoom: number,
  theme: Theme,
): ShadowParts {
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = buildHostStyle(zoom, theme);
  shadow.appendChild(style);

  const clamp = document.createElement("div");
  clamp.className = "clamp";

  const cols = document.createElement("div");
  cols.className = "cols";
  clamp.appendChild(cols);

  const flow = document.createElement("div");
  flow.className = "flow";

  shadow.appendChild(clamp);
  shadow.appendChild(flow);

  return { shadow, style, clamp, cols, flow };
}
