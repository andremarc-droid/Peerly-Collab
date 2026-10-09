import type { DriveConfig } from './config'
import { DriveError } from './errors'
import type { PickerDocument } from './files'
import { loadGooglePicker } from './loadScripts'
import type { PickerInstance } from './googleTypes'

/**
 * Opens Google's own file picker. Choosing a file in it is what grants this app access to that one file
 * (the drive.file scope), so we never list or read anything else in a person's Drive.
 */
export async function pickDocuments(config: DriveConfig, token: string, options: { multiple: boolean }): Promise<PickerDocument[]> {
  await loadGooglePicker()
  const picker = window.google?.picker
  if (!picker) throw new DriveError('script')
  return new Promise<PickerDocument[]>((resolve) => {
    const browse = new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true)
    browse.setSelectFolderEnabled?.(false)
    const upload = new picker.DocsUploadView().setIncludeFolders(true)
    let builder = new picker.PickerBuilder()
      .addView(browse)
      .addView(upload)
      .setOAuthToken(token)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setTitle('Choose files from Google Drive')
    if (options.multiple) builder = builder.enableFeature(picker.Feature.MULTISELECT_ENABLED)
    const instance: PickerInstance = builder.setCallback((data) => {
      const action = data[picker.Response.ACTION]
      if (action !== picker.Action.PICKED && action !== picker.Action.CANCEL) return
      const raw = action === picker.Action.PICKED ? data[picker.Response.DOCUMENTS] : []
      const documents = Array.isArray(raw)
        ? raw.map((item: unknown): PickerDocument => {
          const entry = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
          return { id: entry[picker.Document.ID], name: entry[picker.Document.NAME], mimeType: entry[picker.Document.MIME_TYPE] }
        })
        : []
      instance.dispose?.()
      resolve(documents)
    }).build()
    instance.setVisible(true)
  })
}
