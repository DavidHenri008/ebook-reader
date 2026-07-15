let activeGoogleUserSub: string | null = null;

export function setActiveGoogleUserSub(sub: string | null): void {
  activeGoogleUserSub = sub;
}

export function getActiveGoogleUserSub(): string {
  if (!activeGoogleUserSub) {
    throw new Error("A Google account is required before using Drive storage.");
  }
  return activeGoogleUserSub;
}