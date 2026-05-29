import ePub from "epubjs";

/** Minimal book shape required to disable epubjs's resource substitution. */
export interface SubstitutionDisableableBook {
  resources?: { replaceCss?: () => Promise<unknown> };
  spine?: { hooks?: { serialize?: { clear: () => void } } };
}

type EpubFactory<TBook> = (
  fileData: ArrayBuffer,
  options: { replacements: "none" },
) => TBook;

/**
 * Constructs an epubjs `Book` with resource substitution disabled at
 * construction time (`replacements: "none"`), cast to the minimal interface the
 * caller declares it needs. Each caller supplies its own narrow book type.
 *
 * @param fileData - Raw EPUB bytes.
 * @returns The constructed book cast to `TBook`.
 */
export function createEpubBook<TBook>(fileData: ArrayBuffer): TBook {
  const factory = ePub as unknown as EpubFactory<TBook>;
  return factory(fileData, { replacements: "none" });
}

/**
 * Prevents epubjs from rewriting resource references after load. It no-ops the
 * CSS replacement step and clears the spine serialize hooks, which would
 * otherwise leak `blob:` URLs into the cached HTML.
 *
 * @param book - The epubjs book to neutralise.
 */
export function disableEpubJsResourceSubstitution(
  book: SubstitutionDisableableBook,
): void {
  if (book.resources) {
    book.resources.replaceCss = () => Promise.resolve();
  }
  book.spine?.hooks?.serialize?.clear();
}
