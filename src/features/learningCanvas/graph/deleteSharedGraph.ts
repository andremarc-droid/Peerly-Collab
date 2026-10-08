import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/functions'

interface DeleteSharedGraphRequest {
  classId: string
  graphId: string
}

const deleteSharedGraphCall = httpsCallable<DeleteSharedGraphRequest, void>(functions, 'deleteSharedGraph')

export async function deleteSharedGraph(classId: string, graphId: string): Promise<void> {
  await deleteSharedGraphCall({ classId, graphId })
}
