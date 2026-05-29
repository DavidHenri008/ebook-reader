import { Component, type ErrorInfo, type ReactNode } from "react";
import styled from "@emotion/styled";
import Button from "./ui/Button";

const Fallback = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
  color: var(--text);
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-heading);
`;

const Detail = styled.p`
  margin: 0;
  max-width: 32rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text);
`;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * App-level error boundary. Catches render/runtime errors (e.g. a failed book
 * extraction re-thrown by `useBookExtraction`) so a bad EPUB cannot blank the
 * whole app, and offers a recoverable back-to-library action.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error in app:", error, info.componentStack);
  }

  private handleBackToLibrary = () => {
    // Full navigation to the app root: clears the error state and remounts the
    // router from a clean slate (the boundary sits above the router).
    window.location.assign(import.meta.env.BASE_URL);
  };

  render() {
    if (this.state.error) {
      return (
        <Fallback role="alert">
          <Title>Something went wrong</Title>
          <Detail>
            We couldn&apos;t open this book. It may be corrupted or in an
            unsupported format. Your library is safe.
          </Detail>
          <Button
            type="button"
            $variant="filled"
            onClick={this.handleBackToLibrary}
          >
            Back to library
          </Button>
        </Fallback>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
