import { useState } from 'react'
import { Copy, Globe, Lock, RefreshCw, Trash2 } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { RadioGroup } from '../../../shared/ui/RadioGroup'
import { Textarea } from '../../../shared/ui/Textarea'
import { useToast } from '../../../shared/ui/useToast'
import { updateStudyGroupPrivacy, updateStudyGroupSettings } from '../services'
import type { StudyGroup, StudyGroupPrivacy } from '../types'

interface StudyGroupSettingsTabProps {
  group: StudyGroup
  isOwner: boolean
  onUpdateGroup: (updated: StudyGroup) => void
  onCopyCode: () => Promise<void>
  onRegenerateCode: () => Promise<void>
  onDeleteGroup: () => void
  onLeaveGroup: () => void
}

export function StudyGroupSettingsTab({
  group,
  isOwner,
  onUpdateGroup,
  onCopyCode,
  onRegenerateCode,
  onDeleteGroup,
  onLeaveGroup,
}: StudyGroupSettingsTabProps) {
  const { showToast } = useToast()

  const [privacy, setPrivacy] = useState<StudyGroupPrivacy>(group.privacy)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyError, setPrivacyError] = useState<string | null>(null)

  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const handlePrivacyChange = async (next: StudyGroupPrivacy) => {
    if (!isOwner || next === group.privacy || savingPrivacy) return
    setSavingPrivacy(true)
    setPrivacyError(null)
    try {
      await updateStudyGroupPrivacy(group.id, next)
      setPrivacy(next)
      onUpdateGroup({ ...group, privacy: next })
      showToast('success', `Study group is now ${next}.`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update privacy.'
      setPrivacyError(msg)
      showToast('error', msg)
      setPrivacy(group.privacy)
    } finally {
      setSavingPrivacy(false)
    }
  }

  const handleSaveDetails = async () => {
    if (!isOwner || !name.trim() || savingDetails) return
    setSavingDetails(true)
    setDetailsError(null)
    try {
      await updateStudyGroupSettings(group.id, {
        name: name.trim(),
        description: description.trim(),
      })
      onUpdateGroup({
        ...group,
        name: name.trim(),
        description: description.trim(),
      })
      showToast('success', 'Group information updated.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save group information.'
      setDetailsError(msg)
      showToast('error', msg)
    } finally {
      setSavingDetails(false)
    }
  }

  const detailsChanged =
    name.trim() !== group.name || (description.trim() !== (group.description || ''))

  return (
    <div className="grid gap-6">
      {/* Privacy Settings Card */}
      <section className="rounded-3xl border border-navy-900-15 bg-white p-4 sm:p-6 shadow-sm grid gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900-10 text-navy-900 mt-0.5">
            {group.privacy === 'public' ? (
              <Globe size={20} aria-hidden="true" />
            ) : (
              <Lock size={20} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-lg font-bold text-navy-900">Group Privacy</h3>
            <p className="m-0 text-xs sm:text-sm text-navy-900-72 mt-0.5">
              Choose whether learners can discover this study group in the directory or only join via invite code.
            </p>
          </div>
        </div>

        {privacyError && <Alert tone="error" label="Error">{privacyError}</Alert>}

        {isOwner ? (
          <div className="grid gap-3 pt-1">
            <RadioGroup
              label="Select group privacy"
              name="group-privacy-radio"
              value={privacy}
              onChange={(val) => void handlePrivacyChange(val as StudyGroupPrivacy)}
              disabled={savingPrivacy}
              options={[
                {
                  value: 'public',
                  label: 'Public group',
                  hint: 'Listed in the public study groups directory. Any signed-in learner can discover and join.',
                },
                {
                  value: 'private',
                  label: 'Private group',
                  hint: 'Hidden from the public directory. Only learners with your 6-character invite code can discover and join.',
                },
              ]}
            />
            {savingPrivacy && (
              <p className="m-0 text-xs text-navy-900-72 italic">Saving privacy setting…</p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-navy-900-10 bg-navy-900-05 p-3.5 text-sm text-navy-900">
            This is a <strong>{group.privacy === 'public' ? 'Public group' : 'Private group'}</strong>. Only the group owner ({group.ownerDisplayName}) can change privacy.
          </div>
        )}
      </section>

      {/* Group Info (Owner only) */}
      {isOwner && (
        <section className="rounded-3xl border border-navy-900-15 bg-white p-4 sm:p-6 shadow-sm grid gap-4">
          <div>
            <h3 className="m-0 text-lg font-bold text-navy-900">Group Information</h3>
            <p className="m-0 text-xs sm:text-sm text-navy-900-72 mt-0.5">
              Update the name and description shown to group members and directory browsers.
            </p>
          </div>

          {detailsError && <Alert tone="error" label="Error">{detailsError}</Alert>}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSaveDetails()
            }}
            className="grid gap-4"
          >
            <Input
              label="Group name"
              name="settings-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
            />

            <Textarea
              label="Description (optional)"
              name="settings-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group studying? When do you meet?"
              maxLength={300}
              rows={3}
            />

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                variant="primary"
                disabled={savingDetails || !name.trim() || !detailsChanged}
                className="min-h-11 w-full sm:w-auto"
              >
                {savingDetails ? 'Saving…' : 'Save group info'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Invite Code Management */}
      <section className="rounded-3xl border border-navy-900-15 bg-white p-4 sm:p-6 shadow-sm grid gap-4">
        <div>
          <h3 className="m-0 text-lg font-bold text-navy-900">Invite Code</h3>
          <p className="m-0 text-xs sm:text-sm text-navy-900-72 mt-0.5">
            Share this 6-character code with classmates to invite them into the study group.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-2xl border border-navy-900-15 bg-navy-900-05 p-4">
          <div>
            <span className="text-xs uppercase font-semibold text-navy-900-72 tracking-wider">Active code</span>
            <div className="text-2xl sm:text-3xl font-mono font-bold text-navy-900 tracking-widest mt-1">
              {group.inviteCode}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => void onCopyCode()}
              className="min-h-11 flex-1 sm:flex-none justify-center"
            >
              <Copy size={16} aria-hidden="true" />
              Copy code
            </Button>
            {isOwner && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onRegenerateCode()}
                className="min-h-11 flex-1 sm:flex-none justify-center"
              >
                <RefreshCw size={16} aria-hidden="true" />
                Generate new code
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-3xl border border-red-500/20 bg-white p-4 sm:p-6 shadow-sm grid gap-4">
        <div>
          <h3 className="m-0 text-lg font-bold text-red-600">Danger Zone</h3>
          <p className="m-0 text-xs sm:text-sm text-navy-900-72 mt-0.5">
            {isOwner
              ? 'Irreversible actions for this study group.'
              : 'Leave the study group and surrender access.'}
          </p>
        </div>

        {isOwner ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-red-500/15 bg-red-50/50 p-4">
            <div>
              <strong className="text-sm font-semibold text-navy-900 block">Delete this study group</strong>
              <span className="text-xs text-navy-900-72">
                Permanently deletes the group, all shared snapshot items, and group activity history.
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onDeleteGroup}
              className="min-h-11 text-red-600 border-red-500/30 hover:bg-red-50 shrink-0 w-full sm:w-auto"
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete study group
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-red-500/15 bg-red-50/50 p-4">
            <div>
              <strong className="text-sm font-semibold text-navy-900 block">Leave study group</strong>
              <span className="text-xs text-navy-900-72">
                You will lose access to all shared materials in this group.
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={onLeaveGroup}
              className="min-h-11 text-red-600 border-red-500/30 hover:bg-red-50 shrink-0 w-full sm:w-auto"
            >
              Leave study group
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
