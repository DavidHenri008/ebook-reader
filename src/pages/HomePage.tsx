import { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { useNavigate } from "@tanstack/react-router";
import { BookCard, FilePicker, Button, IconButton } from "../components";
import { useDialogs } from "../components/ui";
import {
  getAllBooks,
  addBookToLibrary,
  removeBookFromLibrary,
  getBookFile,
  deleteRawBook,
  clearAllRawBooks,
  hasRawBook,
  saveRawBook,
} from "../storage";
import { extractRawBook } from "../services/bookExtractor";
import { useAppTheme } from "../styles";
import type { BookMeta } from "../types";

//#region Styled Components
const Container = styled.div`
  min-height: 100vh;
  background-color: var(--bg);
  padding: 2rem;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  font-weight: 300;
  color: var(--text-heading);
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const LibraryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1.5rem;
  justify-items: center;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
`;

const EmptyTitle = styled.h2`
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 400;
  color: var(--text-heading);
`;

const EmptyText = styled.p`
  margin: 0 0 1.5rem;
  font-size: 1rem;
  color: var(--text);
`;

const LoadingText = styled.div`
  text-align: center;
  padding: 4rem;
  color: var(--text);
`;
//#endregion

function HomePage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [theme, setTheme] = useAppTheme();
  const { confirm, alert, dialog } = useDialogs();

  const sortByTitle = useCallback(
    (list: BookMeta[]) =>
      [...list].sort((a, b) => a.title.localeCompare(b.title)),
    [],
  );

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, [setTheme]);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    const allBooks = await getAllBooks();
    setBooks(sortByTitle(allBooks));
    setIsLoading(false);
  }, [sortByTitle]);

  // Load library on mount
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      setIsAdding(true);
      try {
        const results = await Promise.all(
          files.map((file) => addBookToLibrary(file)),
        );
        setBooks((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const toAdd = results.filter((b) => !existingIds.has(b.id));
          return toAdd.length > 0 ? sortByTitle([...prev, ...toAdd]) : prev;
        });

        // Pre-extract each book into the cache so it opens instantly later.
        // Runs in the background, sequentially (one at a time): parallel
        // epubjs extraction of many books exhausts memory and crashes. We
        // intentionally do not open the book.
        void (async () => {
          for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const { id } = results[index];
            if (await hasRawBook(id)) continue;
            setExtractingIds((prev) => new Set(prev).add(id));
            try {
              const fileData = await file.arrayBuffer();
              const extracted = await extractRawBook(fileData, id);
              await saveRawBook(extracted);
            } catch (error) {
              console.warn(`Failed to pre-extract book ${id}:`, error);
            } finally {
              setExtractingIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          }
        })();
      } finally {
        setIsAdding(false);
      }
    },
    [sortByTitle],
  );

  const handleBookClick = useCallback(
    async (book: BookMeta) => {
      if (extractingIds.has(book.id)) return;
      const file = await getBookFile(book.id);
      if (file) {
        navigate({
          to: "/reader/$bookTitle",
          params: { bookTitle: book.title },
          state: { file, bookId: book.id, bookTitle: book.title, theme },
        });
      }
    },
    [navigate, theme, extractingIds],
  );

  const handleRemoveBook = useCallback(
    async (book: BookMeta) => {
      if (await confirm(`Remove "${book.title}" from your library?`)) {
        await removeBookFromLibrary(book.id);
        setBooks((prev) => prev.filter((b) => b.id !== book.id));
      }
    },
    [confirm],
  );

  const handleClearCache = useCallback(
    async (book: BookMeta) => {
      if (
        await confirm(
          `Clear the extraction cache for "${book.title}"? It will be re-extracted on next open.`,
        )
      ) {
        await deleteRawBook(book.id);
      }
    },
    [confirm],
  );

  const handleClearCachedBooks = useCallback(async () => {
    if (
      !(await confirm(
        "Clear all cached extracted books? Books stay in your library, but they will be re-extracted on next open.",
      ))
    ) {
      return;
    }

    setIsClearingCache(true);
    try {
      await clearAllRawBooks();
      await loadLibrary();
    } catch (error) {
      await alert(
        error instanceof Error
          ? error.message
          : "Failed to clear cached books.",
      );
    } finally {
      setIsClearingCache(false);
    }
  }, [loadLibrary, confirm, alert]);

  if (isLoading) {
    return (
      <Container>
        <LoadingText>Loading library...</LoadingText>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>My Library</Title>
        <HeaderActions>
          <Button
            type="button"
            onClick={handleClearCachedBooks}
            disabled={isClearingCache}
          >
            {isClearingCache ? "Clearing..." : "Clear cached books"}
          </Button>
          <IconButton
            aria-label="Toggle theme"
            title={
              theme === "light" ? "Switch to dark mode" : "Switch to light mode"
            }
            onClick={toggleTheme}
          >
            {theme === "light" ? "☾" : "☀"}
          </IconButton>
          <FilePicker
            onFileSelect={handleFileSelect}
            label="+ Add Book"
            disabled={isAdding}
          />
        </HeaderActions>
      </Header>

      {books.length === 0 ? (
        <EmptyState>
          <EmptyTitle>Your library is empty</EmptyTitle>
          <EmptyText>Add your first EPUB book to get started</EmptyText>
        </EmptyState>
      ) : (
        <LibraryGrid>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onClick={handleBookClick}
              onRemove={handleRemoveBook}
              onClearCache={handleClearCache}
              isExtracting={extractingIds.has(book.id)}
            />
          ))}
        </LibraryGrid>
      )}
      {dialog}
    </Container>
  );
}

export default HomePage;
