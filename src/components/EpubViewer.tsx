import { useRef, useEffect, useState } from "react";
import styled from "@emotion/styled";
import ePub, { Book, Rendition } from "epubjs";
import type { EpubViewerProps, TocItem } from "../types/epub";

//#region Styled Components
const Wrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

const Overlay = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
`;

const ErrorOverlay = styled(Overlay)`
  color: red;
`;

const ReaderContainer = styled.div<{ isLoading: boolean }>`
  width: 100%;
  height: 100%;
  visibility: ${(props) => (props.isLoading ? "hidden" : "visible")};
`;
//#endregion

type NavItem = {
  id: string;
  href: string;
  label: string;
  subitems?: NavItem[];
};

function mapTocItems(items: NavItem[]): TocItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label.trim(),
    href: item.href,
    subitems: item.subitems?.length ? mapTocItems(item.subitems) : undefined,
  }));
}

/** Injects a <style> tag into an iframe document that sets CSS zoom on html. */
function applyZoomToDoc(doc: Document, zoom: number) {
  let st = doc.getElementById("__reader_zoom__") as HTMLStyleElement | null;
  if (!st) {
    st = doc.createElement("style");
    st.id = "__reader_zoom__";
    (doc.head ?? doc.body)?.appendChild(st);
  }
  st.textContent = `html { zoom: ${zoom / 100}; }`;
}

/**
 * Corrects the height of an epub.js view after expand() has run.
 *
 * Problem: epub.js calls view.expand() which reads
 * `iframe.contentDocument.documentElement.scrollHeight` cross-frame.
 * Cross-frame scrollHeight access always returns the *natural* layout height
 * regardless of any CSS `zoom` applied inside the iframe document.
 * Result: wrapper height = naturalH, but visual content height = naturalH * zoom.
 * At zoom < 1 → gap; at zoom > 1 → overlap.
 *
 * Fix: override the height epub.js set with naturalH * zoom / 100.
 */
function correctViewHeight(
  iframe: HTMLIFrameElement | undefined | null,
  wrapper: HTMLElement | undefined | null,
  naturalH: number,
  zoom: number,
) {
  const correctedH = Math.ceil((naturalH * zoom) / 100);
  if (iframe) iframe.style.height = correctedH + "px";
  if (wrapper) wrapper.style.height = correctedH + "px";
}

function EpubViewer({
  file,
  zoom,
  onLocationChange,
  initialLocation,
  onTocLoaded,
  onReady,
}: EpubViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep callbacks in refs so they don't cause book reloads
  const onLocationChangeRef = useRef(onLocationChange);
  const onTocLoadedRef = useRef(onTocLoaded);
  const onReadyRef = useRef(onReady);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onTocLoadedRef.current = onTocLoaded;
  }, [onTocLoaded]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!containerRef.current || !file) return;

    const container = containerRef.current;
    let book: Book | null = null;
    let rendition: Rendition | null = null;

    const loadBook = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const arrayBuffer = await file.arrayBuffer();
        book = ePub(arrayBuffer);
        bookRef.current = book;
        await book.ready;

        // Load and expose TOC
        await book.loaded.navigation;
        const rawToc = (book.navigation as unknown as { toc: NavItem[] }).toc;
        onTocLoadedRef.current?.(mapTocItems(rawToc ?? []));

        // Clear any stale epub.js DOM left by a previous render cycle
        // (e.g. React StrictMode mount→unmount→remount where destroy() didn't
        // fully remove its nodes before the next renderTo call).
        container.innerHTML = "";

        rendition = book.renderTo(container, {
          width: "100%",
          height: "100%",
          spread: "none",
          flow: "scrolled",
          manager: "continuous",
          allowScriptedContent: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        renditionRef.current = rendition;

        // `rendered` fires right after epub.js's expand() has set
        // element.style.height = naturalScrollHeight. We read that value directly
        // (reliable, no cross-frame scroll layout ambiguity), store it as a data
        // attribute for future zoom changes, then correct both heights.
        rendition.on("rendered", (_section: unknown, view: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = view as any;
          const doc: Document | undefined = v?.document;
          const wrapper: HTMLElement | undefined = v?.element;
          if (!wrapper) return;

          // Apply zoom CSS immediately so the iframe content renders at the right size.
          if (doc) applyZoomToDoc(doc, zoomRef.current);

          // With fullsize/continuous mode epub.js calls expand() AFTER the rendered
          // event fires. We defer height reading by one tick so expand() writes
          // the natural scrollHeight into wrapper.style.height first.
          setTimeout(() => {
            if (!wrapper.isConnected) return; // view was removed before timeout fired
            const naturalH = parseInt(wrapper.style.height, 10);
            if (!naturalH) return;
            wrapper.dataset.naturalH = String(naturalH);
            correctViewHeight(v?.iframe, wrapper, naturalH, zoomRef.current);
          }, 0);
        });

        // Expose goTo via callback instead of ref
        const goTo = (href: string) => {
          if (!renditionRef.current || !bookRef.current) return;

          renditionRef.current
            .display(href)
            .then(() => {
              // epub.js's internal scrollTo can be offset in a CSS Grid layout because
              // it uses getBoundingClientRect().top which includes the toolbar offset.
              // scrollIntoView bypasses this by letting the browser scroll the nearest
              // scrollable ancestor (the epub.js stage with overflow:auto).
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const manager = (renditionRef.current as any)?.manager;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const section = (bookRef.current as any)?.spine?.get?.(href);
                if (manager && section) {
                  const view = manager.views?.find?.(section);
                  if (view?.element instanceof HTMLElement) {
                    view.element.scrollIntoView({ block: "start" });
                  }
                }
              } catch {
                // silently ignore if internal epub.js API changes
              }
            })
            .catch(() => {
              // Fallback: strip fragment and try the path alone
              const path = href.split("#")[0];
              if (path !== href) {
                renditionRef.current?.display(path).catch(() => {});
              }
            });
        };
        onReadyRef.current?.(goTo);

        rendition.on(
          "locationChanged",
          (location: { start: { cfi: string } }) => {
            if (location?.start?.cfi) {
              onLocationChangeRef.current?.(location.start.cfi);
            }
          },
        );

        if (initialLocation) {
          await rendition.display(initialLocation);
        } else {
          await rendition.display();
        }
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load EPUB");
        setIsLoading(false);
      }
    };

    loadBook();

    return () => {
      if (rendition) rendition.destroy();
      if (book) book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [file, initialLocation]);

  // Window resize: keep rendition dimensions in sync with the container.
  useEffect(() => {
    const handleResize = () => {
      if (!renditionRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      renditionRef.current.resize(w, h);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Zoom: apply CSS zoom + correct view heights for all currently rendered iframes.
  // New sections are handled by the `rendered` event registered above.
  // naturalH is stored as data-natural-h by `rendered`, so we never need to
  // re-read cross-frame scrollHeight (which is unreliable after zoom CSS changes).
  useEffect(() => {
    zoomRef.current = zoom;
    if (!containerRef.current) return;
    const iframes =
      containerRef.current.querySelectorAll<HTMLIFrameElement>("iframe");
    for (const iframe of iframes) {
      const doc = iframe.contentDocument;
      const wrapper = iframe.parentElement as HTMLElement | null;
      if (!doc || !wrapper) continue;
      const naturalH = parseInt(wrapper.dataset.naturalH ?? "0", 10);
      if (!naturalH) continue;
      applyZoomToDoc(doc, zoom);
      correctViewHeight(iframe, wrapper, naturalH, zoom);
    }
  }, [zoom]);

  return (
    <Wrapper>
      {isLoading && <Overlay>Loading...</Overlay>}
      {error && <ErrorOverlay>Error: {error}</ErrorOverlay>}
      <ReaderContainer ref={containerRef} isLoading={isLoading} />
    </Wrapper>
  );
}

export default EpubViewer;
