import ePub from "epubjs";
import { blobToDataUrl } from "../utils/blob";

type EpubMetadata = {
  title?: string;
  creator?: string;
};

type EpubMetadataBook = {
  ready: Promise<unknown>;
  loaded: {
    resources: Promise<unknown>;
    metadata: Promise<EpubMetadata>;
  };
  resources?: { replaceCss?: () => Promise<unknown> };
  spine?: { hooks?: { serialize?: { clear: () => void } } };
  coverUrl: () => Promise<string | null>;
  destroy: () => void;
};

type EpubMetadataFactory = (
  fileData: ArrayBuffer,
  options: { replacements: "none" },
) => EpubMetadataBook;

const createMetadataBook = ePub as unknown as EpubMetadataFactory;

function disableEpubJsResourceSubstitution(book: EpubMetadataBook): void {
  if (book.resources) {
    book.resources.replaceCss = () => Promise.resolve();
  }
  book.spine?.hooks?.serialize?.clear();
}

/**
 * Extract metadata from an EPUB file.
 * @param buffer - ArrayBuffer of the EPUB file
 * @param filename - Original filename
 * @returns Promise resolving to partial BookMeta
 */
export async function extractEpubMetadata(
  buffer: ArrayBuffer,
  filename: string,
): Promise<{ title: string; author?: string; coverUrl?: string }> {
  const book = createMetadataBook(buffer, { replacements: "none" });

  try {
    await book.loaded.resources;
    disableEpubJsResourceSubstitution(book);
    await book.ready;

    const metadata = await book.loaded.metadata;
    const title = metadata.title || filename.replace(/\.epub$/i, "");
    const author = metadata.creator || undefined;

    // Try to extract cover as base64 data URL (blob URLs expire after book.destroy)
    let coverUrl: string | undefined;
    try {
      const blobUrl = await book.coverUrl();
      if (blobUrl) {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        coverUrl = await blobToDataUrl(blob);
      }
    } catch {
      // No cover available
    }

    return { title, author, coverUrl };
  } finally {
    book.destroy();
  }
}
