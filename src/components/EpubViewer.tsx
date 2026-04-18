import { useRef, useEffect, useState } from "react";
import styled from "@emotion/styled";
import ePub, { Book, Rendition } from "epubjs";
import type { EpubViewerProps, TocItem } from "../types/epub";

//#region Styled Components
const Wrapper = styled.div`
  width: 100%;
  display: flex;
  position: relative;
  background-color: var(--bg);
  flex: 1;
  overflow: auto;
`;

const Overlay = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  opacity: 100%;
  background-color: var(--bg);
  z-index: 1;
  align-items: center;
  padding-top: 20px;
`;

const ErrorOverlay = styled(Overlay)`
  color: red;
`;

const ReaderContainer = styled.div<{ isLoading: boolean }>`
  height: 100%;
  width: 100%;
  position: relative;
  visibility: ${(props) => (props.isLoading ? "hidden" : "visible")};
  transform-origin: top left;
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

function EpubViewer({
  file,
  onLocationChange,
  initialLocation,
  onTocLoaded,
  onReady,
  zoom = 100,
  mode = "paginated",
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
    let active = true; // guards against StrictMode's double-invoke race

    const loadBook = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const arrayBuffer = await file.arrayBuffer();
        if (!active) return;

        book = ePub(arrayBuffer);
        bookRef.current = book;
        await book.ready;
        if (!active) return;

        // Load and expose TOC
        await book.loaded.navigation;
        if (!active) return;
        const rawToc = (book.navigation as unknown as { toc: NavItem[] }).toc;
        onTocLoadedRef.current?.(mapTocItems(rawToc ?? []));

        // Clear any stale epub.js DOM left by a previous render cycle.
        container.innerHTML = "";

        const isPaginated = mode === "paginated";
        // Paginated mode needs concrete pixel dimensions for spread layout.
        // Scrolled mode works fine with percentages + continuous manager.
        rendition = book.renderTo(container, {
          width: isPaginated ? container.clientWidth : "100%",
          height: isPaginated ? container.clientHeight : "100%",
          manager: "continuous",
          flow: mode,
          spread: "always",
          allowScriptedContent: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        renditionRef.current = rendition;

        // Relay keydown events from inside iframes to the window so the
        // document-level ArrowLeft/ArrowRight handler works when the reader
        // has focus inside the epub content.
        rendition.on("rendered", (_section: unknown, view: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const iframeWin = (view as any)?.window as
            | (Window & typeof globalThis)
            | undefined;
          if (!iframeWin) return;
          iframeWin.addEventListener("keydown", (e: KeyboardEvent) => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: e.key, bubbles: true }),
            );
          });
        });

        const goTo = (href: string) => {
          renditionRef.current?.display(href).catch(() => {
            const path = href.split("#")[0];
            if (path !== href)
              renditionRef.current?.display(path).catch(() => {});
          });
        };
        const prev = () => renditionRef.current?.prev();
        const next = () => renditionRef.current?.next();

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
        if (!active) return;

        onReadyRef.current?.({ goTo, prev, next });
        setIsLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load EPUB");
        setIsLoading(false);
      }
    };

    loadBook();

    return () => {
      active = false;
      if (rendition) rendition.destroy();
      if (book) book.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [file, initialLocation, mode]);

  // Keyboard navigation: left/right arrows flip pages.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") renditionRef.current?.next();
      else if (e.key === "ArrowLeft") renditionRef.current?.prev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (containerRef.current && !isLoading) {
      containerRef.current.style.transform = `scale(${zoom / 100})`;
      containerRef.current.style.setProperty("width", `${(100 / zoom) * 100}%`);
    }
  }, [zoom, isLoading]);

  return (
    <Wrapper>
      {isLoading && <Overlay>Loading...</Overlay>}
      {error && <ErrorOverlay>Error: {error}</ErrorOverlay>}
      <ReaderContainer ref={containerRef} isLoading={isLoading} />
    </Wrapper>
  );
}

export default EpubViewer;
