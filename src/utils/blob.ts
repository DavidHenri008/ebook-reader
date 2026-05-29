/**
 * Reads a Blob and resolves to a base64 `data:` URL string.
 *
 * Used to persist EPUB assets and cover images as durable data URLs, since
 * `blob:` URLs created by epubjs are revoked once the book is destroyed.
 *
 * @param blob - The Blob to encode.
 * @returns A promise resolving to the data URL representation of the blob.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as a data URL."));
      }
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read blob."));
    });
    reader.readAsDataURL(blob);
  });
}
