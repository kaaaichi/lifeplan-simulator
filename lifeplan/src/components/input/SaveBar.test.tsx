// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SaveBar } from './SaveBar'
import { useDraftStore } from '../../store/draftStore'
import { defaultInputs } from '../../persistence/placeholderHousehold'

describe('SaveBar', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('disables buttons when the draft is clean', () => {
    render(<SaveBar />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '破棄' })).toBeDisabled()
  })

  it('shows the dirty badge and calls save', async () => {
    const user = userEvent.setup()
    useDraftStore.getState().update((prev) => ({ ...prev }))
    const save = vi.fn().mockResolvedValue(true)
    useDraftStore.setState({ save })
    render(<SaveBar />)

    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(save).toHaveBeenCalled()
  })

  it('shows the saveError as an alert', () => {
    useDraftStore.setState({ saveError: 'DocValidationError: ...' })
    render(<SaveBar />)
    expect(screen.getByRole('alert')).toHaveTextContent('DocValidationError')
  })

  it('discards only after confirmation', async () => {
    const user = userEvent.setup()
    useDraftStore.getState().update((prev) => ({ ...prev }))
    const discard = vi.fn()
    useDraftStore.setState({ discard })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SaveBar />)

    await user.click(screen.getByRole('button', { name: '破棄' }))
    expect(discard).toHaveBeenCalled()
  })
})
