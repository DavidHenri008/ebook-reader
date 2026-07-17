import { useState, useEffect, useCallback, useRef } from "react";
import styled from "@emotion/styled";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components";
import { useDialogs } from "../components/ui";
import { useAuth } from "../auth";
import HomeHeader from "./home/HomeHeader";
import HomeToolbar from "./home/HomeToolbar";
import LibraryView from "./home/LibraryView";
import getFolderPath from "./home/folderPath";
import {
  DriveLibraryNotConfiguredError,
  addBookToLibrary,
  addBooksFromDrivePicker,
  chooseLibraryFolder,
  clearAllRawBooks,
  createLibraryFolder,
  deleteLibraryFolder,
  deleteRawBook,
  getLibrarySnapshot,
  getStorageErrorMessage,
  hydrateBookCover,
  loadLibraryTheme,
  refreshLibrary,
  removeBookFromLibrary,
  renameLibraryFolder,
  saveLibraryTheme,
  setBookVirtualFolder,
} from "../storage";
import { useAppTheme } from "../styles";
import type {
  BookMeta,
  DriveLibraryInfo,
  LibrarySnapshot,
  VirtualFolder,
} from "../types";

const Container = styled.div`
  min-height: 100vh;
  background-color: var(--bg);
  padding: 2rem;
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

const MessageArea = styled.div`
  min-height: 1.5rem;
  margin-bottom: 0.5rem;
`;

const StatusText = styled.div`
  color: var(--text);
  overflow-wrap: anywhere;
`;

const ErrorText = styled.div`
  color: var(--danger);
  overflow-wrap: anywhere;
`;

function formatProgress(
  message: string,
  loaded: number | undefined,
  total: number | undefined,
): string {
  if (loaded === undefined || loaded < 0) return message;
  const loadedMb = Math.round(loaded / (1024 * 1024));
  const totalMb = Math.round((total ?? 0) / (1024 * 1024));
  return totalMb > 0
    ? `${message} ${Math.min(loadedMb, totalMb)} MB / ${totalMb} MB`
    : `${message} ${loadedMb} MB`;
}

function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [folders, setFolders] = useState<VirtualFolder[]>([]);
  const [libraryInfo, setLibraryInfo] = useState<DriveLibraryInfo | null>(null);
  const [needsFolder, setNeedsFolder] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const attemptedCoverIds = useRef(new Set<string>());
  const [theme, setTheme] = useAppTheme();
  const { confirm, alert, prompt, select, dialog } = useDialogs();

  const showAddedBook = useCallback((book: BookMeta) => {
    setBooks((current) => [
      ...current.filter((candidate) => candidate.id !== book.id),
      book,
    ]);
  }, []);

  const applySnapshot = useCallback((snapshot: LibrarySnapshot) => {
    setBooks(snapshot.books);
    setFolders(snapshot.virtualFolders);
    setLibraryInfo(snapshot.info);
    setNeedsFolder(false);
    setActiveFolder((current) =>
      current &&
      !snapshot.virtualFolders.some((folder) => folder.id === current)
        ? undefined
        : current,
    );
  }, []);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const snapshot = await getLibrarySnapshot();
      applySnapshot(snapshot);
      const driveTheme = await loadLibraryTheme();
      setTheme(driveTheme);
    } catch (error) {
      if (error instanceof DriveLibraryNotConfiguredError) {
        setNeedsFolder(true);
      } else {
        setErrorMessage(getStorageErrorMessage(error));
      }
    } finally {
      setIsLoading(false);
    }
  }, [applySnapshot, setTheme]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    const booksWithoutCovers = books.filter(
      (book) =>
        !book.coverUrl &&
        book.driveFileId &&
        !attemptedCoverIds.current.has(book.id),
    );
    if (isLoading || booksWithoutCovers.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const book of booksWithoutCovers) {
        attemptedCoverIds.current.add(book.id);
        try {
          const hydrated = await hydrateBookCover(book.id);
          if (cancelled) return;
          setBooks((current) =>
            current.map((candidate) =>
              candidate.id === hydrated.id ? hydrated : candidate,
            ),
          );
        } catch (error) {
          console.warn(`Failed to load cover for ${book.title}:`, error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [books, isLoading]);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    void saveLibraryTheme(nextTheme).catch((error) => {
      setErrorMessage(getStorageErrorMessage(error));
    });
  }, [setTheme, theme]);

  const handleChooseFolder = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      applySnapshot(await chooseLibraryFolder());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [applySnapshot]);

  const handleChangeFolder = useCallback(async () => {
    if (
      !(await confirm(
        "Do you want to choose a different Google Drive library folder?",
      ))
    ) {
      return;
    }
    await handleChooseFolder();
  }, [confirm, handleChooseFolder]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      applySnapshot(await refreshLibrary());
      const driveTheme = await loadLibraryTheme();
      setTheme(driveTheme);
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }, [applySnapshot, setTheme]);

  const handleFileSelect = useCallback(
    async (files: File[]) => {
      setIsAdding(true);
      setErrorMessage(null);
      try {
        for (const file of files) {
          const book = await addBookToLibrary(
            file,
            (message, loaded, total) => {
              setProgressMessage(formatProgress(message, loaded, total));
            },
            activeFolder,
          );
          showAddedBook(book);
        }
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      } finally {
        setProgressMessage(null);
        setIsAdding(false);
      }
    },
    [activeFolder, applySnapshot, showAddedBook],
  );

  const handleAddFromDrive = useCallback(async () => {
    setIsAdding(true);
    setErrorMessage(null);
    try {
      await addBooksFromDrivePicker(
        (message, loaded, total) => {
          setProgressMessage(formatProgress(message, loaded, total));
        },
        activeFolder,
        showAddedBook,
      );
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    } finally {
      setProgressMessage(null);
      setIsAdding(false);
    }
  }, [activeFolder, applySnapshot, showAddedBook]);

  const handleBookClick = useCallback(
    (book: BookMeta) => {
      navigate({
        to: "/reader/$bookId",
        params: { bookId: book.id },
        state: { bookId: book.id, bookTitle: book.title, theme },
      });
    },
    [navigate, theme],
  );

  const handleRemoveBook = useCallback(
    async (book: BookMeta) => {
      if (
        !(await confirm(
          `Remove "${book.title}" from your library? The EPUB file stays in your Google Drive.`,
          { confirmLabel: "Remove" },
        ))
      ) {
        return;
      }

      setErrorMessage(null);
      setBooks((current) =>
        current.filter((candidate) => candidate.id !== book.id),
      );
      try {
        await removeBookFromLibrary(book.id);
      } catch (error) {
        setBooks((current) =>
          current.some((candidate) => candidate.id === book.id)
            ? current
            : [...current, book],
        );
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [confirm],
  );

  const handleClearCache = useCallback(
    async (book: BookMeta) => {
      if (
        await confirm(
          `Clear the extraction cache for "${book.title}"? It will be downloaded and re-extracted on next open.`,
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
        "Clear all cached extracted books? Books stay in your Google Drive library, but they will download and re-extract on next open.",
      ))
    ) {
      return;
    }

    setIsClearingCache(true);
    try {
      await clearAllRawBooks();
    } catch (error) {
      await alert(getStorageErrorMessage(error));
    } finally {
      setIsClearingCache(false);
    }
  }, [confirm, alert]);

  const handleCreateFolder = useCallback(async () => {
    const name = await prompt("New folder name", {
      confirmLabel: "Create folder",
      inputLabel: "Folder name",
    });
    if (name === null) return;
    try {
      await createLibraryFolder(name, activeFolder);
      applySnapshot(await getLibrarySnapshot());
    } catch (error) {
      setErrorMessage(getStorageErrorMessage(error));
    }
  }, [activeFolder, applySnapshot, prompt]);

  const handleRenameFolder = useCallback(
    async (folder: VirtualFolder) => {
      const nextName = await prompt("Rename folder", {
        confirmLabel: "Rename",
        defaultValue: folder.name,
        inputLabel: "Folder name",
      });
      if (nextName === null || nextName.trim() === folder.name) return;
      try {
        await renameLibraryFolder(folder.id, nextName);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot, prompt],
  );

  const handleDeleteFolder = useCallback(
    async (folder: VirtualFolder) => {
      if (
        !(await confirm(
          `Delete the app folder "${folder.name}"? Books stay in your library and Google Drive files are not moved or deleted.`,
          { confirmLabel: "Delete folder" },
        ))
      ) {
        return;
      }
      try {
        await deleteLibraryFolder(folder.id);
        applySnapshot(await getLibrarySnapshot());
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
      }
    },
    [applySnapshot, confirm],
  );

  const handleMoveBook = useCallback(
    async (book: BookMeta) => {
      const folderId = await select(`Move "${book.title}"`, {
        confirmLabel: "Move",
        inputLabel: "Destination folder",
        defaultValue: book.virtualFolderId ?? "",
        options: [
          { label: "Library", value: "" },
          ...folders
            .map((folder) => ({
              label: `Library / ${getFolderPath(folder, folders)}`,
              value: folder.id,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ],
      });
      if (folderId === null) return;
      const destinationId = folderId || undefined;
      if (destinationId === book.virtualFolderId) return;
      setBooks((prev) =>
        prev.map((candidate) =>
          candidate.id === book.id
            ? { ...candidate, virtualFolderId: destinationId }
            : candidate,
        ),
      );
      try {
        await setBookVirtualFolder(book.id, destinationId);
      } catch (error) {
        setErrorMessage(getStorageErrorMessage(error));
        applySnapshot(await getLibrarySnapshot());
      }
    },
    [applySnapshot, folders, select],
  );

  if (isLoading) {
    return (
      <Container>
        <LoadingText>Loading Google Drive library...</LoadingText>
      </Container>
    );
  }

  if (needsFolder) {
    return (
      <Container>
        <EmptyState>
          <EmptyTitle>Choose a Google Drive library folder</EmptyTitle>
          <EmptyText>
            The app will create an app-data folder for library.json and
            settings.json. Your EPUB files stay in Google Drive.
          </EmptyText>
          <Button
            type="button"
            $variant="filled"
            onClick={handleChooseFolder}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Opening Picker..." : "Choose Google Drive folder"}
          </Button>
          {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
        </EmptyState>
        {dialog}
      </Container>
    );
  }

  return (
    <Container>
      <HomeHeader
        libraryInfo={libraryInfo}
        user={user}
        onSignOut={() => void signOut()}
      />
      <HomeToolbar
        isAdding={isAdding}
        isRefreshing={isRefreshing}
        isClearingCache={isClearingCache}
        theme={theme}
        searchQuery={searchQuery}
        sortDirection={sortDirection}
        onAddFromDrive={() => void handleAddFromDrive()}
        onFileSelect={handleFileSelect}
        onCreateFolder={() => void handleCreateFolder()}
        onRefresh={() => void handleRefresh()}
        onChangeFolder={() => void handleChangeFolder()}
        onClearCachedBooks={() => void handleClearCachedBooks()}
        onToggleTheme={toggleTheme}
        onSearchQueryChange={setSearchQuery}
        onToggleSortDirection={() =>
          setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
        }
      />

      <MessageArea aria-live="polite">
        {progressMessage && <StatusText>{progressMessage}</StatusText>}
        {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
      </MessageArea>
      <LibraryView
        books={books}
        folders={folders}
        activeFolder={activeFolder}
        isAdding={isAdding}
        searchQuery={searchQuery}
        sortDirection={sortDirection}
        onFolderChange={setActiveFolder}
        onBookClick={handleBookClick}
        onRemoveBook={(book) => void handleRemoveBook(book)}
        onClearCache={(book) => void handleClearCache(book)}
        onMoveBook={(book) => void handleMoveBook(book)}
        onRenameFolder={(folder) => void handleRenameFolder(folder)}
        onDeleteFolder={(folder) => void handleDeleteFolder(folder)}
      />
      {dialog}
    </Container>
  );
}

export default HomePage;
