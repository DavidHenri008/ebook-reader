import { requestDriveAccessToken } from "../../auth/googleIdentity";
import { getGoogleCloudConfig } from "../../config/google";

const GAPI_SCRIPT_URL = "https://apis.google.com/js/api.js";
const EPUB_MIME_TYPES = "application/epub+zip,application/octet-stream";

interface GapiApi {
  load: (name: string, callback: () => void) => void;
}

interface PickerDocument {
  id?: string;
  name?: string;
  mimeType?: string;
}

interface PickerResponse {
  [key: string]: unknown;
}

interface PickerApi {
  Action: { PICKED: string; CANCEL: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string; MIME_TYPE: string };
  Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
  ViewId: { FOLDERS: string; DOCS: string };
  DocsView: new (viewId?: string) => PickerDocsView;
  PickerBuilder: new () => PickerBuilder;
}

interface PickerDocsView {
  setIncludeFolders: (value: boolean) => PickerDocsView;
  setSelectFolderEnabled: (value: boolean) => PickerDocsView;
  setMimeTypes: (value: string) => PickerDocsView;
}

interface PickerBuilder {
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  addView: (view: PickerDocsView) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

declare global {
  interface Window {
    gapi?: GapiApi;
  }
}

let gapiScriptPromise: Promise<void> | null = null;
let pickerLoadPromise: Promise<void> | null = null;

export interface PickedDriveItem {
  id: string;
  name: string;
  mimeType?: string;
}

export async function pickLibraryFolder(): Promise<PickedDriveItem | null> {
  const picker = await loadPickerApi();
  const view = new picker.DocsView(picker.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true);
  const picked = await openPicker(picker, [view], false);
  return picked[0] ?? null;
}

export async function pickEpubFiles(): Promise<PickedDriveItem[]> {
  const picker = await loadPickerApi();
  const view = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(
    EPUB_MIME_TYPES,
  );
  return openPicker(picker, [view], true);
}

async function openPicker(
  picker: PickerApi,
  views: PickerDocsView[],
  multiselect: boolean,
): Promise<PickedDriveItem[]> {
  const config = getGoogleCloudConfig();
  const token = await requestDriveAccessToken("consent");

  return new Promise((resolve, reject) => {
    let builder = new picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.projectNumber)
      .enableFeature(picker.Feature.SUPPORT_DRIVES)
      .setCallback((response) => {
        const action = response[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) {
          resolve([]);
          return;
        }
        if (action !== picker.Action.PICKED) return;

        const docs = response[picker.Response.DOCUMENTS];
        if (!Array.isArray(docs)) {
          reject(new Error("Google Picker returned no documents."));
          return;
        }
        resolve(docs.map((doc) => toPickedDriveItem(picker, doc)));
      });

    for (const view of views) builder = builder.addView(view);
    if (multiselect) builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    builder.build().setVisible(true);
  });
}

async function loadPickerApi(): Promise<PickerApi> {
  await loadGapiScript();
  if (!pickerLoadPromise) {
    pickerLoadPromise = new Promise((resolve, reject) => {
      if (!window.gapi) {
        reject(new Error("Google API loader is unavailable."));
        return;
      }
      window.gapi.load("picker", resolve);
    });
  }
  await pickerLoadPromise;
  const picker = (window.google as unknown as { picker?: PickerApi } | undefined)
    ?.picker;
  if (!picker) throw new Error("Google Picker is unavailable.");
  return picker;
}

function loadGapiScript(): Promise<void> {
  if (window.gapi) return Promise.resolve();
  if (!gapiScriptPromise) {
    gapiScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GAPI_SCRIPT_URL}"]`,
      );
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google API script.")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = GAPI_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google API script."));
      document.head.append(script);
    });
  }
  return gapiScriptPromise;
}

function toPickedDriveItem(
  picker: PickerApi,
  doc: PickerDocument,
): PickedDriveItem {
  const id = doc[picker.Document.ID as keyof PickerDocument];
  const name = doc[picker.Document.NAME as keyof PickerDocument];
  const mimeType = doc[picker.Document.MIME_TYPE as keyof PickerDocument];
  if (typeof id !== "string" || typeof name !== "string") {
    throw new Error("Google Picker returned an invalid document.");
  }
  return { id, name, mimeType: typeof mimeType === "string" ? mimeType : undefined };
}