export interface GraphDeleteRequest {
  classId: string
  graphId: string
}

export function parseGraphDeleteRequest(data: unknown): GraphDeleteRequest | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const request = data as Record<string, unknown>
  if (
    typeof request.classId !== 'string'
    || request.classId.length === 0
    || request.classId.length > 150
    || request.classId.includes('/')
    || typeof request.graphId !== 'string'
    || request.graphId.length === 0
    || request.graphId.length > 150
    || request.graphId.includes('/')
  ) return null
  return { classId: request.classId, graphId: request.graphId }
}

export function isGraphOwner(data: unknown, classId: string, uid: string): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const graph = data as Record<string, unknown>
  return graph.ownerId === uid && graph.classId === classId
}
