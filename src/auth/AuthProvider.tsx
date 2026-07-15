import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clearAllRawBooks } from "../storage/bookCache";
import { validateGoogleCloudConfig } from "../config/google";
import { setActiveGoogleUserSub } from "../services/drive/session";
import {
  clearGoogleIdentitySession,
  initializeGoogleSignIn,
  promptGoogleSignIn,
  renderGoogleSignInButton,
  validateIdToken,
  type AuthUser,
} from "./googleIdentity";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from "./authContext";

const SESSION_TOKEN_KEY = "ebook-reader.google-id-token";

interface InitialAuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [initialAuth] = useState<InitialAuthState>(() => getInitialAuthState());
  const [user, setUser] = useState<AuthUser | null>(initialAuth.user);
  const [status, setStatus] = useState<AuthStatus>(initialAuth.status);
  const [error, setError] = useState<string | null>(initialAuth.error);

  const acceptCredential = useCallback((credential: string) => {
    try {
      const nextUser = validateIdToken(credential);
      setActiveGoogleUserSub(nextUser.sub);
      sessionStorage.setItem(SESSION_TOKEN_KEY, credential);
      setUser(nextUser);
      setError(null);
      setStatus("authenticated");
    } catch (authError) {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      setActiveGoogleUserSub(null);
      setUser(null);
      setError(
        authError instanceof Error
          ? authError.message
          : "Google sign-in failed.",
      );
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    if (status === "error") return;
    void initializeGoogleSignIn(acceptCredential).catch((authError) => {
      setError(
        authError instanceof Error
          ? authError.message
          : "Google sign-in is unavailable.",
      );
      setStatus("error");
    });
  }, [acceptCredential, status]);

  const signIn = useCallback(async () => {
    setError(null);
    await initializeGoogleSignIn(acceptCredential);
    await promptGoogleSignIn();
  }, [acceptCredential]);

  const renderSignInButton = useCallback(
    async (parent: HTMLElement) => {
      await initializeGoogleSignIn(acceptCredential);
      await renderGoogleSignInButton(parent);
    },
    [acceptCredential],
  );

  const signOut = useCallback(async () => {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    clearGoogleIdentitySession();
    setActiveGoogleUserSub(null);
    setUser(null);
    setStatus("unauthenticated");
    await clearAllRawBooks();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, error, signIn, signOut, renderSignInButton }),
    [error, renderSignInButton, signIn, signOut, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function getInitialAuthState(): InitialAuthState {
  const configError = validateGoogleCloudConfig();
  if (configError) {
    setActiveGoogleUserSub(null);
    return { user: null, status: "error", error: configError };
  }

  const storedCredential = sessionStorage.getItem(SESSION_TOKEN_KEY);
  if (!storedCredential) {
    setActiveGoogleUserSub(null);
    return { user: null, status: "unauthenticated", error: null };
  }

  try {
    const storedUser = validateIdToken(storedCredential);
    setActiveGoogleUserSub(storedUser.sub);
    return { user: storedUser, status: "authenticated", error: null };
  } catch {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    setActiveGoogleUserSub(null);
    return { user: null, status: "unauthenticated", error: null };
  }
}
