import styled from "@emotion/styled";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderIcon from "@mui/icons-material/Folder";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import type { VirtualFolder } from "../types";

const Card = styled.div`
  position: relative;
  width: 140px;

  &:hover .folder-action,
  &:focus-within .folder-action {
    opacity: 1;
  }
`;

const OpenButton = styled(ButtonBase)`
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

const Cover = styled(Paper)`
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

const Title = styled.div`
  width: 100%;
  margin-top: 0.5rem;
  overflow: hidden;
  color: var(--text-heading);
  font-size: 0.875rem;
  text-overflow: ellipsis;
`;

const ActionButton = styled(IconButton)`
  position: absolute;
  right: 4px;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: var(--overlay-strong);
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;

  &:focus-visible {
    opacity: 1;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const RenameButton = styled(ActionButton)`
  top: 4px;

  &:hover {
    background: var(--info);
  }
`;

const DeleteButton = styled(ActionButton)`
  top: 36px;

  &:hover {
    background: var(--danger);
  }
`;

interface FolderCardProps {
  folder: VirtualFolder;
  onClick: (folder: VirtualFolder) => void;
  onRename: (folder: VirtualFolder) => void;
  onDelete: (folder: VirtualFolder) => void;
}

function FolderCard({
  folder,
  onClick,
  onRename,
  onDelete,
}: FolderCardProps) {
  return (
    <Card>
      <OpenButton type="button" onClick={() => onClick(folder)}>
        <Cover elevation={1} aria-hidden="true">
          <FolderIcon sx={{ color: "var(--accent)", fontSize: 82 }} />
        </Cover>
        <Title title={folder.name}>{folder.name}</Title>
      </OpenButton>
      <Tooltip title="Rename folder">
        <RenameButton
          className="folder-action"
          onClick={() => onRename(folder)}
          aria-label={`Rename ${folder.name}`}
        >
          <EditOutlinedIcon sx={{ fontSize: 15 }} />
        </RenameButton>
      </Tooltip>
      <Tooltip title="Delete folder">
        <DeleteButton
          className="folder-action"
          onClick={() => onDelete(folder)}
          aria-label={`Delete ${folder.name}`}
        >
          <DeleteIcon sx={{ fontSize: 15 }} />
        </DeleteButton>
      </Tooltip>
    </Card>
  );
}

export default FolderCard;