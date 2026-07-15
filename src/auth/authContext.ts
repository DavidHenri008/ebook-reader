import { createContext, useContext } from "react";
import type { AuthUser } from "./googleIdentity";

export type AuthStatus =
  | "checking"
  | "unauthenticated"
  | "authenticated"
  | "error";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  renderSignInButton: (parent: HTMLElement) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}