import { useCallback, useRef, useState } from 'react'
import { prepareDocuments, type DocumentFile, type ExtractDeps, type ExtractedDocument } from './extractDocument'

/**
 * Holds the documents a learner has picked and reads them in the browser.
 * `maxDocuments` is the most this screen accepts; extra files are reported as errors, not silently dropped.
 */
export function useDocumentImport(maxDocuments: number, deps?: ExtractDeps) {
  const [documents, setDocuments] = useState<ExtractedDocument[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(false)
  const documentsRef = useRef<ExtractedDocument[]>([])

  const commit = useCallback((next: ExtractedDocument[]) => {
    documentsRef.current = next
    setDocuments(next)
  }, [])

  const addFiles = useCallback(
    async (files: DocumentFile[]) => {
      if (files.length === 0) return
      setPreparing(true)
      try {
        const result = await prepareDocuments(files, documentsRef.current.length, maxDocuments, deps)
        commit([...documentsRef.current, ...result.documents].slice(0, maxDocuments))
        setErrors(result.errors)
      } finally {
        setPreparing(false)
      }
    },
    [commit, deps, maxDocuments],
  )

  const remove = useCallback(
    (id: string) => {
      commit(documentsRef.current.filter((document) => document.id !== id))
      setErrors([])
    },
    [commit],
  )

  const clear = useCallback(() => {
    commit([])
    setErrors([])
  }, [commit])

  const dismissErrors = useCallback(() => setErrors([]), [])

  return { documents, errors, preparing, addFiles, remove, clear, dismissErrors }
}
