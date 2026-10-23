import { describe, expect, it, vi } from 'vitest'
import { deleteAccountData } from './accountData'
import * as publicDeckServices from '../publicDecks/services'
import * as studyGroupServices from '../studyGroups/services'

vi.mock('../quizzes/services/teamService', () => ({
  cleanupGroupQuizData: vi.fn().mockResolvedValue({ removed: 0 }),
}))

describe('deleteAccountData publicDecks and studyGroups cleanup', () => {
  it('calls deleteMyPublicDecks and cleanupMyStudyGroupsOnAccountDeletion', async () => {
    const deletePublicSpy = vi.spyOn(publicDeckServices, 'deleteMyPublicDecks').mockResolvedValue()
    const deleteGroupsSpy = vi.spyOn(studyGroupServices, 'cleanupMyStudyGroupsOnAccountDeletion').mockResolvedValue()

    const mockDb = {
      collection: vi.fn().mockReturnValue({}),
      batch: vi.fn().mockReturnValue({ delete: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }),
    } as any

    // Mock emptyCollection and deleteLearningPlans / deleteProfileDocuments gracefully
    try {
      await deleteAccountData('user-test-1', 'student', mockDb)
    } catch {
      // In unit test without Firestore emulator, partial mock may throw on subsequent deleteProfileDocuments
    }

    expect(deletePublicSpy).toHaveBeenCalledWith('user-test-1', mockDb)
    expect(deleteGroupsSpy).toHaveBeenCalledWith('user-test-1', mockDb)
  })
})
