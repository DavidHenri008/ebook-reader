// EPUB-related type definitions

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface EpubViewerProps {
  /** EPUB file to render */
  file: File;
  /** Called when the reading location changes */
  onLocationChange?: (cfi: string) => void;
  /** Initial CFI location to start reading from */
  initialLocation?: string;
  /** Called once after the book's table of contents is loaded */
  onTocLoaded?: (toc: TocItem[]) => void;
  /** Called once the rendition is ready, provides navigation controls */
  onReady?: (controls: {
    goTo: (href: string) => void;
    prev: () => void;
    next: () => void;
  }) => void;
  /** Zoom level as a percentage (e.g. 100 for 100%) */
  zoom?: number;
  /** Reading mode: "paginated" or "scroll" */
  mode?: "paginated" | "scrolled";
}
