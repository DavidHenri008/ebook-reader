import { describe, expect, it, vi } from "vitest";

const { createEpubBook } = vi.hoisted(() => ({
  createEpubBook: vi.fn(),
}));

vi.mock("../epubjsAdapter", () => ({
  createEpubBook,
  disableEpubJsResourceSubstitution: vi.fn(),
}));

import { extractEpubMetadata } from "../epubMetadata";

describe("extractEpubMetadata", () => {
  it("reads an archived cover directly as a durable data URL", async () => {
    const destroy = vi.fn();
    createEpubBook.mockReturnValue({
      ready: Promise.resolve(),
      loaded: {
        resources: Promise.resolve(),
        metadata: Promise.resolve({ title: "Test Book", creator: "Author" }),
        cover: Promise.resolve("/OPS/images/cover.jpg"),
      },
      archived: true,
      cover: "/OPS/images/cover.jpg",
      archive: {
        getBlob: vi
          .fn()
          .mockResolvedValue(new Blob(["cover"], { type: "image/jpeg" })),
      },
      destroy,
    });

    const metadata = await extractEpubMetadata(
      new ArrayBuffer(0),
      "book.epub",
    );

    expect(metadata).toEqual({
      title: "Test Book",
      author: "Author",
      coverUrl: "data:image/jpeg;base64,Y292ZXI=",
    });
    expect(destroy).toHaveBeenCalledOnce();
  });
});