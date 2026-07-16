import type { VirtualFolder } from "../../types";

function getFolderPath(
  folder: VirtualFolder,
  folders: VirtualFolder[],
): string {
  const byId = new Map(folders.map((candidate) => [candidate.id, candidate]));
  const names = [folder.name];
  const visited = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export default getFolderPath;
