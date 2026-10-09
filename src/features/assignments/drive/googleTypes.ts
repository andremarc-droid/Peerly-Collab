/**
 * Minimal typings for the two Google scripts we load at runtime (Identity Services and Picker).
 * Only what this app calls is declared, so no extra @types packages are needed.
 */
export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: { type?: string; message?: string }) => void
}

export interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
}

export interface PickerView {
  setIncludeFolders: (value: boolean) => PickerView
  setSelectFolderEnabled?: (value: boolean) => PickerView
}

export interface PickerInstance {
  setVisible: (visible: boolean) => void
  dispose?: () => void
}

export interface PickerBuilderApi {
  addView: (view: PickerView) => PickerBuilderApi
  enableFeature: (feature: unknown) => PickerBuilderApi
  setOAuthToken: (token: string) => PickerBuilderApi
  setDeveloperKey: (key: string) => PickerBuilderApi
  setAppId: (appId: string) => PickerBuilderApi
  setTitle: (title: string) => PickerBuilderApi
  setCallback: (callback: (data: Record<string, unknown>) => void) => PickerBuilderApi
  build: () => PickerInstance
}

export interface GooglePickerApi {
  PickerBuilder: new () => PickerBuilderApi
  DocsView: new (viewId?: unknown) => PickerView
  DocsUploadView: new () => PickerView
  ViewId: { DOCS: unknown }
  Feature: { MULTISELECT_ENABLED: unknown }
  Action: { PICKED: string; CANCEL: string }
  Response: { ACTION: string; DOCUMENTS: string }
  Document: { ID: string; NAME: string; MIME_TYPE: string }
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: TokenClientConfig) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
      picker?: GooglePickerApi
    }
    gapi?: {
      load: (name: string, options: { callback: () => void; onerror?: () => void }) => void
    }
  }
}
