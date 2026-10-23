import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyGroupSettingsTab } from './StudyGroupSettingsTab'
import type { StudyGroup } from '../types'

vi.mock('../services', () => ({
  updateStudyGroupPrivacy: vi.fn(),
  updateStudyGroupSettings: vi.fn(),
}))

const mockShowToast = vi.fn()
vi.mock('../../../shared/ui/useToast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { updateStudyGroupPrivacy, updateStudyGroupSettings } from '../services'

describe('StudyGroupSettingsTab', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const baseGroup: StudyGroup = {
    id: 'grp-1',
    name: 'Biology 101 Study Pod',
    description: 'Weekly prep and flashcards',
    privacy: 'public',
    inviteCode: 'BIO101',
    ownerId: 'user-alice',
    ownerDisplayName: 'Alice',
    memberCount: 3,
    maxMembers: 50,
    createdAt: { toMillis: () => 1000 } as any,
    updatedAt: { toMillis: () => 1000 } as any,
  }

  it('renders privacy options and allows owner to switch from public to private', async () => {
    vi.mocked(updateStudyGroupPrivacy).mockResolvedValue(undefined)
    const onUpdateGroup = vi.fn()

    render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={true}
        onUpdateGroup={onUpdateGroup}
        onCopyCode={vi.fn().mockResolvedValue(undefined)}
        onRegenerateCode={vi.fn().mockResolvedValue(undefined)}
        onDeleteGroup={vi.fn()}
        onLeaveGroup={vi.fn()}
      />,
    )

    expect(screen.getByText('Group Privacy')).toBeTruthy()
    const privateRadio = screen.getByRole('radio', { name: /private group/i })
    expect(privateRadio).toBeTruthy()

    fireEvent.click(privateRadio)

    await waitFor(() => {
      expect(updateStudyGroupPrivacy).toHaveBeenCalledWith('grp-1', 'private')
      expect(onUpdateGroup).toHaveBeenCalledWith(
        expect.objectContaining({ privacy: 'private' }),
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Study group is now private.')
    })
  })

  it('renders read-only privacy notice for non-owners', () => {
    render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={false}
        onUpdateGroup={vi.fn()}
        onCopyCode={vi.fn().mockResolvedValue(undefined)}
        onRegenerateCode={vi.fn().mockResolvedValue(undefined)}
        onDeleteGroup={vi.fn()}
        onLeaveGroup={vi.fn()}
      />,
    )

    expect(screen.getByText(/Only the group owner \(Alice\) can change privacy\./i)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /private group/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /save group info/i })).toBeNull()
  })

  it('allows owner to update group name and description', async () => {
    vi.mocked(updateStudyGroupSettings).mockResolvedValue(undefined)
    const onUpdateGroup = vi.fn()

    render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={true}
        onUpdateGroup={onUpdateGroup}
        onCopyCode={vi.fn().mockResolvedValue(undefined)}
        onRegenerateCode={vi.fn().mockResolvedValue(undefined)}
        onDeleteGroup={vi.fn()}
        onLeaveGroup={vi.fn()}
      />,
    )

    const nameInput = screen.getByLabelText(/group name/i)
    fireEvent.change(nameInput, { target: { value: 'Advanced Biology Study Pod' } })

    const saveBtn = screen.getByRole('button', { name: /save group info/i })
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateStudyGroupSettings).toHaveBeenCalledWith('grp-1', {
        name: 'Advanced Biology Study Pod',
        description: 'Weekly prep and flashcards',
      })
      expect(onUpdateGroup).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Advanced Biology Study Pod' }),
      )
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Group information updated.')
    })
  })

  it('triggers invite code copy and regenerate actions', async () => {
    const handleCopy = vi.fn().mockResolvedValue(undefined)
    const handleRegen = vi.fn().mockResolvedValue(undefined)

    render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={true}
        onUpdateGroup={vi.fn()}
        onCopyCode={handleCopy}
        onRegenerateCode={handleRegen}
        onDeleteGroup={vi.fn()}
        onLeaveGroup={vi.fn()}
      />,
    )

    const copyBtn = screen.getByRole('button', { name: /copy code/i })
    fireEvent.click(copyBtn)
    expect(handleCopy).toHaveBeenCalledTimes(1)

    const regenBtn = screen.getByRole('button', { name: /generate new code/i })
    fireEvent.click(regenBtn)
    expect(handleRegen).toHaveBeenCalledTimes(1)
  })

  it('triggers delete group callback for owner and leave for member', () => {
    const handleDelete = vi.fn()
    const handleLeave = vi.fn()

    const { unmount } = render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={true}
        onUpdateGroup={vi.fn()}
        onCopyCode={vi.fn().mockResolvedValue(undefined)}
        onRegenerateCode={vi.fn().mockResolvedValue(undefined)}
        onDeleteGroup={handleDelete}
        onLeaveGroup={handleLeave}
      />,
    )

    const deleteBtn = screen.getByRole('button', { name: /delete study group/i })
    fireEvent.click(deleteBtn)
    expect(handleDelete).toHaveBeenCalledTimes(1)

    unmount()

    render(
      <StudyGroupSettingsTab
        group={baseGroup}
        isOwner={false}
        onUpdateGroup={vi.fn()}
        onCopyCode={vi.fn().mockResolvedValue(undefined)}
        onRegenerateCode={vi.fn().mockResolvedValue(undefined)}
        onDeleteGroup={handleDelete}
        onLeaveGroup={handleLeave}
      />,
    )

    const leaveBtn = screen.getByRole('button', { name: /leave study group/i })
    fireEvent.click(leaveBtn)
    expect(handleLeave).toHaveBeenCalledTimes(1)
  })
})
