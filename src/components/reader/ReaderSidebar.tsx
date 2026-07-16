import styled from "@emotion/styled";
import Paper from "@mui/material/Paper";
import type { TocItem } from "../../types";
import TocList from "./TocList";

const Sidebar = styled(Paper)`
  border-right: 1px solid var(--border);
  background-color: var(--bg);
  padding: 0.75rem 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 200px;
  max-width: 300px;
  overflow: hidden;
`;

const SidebarTitle = styled.div`
  padding: 0 1rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
  opacity: 0.6;
`;

const EmptySidebar = styled.div`
  padding: 0 1rem;
  font-size: 0.85rem;
  color: var(--text);
  opacity: 0.5;
`;

const TocContent = styled.div`
  flex: 1;
  overflow: auto;
`;

const PositionText = styled.div`
  border-top: 1px solid var(--border);
  color: var(--text);
  font-size: 0.85rem;
  line-height: 1.4;
  margin-top: auto;
  padding: 0.75rem 1rem 0;
`;

const PositionLabel = styled.div`
  color: var(--text);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.6;
`;

interface ReaderSidebarProps {
  toc: TocItem[];
  onNavigate: (href: string) => void;
  page: number;
  total: number;
}

function ReaderSidebar({ toc, onNavigate, page, total }: ReaderSidebarProps) {
  return (
    <Sidebar elevation={0} square>
      <SidebarTitle>Contents</SidebarTitle>
      <TocContent>
        {toc.length > 0 ? (
          <TocList items={toc} onNavigate={onNavigate} />
        ) : (
          <EmptySidebar>No chapters found</EmptySidebar>
        )}
      </TocContent>
      <PositionText>
        <PositionLabel>Position</PositionLabel>
        Page {page} of {total}
      </PositionText>
    </Sidebar>
  );
}

export default ReaderSidebar;
