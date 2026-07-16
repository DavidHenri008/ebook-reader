import { useMemo } from "react";
import styled from "@emotion/styled";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { BookCard, FolderCard } from "../../components";
import type { BookMeta, VirtualFolder } from "../../types";

const breadcrumbItemSx = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

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

interface LibraryViewProps {
  books: BookMeta[];
  folders: VirtualFolder[];
  activeFolder?: string;
  isAdding: boolean;
  onFolderChange: (folderId?: string) => void;
  onBookClick: (book: BookMeta) => void;
  onRemoveBook: (book: BookMeta) => void;
  onClearCache: (book: BookMeta) => void;
  onMoveBook: (book: BookMeta) => void;
  onRenameFolder: (folder: VirtualFolder) => void;
  onDeleteFolder: (folder: VirtualFolder) => void;
}

function LibraryView({
  books,
  folders,
  activeFolder,
  isAdding,
  onFolderChange,
  onBookClick,
  onRemoveBook,
  onClearCache,
  onMoveBook,
  onRenameFolder,
  onDeleteFolder,
}: LibraryViewProps) {
  const visibleBooks = useMemo(
    () => books.filter((book) => book.virtualFolderId === activeFolder),
    [activeFolder, books],
  );
  const childFolders = useMemo(
    () => folders.filter((folder) => folder.parentId === activeFolder),
    [activeFolder, folders],
  );
  const folderPath = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const path: VirtualFolder[] = [];
    const visited = new Set<string>();
    let currentId = activeFolder;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const folder = byId.get(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parentId;
    }
    return path;
  }, [activeFolder, folders]);

  return (
    <>
      <Breadcrumbs
        aria-label="Library folders"
        separator={<NavigateNextIcon fontSize="small" />}
        sx={{
          mb: 3,
          "& .MuiBreadcrumbs-ol": { flexWrap: "nowrap" },
        }}
      >
        {!activeFolder ? (
          <Typography
            aria-current="page"
            sx={{
              ...breadcrumbItemSx,
              color: "var(--text-heading)",
              fontWeight: 600,
            }}
          >
            Library
          </Typography>
        ) : (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={() => onFolderChange()}
            sx={{
              ...breadcrumbItemSx,
              color: "var(--accent)",
              font: "inherit",
              textAlign: "left",
            }}
          >
            Library
          </Link>
        )}
        {folderPath.map((folder, index) => {
          const isCurrent = index === folderPath.length - 1;
          return isCurrent ? (
            <Typography
              key={folder.id}
              aria-current="page"
              sx={{
                ...breadcrumbItemSx,
                color: "var(--text-heading)",
                fontWeight: 600,
              }}
            >
              {folder.name}
            </Typography>
          ) : (
            <Link
              key={folder.id}
              component="button"
              type="button"
              underline="hover"
              onClick={() => onFolderChange(folder.id)}
              sx={{
                ...breadcrumbItemSx,
                color: "var(--accent)",
                font: "inherit",
                textAlign: "left",
              }}
            >
              {folder.name}
            </Link>
          );
        })}
      </Breadcrumbs>

      {books.length === 0 && childFolders.length === 0 ? (
        <EmptyState>
          <EmptyTitle>Your library is empty</EmptyTitle>
          <EmptyText>
            Upload an EPUB or add one from Google Drive. App folders organize
            this library only; they do not create or move Google Drive folders.
          </EmptyText>
        </EmptyState>
      ) : visibleBooks.length === 0 && childFolders.length === 0 ? (
        <EmptyState>
          <EmptyTitle>No books here</EmptyTitle>
          <EmptyText>
            Add a book here or open one of the folders above.
          </EmptyText>
        </EmptyState>
      ) : (
        <LibraryGrid>
          {childFolders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={(selectedFolder) =>
                onFolderChange(selectedFolder.id)
              }
              onRename={onRenameFolder}
              onDelete={onDeleteFolder}
            />
          ))}
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onClick={onBookClick}
              onRemove={onRemoveBook}
              onClearCache={onClearCache}
              onMove={onMoveBook}
              status={isAdding ? "In library" : undefined}
            />
          ))}
        </LibraryGrid>
      )}
    </>
  );
}

export default LibraryView;
