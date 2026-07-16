import { useMemo } from "react";
import styled from "@emotion/styled";
import { BookCard } from "../../components";
import type { BookMeta, VirtualFolder } from "../../types";

const FolderNavigation = styled.nav`
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  color: var(--text);
`;

const BreadcrumbButton = styled.button<{ $current?: boolean }>`
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${(props) =>
    props.$current ? "var(--text-heading)" : "var(--accent)"};
  cursor: ${(props) => (props.$current ? "default" : "pointer")};
  font: inherit;
  font-weight: ${(props) => (props.$current ? 600 : 400)};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const FolderCard = styled.div`
  position: relative;
  width: 140px;

  &:hover .folder-action,
  &:focus-within .folder-action {
    opacity: 1;
  }
`;

const FolderOpenButton = styled.button`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: transform 0.2s;

  &:hover {
    transform: translateY(-4px);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const FolderCover = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 200px;
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  background: var(--accent-bg);
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
`;

const FolderShape = styled.div`
  position: relative;
  width: 82px;
  height: 58px;
  border-radius: 4px;
  background: var(--accent);

  &::before {
    position: absolute;
    top: -12px;
    left: 0;
    width: 36px;
    height: 16px;
    border-radius: 4px 4px 0 0;
    background: var(--accent);
    content: "";
  }
`;

const FolderTitle = styled.div`
  width: 100%;
  margin-top: 0.5rem;
  overflow: hidden;
  color: var(--text-heading);
  font-size: 0.875rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FolderAction = styled.button`
  position: absolute;
  right: 4px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: var(--overlay-strong);
  color: white;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;

  &:focus-visible {
    opacity: 1;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RenameFolderButton = styled(FolderAction)`
  top: 4px;

  &:hover {
    background: var(--info);
  }
`;

const DeleteFolderButton = styled(FolderAction)`
  top: 36px;

  &:hover {
    background: var(--danger);
  }
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
      <FolderNavigation aria-label="Library folders">
        <Breadcrumb>
          <BreadcrumbButton
            type="button"
            $current={!activeFolder}
            onClick={() => onFolderChange()}
            aria-current={!activeFolder ? "page" : undefined}
          >
            Library
          </BreadcrumbButton>
          {folderPath.map((folder, index) => {
            const isCurrent = index === folderPath.length - 1;
            return (
              <div key={folder.id}>
                <span aria-hidden="true">/ </span>
                <BreadcrumbButton
                  type="button"
                  $current={isCurrent}
                  onClick={() => onFolderChange(folder.id)}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {folder.name}
                </BreadcrumbButton>
              </div>
            );
          })}
        </Breadcrumb>
      </FolderNavigation>

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
            <FolderCard key={folder.id}>
              <FolderOpenButton
                type="button"
                onClick={() => onFolderChange(folder.id)}
              >
                <FolderCover aria-hidden="true">
                  <FolderShape />
                </FolderCover>
                <FolderTitle title={folder.name}>{folder.name}</FolderTitle>
              </FolderOpenButton>
              <RenameFolderButton
                type="button"
                className="folder-action"
                onClick={() => onRenameFolder(folder)}
                aria-label={`Rename ${folder.name}`}
                title="Rename folder"
              >
                ✎
              </RenameFolderButton>
              <DeleteFolderButton
                type="button"
                className="folder-action"
                onClick={() => onDeleteFolder(folder)}
                aria-label={`Delete ${folder.name}`}
                title="Delete folder"
              >
                X
              </DeleteFolderButton>
            </FolderCard>
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
