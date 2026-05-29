import styled from "@emotion/styled";

export type ButtonVariant = "filled" | "outlined";

/**
 * Shared text button primitive.
 *
 * - `filled` uses the accent background/foreground (primary actions).
 * - `outlined` uses the surface background with a subtle border (secondary actions).
 *
 * Both variants share sizing, focus-visible, and disabled handling.
 */
export const Button = styled.button<{ $variant?: ButtonVariant }>`
  height: 2.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: ${(p) =>
    p.$variant === "filled" ? "var(--accent-bg)" : "var(--bg)"};
  color: ${(p) => (p.$variant === "filled" ? "var(--accent)" : "var(--text)")};
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition:
    border-color 0.2s,
    color 0.2s,
    opacity 0.2s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: var(--accent-border);
    color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

/**
 * Square icon button primitive (e.g. theme toggle).
 * Matches {@link Button} sizing/focus behavior but is fixed-width and borderless of text.
 */
export const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background-color: var(--bg);
  color: var(--text);
  cursor: pointer;
  font-size: 1.2rem;
  transition:
    border-color 0.2s,
    color 0.2s,
    opacity 0.2s;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:hover:not(:disabled) {
    border-color: var(--accent-border);
    color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;
