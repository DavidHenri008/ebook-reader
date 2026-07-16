import styled from "@emotion/styled";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useSectionViewer } from "./useSectionViewer";
import type { SectionViewerProps } from "./useSectionViewer";

export type { SectionViewerProps };

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const OuterContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

const Wrapper = styled.div<{ $mode: "paginated" | "scrolled" }>`
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg, #fff);
  display: ${(p) => (p.$mode === "paginated" ? "grid" : "block")};
  align-items: ${(p) => (p.$mode === "paginated" ? "safe center" : "stretch")};
  justify-items: ${(p) =>
    p.$mode === "paginated" ? "safe center" : "stretch"};
`;

const NavButton = styled(IconButton)`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background: var(--overlay);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 12px;
  &:hover {
    background: var(--overlay-strong);
  }
  &:disabled {
    cursor: default;
    opacity: 0.35;
    background: var(--overlay-weak);
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SectionViewer(props: SectionViewerProps) {
  const {
    wrapperRef,
    hostRef,
    pageInSection,
    pageCount,
    navigatePrev,
    navigateNext,
  } = useSectionViewer(props);

  const { sections, mode, currentSection } = props;

  const isFirstSection = currentSection === 0;
  const isLastSection = currentSection === sections.length - 1;
  const atFirstPage = pageInSection === 0;
  const atLastPage = pageInSection === pageCount - 1;

  return (
    <OuterContainer>
      <Wrapper ref={wrapperRef} $mode={mode} tabIndex={0}>
        {/* Shadow DOM host — sized by the active renderer. */}
        <div ref={hostRef} />
      </Wrapper>

      {mode === "paginated" && (
        <Tooltip title="Previous page" placement="right">
          <NavButton
            aria-label="Previous page"
            disabled={isFirstSection && atFirstPage}
            onClick={navigatePrev}
            style={{ left: 16 }}
          >
            <ChevronLeftIcon fontSize="large" />
          </NavButton>
        </Tooltip>
      )}
      {mode === "paginated" && (
        <Tooltip title="Next page" placement="left">
          <NavButton
            aria-label="Next page"
            disabled={isLastSection && atLastPage}
            onClick={navigateNext}
            style={{ right: 16 }}
          >
            <ChevronRightIcon fontSize="large" />
          </NavButton>
        </Tooltip>
      )}
    </OuterContainer>
  );
}

export default SectionViewer;
