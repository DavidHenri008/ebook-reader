import styled from "@emotion/styled";
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

const NavButton = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  cursor: pointer;
  font-size: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: 12px;
  &:hover {
    background: rgba(0, 0, 0, 0.65);
  }
  &:disabled {
    cursor: default;
    opacity: 0.35;
    background: rgba(0, 0, 0, 0.25);
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
        <NavButton
          aria-label="Previous page"
          disabled={isFirstSection && atFirstPage}
          onClick={navigatePrev}
          style={{ left: 16 }}
        >
          &#8249;
        </NavButton>
      )}
      {mode === "paginated" && (
        <NavButton
          aria-label="Next page"
          disabled={isLastSection && atLastPage}
          onClick={navigateNext}
          style={{ right: 16 }}
        >
          &#8250;
        </NavButton>
      )}
    </OuterContainer>
  );
}

export default SectionViewer;
