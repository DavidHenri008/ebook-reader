import { describe, it, expect } from "vitest";
import { collectAssetReferences } from "../bookExtractor";

/**
 * These tests pin the exact set of local asset references the extractor
 * collects from section HTML. They are the safety net for PLAN2 step C1
 * (replacing the hand-rolled attribute scanner with a DOMParser pass): any
 * rewrite must keep producing the same reference sets.
 */
describe("collectAssetReferences", () => {
  it("collects src/href/poster/data attribute references with ./ variants", () => {
    const html = `
      <img src="images/cover.png">
      <a href="chapter2.xhtml">next</a>
      <video poster="thumbs/intro.jpg"></video>
      <object data="models/scene.svg"></object>
    `;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("images/cover.png");
    expect(refs).toContain("./images/cover.png");
    expect(refs).toContain("chapter2.xhtml");
    expect(refs).toContain("./chapter2.xhtml");
    expect(refs).toContain("thumbs/intro.jpg");
    expect(refs).toContain("./thumbs/intro.jpg");
    expect(refs).toContain("models/scene.svg");
    expect(refs).toContain("./models/scene.svg");
  });

  it("collects xlink:href references (SVG <image>)", () => {
    const html = `<svg><image xlink:href="figures/diagram.png"/></svg>`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("figures/diagram.png");
    expect(refs).toContain("./figures/diagram.png");
  });

  it("splits srcset into individual candidate URLs", () => {
    const html = `<img srcset="img-1x.png 1x, img-2x.png 2x, img-3x.png 1024w">`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("img-1x.png");
    expect(refs).toContain("img-2x.png");
    expect(refs).toContain("img-3x.png");
    // Descriptors (1x, 2x, 1024w) must not be treated as references.
    expect(refs).not.toContain("1x");
    expect(refs).not.toContain("2x");
    expect(refs).not.toContain("1024w");
  });

  it("keeps both fragment and fragment-stripped variants", () => {
    const html = `<a href="notes.xhtml#fn1">note</a>`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("notes.xhtml#fn1");
    expect(refs).toContain("./notes.xhtml#fn1");
    expect(refs).toContain("notes.xhtml");
    expect(refs).toContain("./notes.xhtml");
  });

  it("normalizes existing ./ prefixes to both variants", () => {
    const html = `<img src="./images/a.png">`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("./images/a.png");
    expect(refs).toContain("images/a.png");
  });

  it("decodes &amp; entities inside references", () => {
    const html = `<img src="render?id=1&amp;size=2">`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("render?id=1&size=2");
    expect(refs).toContain("./render?id=1&size=2");
  });

  it("collects url(...) references from inline style attributes", () => {
    const html = `<div style="background: url('assets/bg.jpg') no-repeat;"></div>`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("assets/bg.jpg");
    expect(refs).toContain("./assets/bg.jpg");
  });

  it("collects url(...) references from <style> elements", () => {
    const html = `
      <style>
        .hero { background-image: url(media/hero.png); }
        @font-face { src: url("fonts/serif.woff2"); }
      </style>
    `;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("media/hero.png");
    expect(refs).toContain("./media/hero.png");
    expect(refs).toContain("fonts/serif.woff2");
    expect(refs).toContain("./fonts/serif.woff2");
  });

  it("ignores pure fragment, external, protocol-relative, and data references", () => {
    const html = `
      <a href="#top">top</a>
      <img src="https://example.com/remote.png">
      <img src="//cdn.example.com/a.png">
      <img src="data:image/png;base64,AAAA">
      <a href="mailto:reader@example.com">mail</a>
    `;

    const refs = collectAssetReferences(html);

    expect(refs).not.toContain("#top");
    expect(refs).not.toContain("https://example.com/remote.png");
    expect(refs).not.toContain("//cdn.example.com/a.png");
    expect(refs.has("data:image/png;base64,AAAA")).toBe(false);
    expect(refs).not.toContain("mailto:reader@example.com");
  });

  it("returns an empty set for HTML with no local assets", () => {
    const html = `<p>Just some <strong>text</strong> with no assets.</p>`;

    expect(collectAssetReferences(html).size).toBe(0);
  });

  it("handles unquoted attribute values", () => {
    const html = `<img src=images/plain.png alt=cover>`;

    const refs = collectAssetReferences(html);

    expect(refs).toContain("images/plain.png");
    expect(refs).toContain("./images/plain.png");
  });
});
