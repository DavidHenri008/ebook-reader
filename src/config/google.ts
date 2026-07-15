export const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

export interface GoogleCloudConfig {
  clientId: string;
  apiKey: string;
  projectNumber: string;
}

export function getGoogleCloudConfig(): GoogleCloudConfig {
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID.trim(),
    apiKey: import.meta.env.VITE_GOOGLE_API_KEY.trim(),
    projectNumber: import.meta.env.VITE_GOOGLE_PROJECT_NUMBER.trim(),
  };
}

export function validateGoogleCloudConfig(
  config = getGoogleCloudConfig(),
): string | null {
  if (!config.clientId) return "Missing VITE_GOOGLE_CLIENT_ID.";
  if (!config.apiKey) return "Missing VITE_GOOGLE_API_KEY.";
  if (!config.projectNumber) return "Missing VITE_GOOGLE_PROJECT_NUMBER.";
  return null;
}