import { blobToDataUrl } from "../utils/blob";
import {
  createEpubBook,
  disableEpubJsResourceSubstitution,
} from "./epubjsAdapter";

type EpubMetadata = {
  title?: string;
  creator?: string;
};

type EpubMetadataBook = {
  ready: Promise<unknown>;
  loaded: {
    resources: Promise<unknown>;
    metadata: Promise<EpubMetadata>;
    cover: Promise<string | undefined>;
  };
  archived: boolean;
  archive?: { getBlob: (path: string) => Promise<Blob> | undefined };
  cover?: string;
  resources?: { replaceCss?: () => Promise<unknown> };
  spine?: { hooks?: { serialize?: { clear: () => void } } };
  destroy: () => void;
};

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
  const book = createEpubBook<EpubMetadataBook>(buffer);

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
      await book.loaded.cover;
      if (book.archived && book.archive && book.cover) {
        const blob = await book.archive.getBlob(book.cover);
        if (blob) {
          coverUrl = await blobToDataUrl(blob);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("Failed to extract EPUB cover:", error);
      }
    }

    return { title, author, coverUrl };
  } finally {
    book.destroy();
  }
}
