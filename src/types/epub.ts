// EPUB-related type definitions

export interface TocItem {
  id: string;
  label: string;
  href: string;
  subitems?: TocItem[];
}
