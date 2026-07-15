import {
  GOOGLE_DRIVE_FILE_SCOPE,
  getGoogleCloudConfig,
  validateGoogleCloudConfig,
} from "../config/google";

const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

interface CredentialResponse {
  credential?: string;
}

interface PromptMomentNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
}

interface IdConfiguration {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface ButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
  callback?: (response: TokenResponse) => void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: unknown) => void;
}

interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize: (config: IdConfiguration) => void;
      renderButton: (parent: HTMLElement, options: ButtonConfiguration) => void;
      prompt: (
        callback?: (notification: PromptMomentNotification) => void,
      ) => void;
      disableAutoSelect: () => void;
    };
    oauth2: {
      initTokenClient: (config: TokenClientConfig) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

interface IdTokenPayload {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

let scriptPromise: Promise<void> | null = null;
let initializedClientId: string | null = null;
let cachedAccessToken: CachedAccessToken | null = null;
let tokenClient: TokenClient | null = null;

export function clearGoogleIdentitySession(): void {
  cachedAccessToken = null;
  tokenClient = null;
  window.google?.accounts.id.disableAutoSelect();
}

export function invalidateDriveAccessToken(): void {
  cachedAccessToken = null;
}

export async function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts) return;
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GIS_SCRIPT_URL}"]`,
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Identity Services.")),
          {
            once: true,
          },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Identity Services."));
      document.head.append(script);
    });
  }
  await scriptPromise;
}

export async function initializeGoogleSignIn(
  onCredential: (credential: string) => void,
): Promise<void> {
  const config = getGoogleCloudConfig();
  const configError = validateGoogleCloudConfig(config);
  if (configError) throw new Error(configError);

  await loadGoogleIdentity();
  const google = window.google;
  if (!google?.accounts) {
    throw new Error("Google Identity Services is unavailable.");
  }

  if (initializedClientId === config.clientId) return;
  google.accounts.id.initialize({
    client_id: config.clientId,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  initializedClientId = config.clientId;
}

export async function promptGoogleSignIn(): Promise<void> {
  await loadGoogleIdentity();
  if (!window.google?.accounts) {
    throw new Error("Google Identity Services is unavailable.");
  }

  return new Promise((resolve, reject) => {
    window.google?.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        reject(
          new Error(
            `Google sign-in was not displayed: ${notification.getNotDisplayedReason()}`,
          ),
        );
        return;
      }
      if (notification.isSkippedMoment()) {
        reject(
          new Error(
            `Google sign-in was skipped: ${notification.getSkippedReason()}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

export async function renderGoogleSignInButton(
  parent: HTMLElement,
): Promise<void> {
  await loadGoogleIdentity();
  const google = window.google;
  if (!google?.accounts) {
    throw new Error("Google Identity Services is unavailable.");
  }
  parent.replaceChildren();
  google.accounts.id.renderButton(parent, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    width: Math.min(parent.clientWidth || 320, 400),
  });
}

export function validateIdToken(credential: string): AuthUser {
  const config = getGoogleCloudConfig();
  const [, payloadPart] = credential.split(".");
  if (!payloadPart) throw new Error("Google credential is malformed.");

  const payload = JSON.parse(base64UrlDecode(payloadPart)) as IdTokenPayload;
  const issuerOk =
    payload.iss === "accounts.google.com" ||
    payload.iss === "https://accounts.google.com";
  if (!issuerOk) throw new Error("Google credential has an invalid issuer.");
  if (payload.aud !== config.clientId) {
    throw new Error("Google credential was issued for a different client.");
  }
  if (!payload.exp || payload.exp * 1000 <= Date.now()) {
    throw new Error("Google credential has expired.");
  }
  if (!payload.sub || !payload.email || !payload.name) {
    throw new Error("Google credential is missing profile details.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export async function requestDriveAccessToken(
  prompt: "" | "consent" = "",
): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const config = getGoogleCloudConfig();
  const configError = validateGoogleCloudConfig(config);
  if (configError) throw new Error(configError);
  await loadGoogleIdentity();
  const google = window.google;
  if (!google?.accounts) {
    throw new Error("Google Identity Services is unavailable.");
  }

  return new Promise((resolve, reject) => {
    const callback = (response: TokenResponse) => {
      if (response.error || !response.access_token) {
        reject(
          new Error(
            response.error_description ??
              response.error ??
              "Google Drive access was denied.",
          ),
        );
        return;
      }

      cachedAccessToken = {
        token: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      };
      resolve(response.access_token);
    };

    const activeTokenClient =
      tokenClient ??
      google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: GOOGLE_DRIVE_FILE_SCOPE,
        callback,
        error_callback: reject,
      });
    tokenClient = activeTokenClient;
    activeTokenClient.callback = callback;
    activeTokenClient.requestAccessToken({ prompt });
  });
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
