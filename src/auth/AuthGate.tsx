import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { Button } from "../components";
import { useAuth } from "./authContext";

const Shell = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background:
    radial-gradient(circle at top left, var(--accent-bg), transparent 18rem),
    var(--bg);
`;

const Panel = styled.div`
  width: min(100%, 30rem);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2rem;
  background: var(--bg);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16);
`;

const Title = styled.h1`
  margin: 0 0 0.75rem;
  color: var(--text-heading);
  font-size: 2rem;
  font-weight: 400;
`;

const Text = styled.p`
  margin: 0 0 1.5rem;
  color: var(--text);
`;

const ErrorText = styled.p`
  margin: 1rem 0 0;
  color: var(--danger);
`;

const GoogleButtonHost = styled.div`
  min-height: 44px;
  margin-bottom: 0.75rem;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: center;
`;

interface AuthGateProps {
  children: React.ReactNode;
}

function AuthGate({ children }: AuthGateProps) {
  const { status, error, signIn, renderSignInButton } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "unauthenticated" || !googleButtonRef.current) return;
    void renderSignInButton(googleButtonRef.current);
  }, [renderSignInButton, status]);

  if (status === "authenticated") return <>{children}</>;

  return (
    <Shell>
      <Panel>
        <Title>EPUB Reader</Title>
        <Text>Sign in with Google to access your Google Drive library.</Text>
        <GoogleButtonHost ref={googleButtonRef} />
        <ButtonRow>
          <Button
            type="button"
            $variant="filled"
            disabled={status === "checking" || status === "error"}
            onClick={() => void signIn()}
          >
            {status === "checking"
              ? "Checking session..."
              : "Use Google prompt"}
          </Button>
        </ButtonRow>
        {error && <ErrorText>{error}</ErrorText>}
      </Panel>
    </Shell>
  );
}

export default AuthGate;
