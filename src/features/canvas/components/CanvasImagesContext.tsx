/* oxlint-disable react-refresh/only-export-components */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react'

export type CanvasImagesMap = Record<string, { dataUrl: string; alt?: string }>

const CanvasImagesContext = createContext<CanvasImagesMap>({})

export function CanvasImagesProvider({
  images = {},
  children,
}: {
  images?: CanvasImagesMap
  children: ReactNode
}) {
  return <CanvasImagesContext.Provider value={images}>{children}</CanvasImagesContext.Provider>
}

export function useCanvasImages(): CanvasImagesMap {
  return useContext(CanvasImagesContext)
}
