import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningCanvasToolbar, type AutosaveStatus } from './LearningCanvasToolbar'

function renderToolbar(autosaveStatus: AutosaveStatus, overrides: Partial<Parameters<typeof LearningCanvasToolbar>[0]> = {}) {
  const onSaveNow = vi.fn()
  render(
    <LearningCanvasToolbar
      autosaveStatus={autosaveStatus}
      snapToGrid={false}
      canUndo={false}
      canRedo={false}
      isOutlineOpen={false}
      searchQuery=""
      searchMatchCount={0}
      searchMatchIndex={0}
      onToggleSnapToGrid={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onToggleOutline={vi.fn()}
      onSearchChange={vi.fn()}
      onSearchNext={vi.fn()}
      onSearchPrev={vi.fn()}
      onAddCard={vi.fn()}
      onExport={vi.fn()}
      onImportFile={vi.fn()}
      onOpenHelp={vi.fn()}
      onSaveNow={onSaveNow}
      {...overrides}
    />,
  )
  return { onSaveNow }
}

const saveButton = () => screen.getByRole('button', { name: 'Save canvas' }) as HTMLButtonElement

describe('LearningCanvasToolbar save button', () => {
  it('saves immediately when there are unsaved changes', () => {
    const { onSaveNow } = renderToolbar('unsaved')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    expect(onSaveNow).toHaveBeenCalledTimes(1)
  })

  it('is disabled when everything is already saved', () => {
    renderToolbar('saved')
    expect(saveButton().disabled).toBe(true)
  })

  it('stays clickable while a save is running so it can queue a flush instead of fighting autosave', () => {
    const { onSaveNow } = renderToolbar('saving')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    expect(onSaveNow).toHaveBeenCalledTimes(1)
  })

  it('stays available after a failed save so it can be retried', () => {
    const { onSaveNow } = renderToolbar('error')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())
    expect(onSaveNow).toHaveBeenCalledTimes(1)
  })

  it('is not shown on read-only boards', () => {
    renderToolbar('unsaved', { readOnly: true })
    expect(screen.queryByRole('button', { name: 'Save canvas' })).toBeNull()
  })
})
