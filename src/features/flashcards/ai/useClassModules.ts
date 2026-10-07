import { collection, getDocs, orderBy, query, type Firestore } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { firestore } from '../../../lib/firebase/firestore'
import { parseResource } from '../../modules/schemas'
import { subscribeToModules } from '../../modules/services'
import type { SourceModule, SourceResource } from './moduleSource'

export interface ClassModuleOption {
  id: string
  title: string
  description: string
  resourceCount: number
}

/** Live list of modules the signed-in role may read in a class (students only see published ones). */
export function useClassModules(classId: string, role: 'instructor' | 'student') {
  const [state, setState] = useState<{ key: string; modules: ClassModuleOption[]; error: string | null }>({
    key: '',
    modules: [],
    error: null,
  })
  const key = `${role}:${classId}`

  useEffect(() => {
    if (!classId) return undefined
    return subscribeToModules(
      classId,
      role,
      (items) =>
        setState({
          key,
          modules: items.map((m) => ({ id: m.id, title: m.title, description: m.description, resourceCount: m.resourceCount })),
          error: null,
        }),
      (error) => setState({ key, modules: [], error: error.message }),
    )
  }, [classId, role, key])

  const current = state.key === key ? state : { modules: [], error: null }
  return { modules: current.modules, error: current.error, loading: Boolean(classId) && state.key !== key }
}

/** Reads the chosen modules once, with their resources, in the shape the prompt builder expects. */
export async function loadModulesForAi(
  classId: string,
  modules: ClassModuleOption[],
  db: Firestore = firestore,
): Promise<SourceModule[]> {
  return Promise.all(
    modules.map(async (module) => {
      const snap = await getDocs(
        query(collection(db, 'classes', classId, 'modules', module.id, 'resources'), orderBy('order')),
      )
      const resources: SourceResource[] = []
      for (const item of snap.docs) {
        try {
          const resource = parseResource(item.data())
          resources.push({ type: resource.type, title: resource.title, body: resource.body })
        } catch {
          // Skip a malformed resource rather than failing the whole import.
        }
      }
      return { title: module.title, description: module.description, resources }
    }),
  )
}
