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
  /** Zoom percentage (100 = default, 150 = 50% larger text) */
  zoom: number;
  /** Called when the reading location changes */
  onLocationChange?: (cfi: string) => void;
  /** Initial CFI location to start reading from */
  initialLocation?: string;
  /** Called once after the book's table of contents is loaded */
  onTocLoaded?: (toc: TocItem[]) => void;
  /** Called once the rendition is ready, provides a goTo function for navigation */
  onReady?: (goTo: (href: string) => void) => void;
}
