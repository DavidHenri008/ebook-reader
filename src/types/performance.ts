export interface BookTimingEntry {
  phase: string;
  durationMs: number;
  detail?: string;
  sectionIndex?: number;
  href?: string;
}

export type BookTimingReporter = (entry: BookTimingEntry) => void;
