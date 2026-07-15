import {
  invalidateDriveAccessToken,
  requestDriveAccessToken,
} from "../../auth/googleIdentity";
import type { DriveFileFingerprint } from "../../types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const RETRYABLE_STATUS = new Set([403, 408, 429, 500, 502, 503, 504]);

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
  version?: string;
}

export interface DriveJsonFileMetadata extends DriveFileMetadata {
  appProperties?: Record<string, string>;
}

interface DriveErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

export class DriveApiError extends Error {
  readonly status: number;
  readonly reason?: string;

  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
    this.reason = reason;
  }
}

interface CreateFileOptions {
  name: string;
  mimeType: string;
  parentId?: string;
  appProperties?: Record<string, string>;
  fields?: string;
}

interface UploadFileOptions {
  file: File;
  parentId: string;
  appProperties?: Record<string, string>;
  onProgress?: (loaded: number, total: number) => void;
}

export function fingerprintFromMetadata(
  metadata: DriveFileMetadata,
): DriveFileFingerprint {
  return {
    modifiedTime: metadata.modifiedTime,
    size: metadata.size,
    md5Checksum: metadata.md5Checksum,
    version: metadata.version,
  };
}

export function fingerprintsMatch(
  a: DriveFileFingerprint | undefined,
  b: DriveFileFingerprint | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.modifiedTime === b.modifiedTime &&
    a.size === b.size &&
    a.md5Checksum === b.md5Checksum &&
    a.version === b.version
  );
}

export async function getDriveFileMetadata(
  fileId: string,
  fields = "id,name,mimeType,modifiedTime,size,md5Checksum,version",
): Promise<DriveFileMetadata> {
  const params = new URLSearchParams({ fields, supportsAllDrives: "true" });
  return driveJson<DriveFileMetadata>(`/files/${fileId}?${params}`);
}

export async function downloadDriveFile(
  fileId: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    alt: "media",
    supportsAllDrives: "true",
  });
  const response = await authorizedFetch(
    `${DRIVE_API}/files/${fileId}?${params}`,
  );
  const total = Number(response.headers.get("content-length") ?? 0);

  if (!response.body || !onProgress) return response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

export async function createDriveFolder(
  options: Omit<CreateFileOptions, "mimeType">,
): Promise<DriveJsonFileMetadata> {
  return createDriveFileMetadata({
    ...options,
    mimeType: "application/vnd.google-apps.folder",
  });
}

export async function createDriveJsonFile<T>(
  options: Omit<CreateFileOptions, "mimeType"> & { body: T },
): Promise<DriveJsonFileMetadata> {
  const metadata = await createDriveFileMetadata({
    ...options,
    mimeType: "application/json",
  });
  await updateDriveJsonFile(metadata.id, options.body, options.appProperties);
  return metadata;
}

export async function readDriveJsonFile<T>(fileId: string): Promise<T> {
  const response = await authorizedFetch(
    `${DRIVE_API}/files/${fileId}?${new URLSearchParams({
      alt: "media",
      supportsAllDrives: "true",
    })}`,
  );
  return response.json() as Promise<T>;
}

export async function updateDriveJsonFile<T>(
  fileId: string,
  body: T,
  appProperties?: Record<string, string>,
): Promise<DriveJsonFileMetadata> {
  const metadata = appProperties ? { appProperties } : {};
  const params = new URLSearchParams({
    uploadType: "multipart",
    fields: "id,name,mimeType,modifiedTime,size,version,appProperties",
    supportsAllDrives: "true",
  });
  const boundary = `ebook-reader-${crypto.randomUUID()}`;
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(body),
    `--${boundary}--`,
  ].join("\r\n");

  return driveJson<DriveJsonFileMetadata>(`/files/${fileId}?${params}`, {
    method: "PATCH",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });
}

export async function listDriveFilesByAppProperty(
  key: string,
  value: string,
  fields = "files(id,name,mimeType,modifiedTime,size,md5Checksum,version,appProperties)",
): Promise<DriveJsonFileMetadata[]> {
  const query = `appProperties has { key='${escapeDriveQuery(key)}' and value='${escapeDriveQuery(value)}' } and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields,
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const result = await driveJson<{ files?: DriveJsonFileMetadata[] }>(
    `/files?${params}`,
  );
  return result.files ?? [];
}

export async function uploadDriveEpubResumable(
  options: UploadFileOptions,
): Promise<DriveFileMetadata> {
  const metadata = {
    name: options.file.name,
    mimeType: options.file.type || "application/epub+zip",
    parents: [options.parentId],
    appProperties: options.appProperties,
  };
  const params = new URLSearchParams({
    uploadType: "resumable",
    fields: "id,name,mimeType,modifiedTime,size,md5Checksum,version",
    supportsAllDrives: "true",
  });
  const startResponse = await authorizedFetch(
    `${DRIVE_UPLOAD_API}/files?${params}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": options.file.type || "application/epub+zip",
        "X-Upload-Content-Length": String(options.file.size),
      },
      body: JSON.stringify(metadata),
    },
  );
  const uploadUrl = startResponse.headers.get("location");
  if (!uploadUrl)
    throw new Error("Google Drive did not return an upload session.");
  return uploadWithProgress(uploadUrl, options.file, options.onProgress);
}

async function createDriveFileMetadata(
  options: CreateFileOptions,
): Promise<DriveJsonFileMetadata> {
  const params = new URLSearchParams({
    fields:
      options.fields ??
      "id,name,mimeType,modifiedTime,size,version,appProperties",
    supportsAllDrives: "true",
  });
  return driveJson<DriveJsonFileMetadata>(`/files?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      name: options.name,
      mimeType: options.mimeType,
      parents: options.parentId ? [options.parentId] : undefined,
      appProperties: options.appProperties,
    }),
  });
}

async function driveJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(`${DRIVE_API}${path}`, init);
  return response.json() as Promise<T>;
}

async function authorizedFetch(
  input: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<Response> {
  const token = await requestDriveAccessToken("");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.ok) return response;

  if (response.status === 401 && attempt === 0) {
    invalidateDriveAccessToken();
    return authorizedFetch(input, init, attempt + 1);
  }

  if (RETRYABLE_STATUS.has(response.status) && attempt < 4) {
    await delay(backoffMs(attempt));
    return authorizedFetch(input, init, attempt + 1);
  }

  throw await toDriveError(response);
}

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<DriveFileMetadata> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", uploadUrl);
    request.setRequestHeader(
      "Content-Type",
      file.type || "application/epub+zip",
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(JSON.parse(request.responseText) as DriveFileMetadata);
      } else {
        reject(new DriveApiError(request.status, request.responseText));
      }
    };
    request.onerror = () => reject(new Error("Google Drive upload failed."));
    request.send(file);
  });
}

async function toDriveError(response: Response): Promise<DriveApiError> {
  let body: DriveErrorBody | null = null;
  try {
    body = (await response.json()) as DriveErrorBody;
  } catch {
    body = null;
  }
  const reason = body?.error?.errors?.[0]?.reason;
  const message = body?.error?.message ?? response.statusText;
  return new DriveApiError(response.status, message, reason);
}

function backoffMs(attempt: number): number {
  const base = 400 * 2 ** attempt;
  return base + Math.floor(Math.random() * 250);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeDriveQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}
