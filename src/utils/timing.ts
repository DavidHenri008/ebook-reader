import type { BookTimingEntry, BookTimingReporter } from "../types/performance";

export type TimingMetadata = Omit<BookTimingEntry, "phase" | "durationMs">;

export function getTimestamp(): number {
  return globalThis.performance?.now() ?? Date.now();
}

export function elapsedMs(startedAt: number): number {
  return Number((getTimestamp() - startedAt).toFixed(1));
}

export function reportTiming(
  reporter: BookTimingReporter | undefined,
  phase: string,
  startedAt: number,
  metadata: TimingMetadata = {},
): void {
  reporter?.({ phase, durationMs: elapsedMs(startedAt), ...metadata });
}

export async function measureAsync<T>(
  reporter: BookTimingReporter | undefined,
  phase: string,
  action: () => Promise<T>,
  metadata: TimingMetadata = {},
): Promise<T> {
  const startedAt = getTimestamp();
  try {
    return await action();
  } finally {
    reportTiming(reporter, phase, startedAt, metadata);
  }
}

export function measureSync<T>(
  reporter: BookTimingReporter | undefined,
  phase: string,
  action: () => T,
  metadata: TimingMetadata = {},
): T {
  const startedAt = getTimestamp();
  try {
    return action();
  } finally {
    reportTiming(reporter, phase, startedAt, metadata);
  }
}
