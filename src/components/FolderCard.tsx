import { useId, useState } from "react";
import styled from "@emotion/styled";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderIcon from "@mui/icons-material/Folder";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import type { VirtualFolder } from "../types";

const Card = styled.div`
  position: relative;
  width: 140px;
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

const ActionMenuButton = styled(IconButton)`
  position: absolute;
  right: 4px;
  top: 4px;
  z-index: 1;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--overlay-strong);
  color: white;
  cursor: pointer;

  &:hover {
    background: var(--overlay-strong);
  }

  &.Mui-focusVisible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

interface FolderCardProps {
  folder: VirtualFolder;
  onClick: (folder: VirtualFolder) => void;
  onRename: (folder: VirtualFolder) => void;
  onDelete: (folder: VirtualFolder) => void;
}

function FolderCard({ folder, onClick, onRename, onDelete }: FolderCardProps) {
  const menuId = useId();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  return (
    <Card>
      <OpenButton type="button" onClick={() => onClick(folder)}>
        <Cover elevation={1} aria-hidden="true">
          <FolderIcon sx={{ color: "var(--accent)", fontSize: 82 }} />
        </Cover>
        <Title title={folder.name}>{folder.name}</Title>
      </OpenButton>
      <Tooltip title={`Actions for ${folder.name}`}>
        <ActionMenuButton
          aria-label={`Actions for ${folder.name}`}
          aria-controls={menuAnchor ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={menuAnchor ? "true" : undefined}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          <MoreVertIcon />
        </ActionMenuButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            closeMenu();
            onRename(folder);
          }}
        >
          <ListItemIcon>
            <EditOutlinedIcon />
          </ListItemIcon>
          Rename folder
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            onDelete(folder);
          }}
        >
          <ListItemIcon>
            <DeleteIcon color="error" />
          </ListItemIcon>
          Delete folder
        </MenuItem>
      </Menu>
    </Card>
  );
}

export default FolderCard;
