// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AssetsSection } from './AssetsSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AssetsSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits an existing bank balance into the draft', async () => {
    const user = userEvent.setup()
    render(<AssetsSection />)

    const banks = screen.getByRole('group', { name: '銀行口座' })
    const balance = within(banks).getByLabelText('残高')
    await user.clear(balance)
    await user.type(balance, '5000000')

    expect(useDraftStore.getState().draft?.assets.bankAccounts[0]?.balance).toBe(5_000_000)
  })

  it('adds and removes an investment account', async () => {
    const user = userEvent.setup()
    render(<AssetsSection />)

    const investments = screen.getByRole('group', { name: '投資口座' })
    await user.click(within(investments).getByRole('button', { name: '追加' }))
    expect(useDraftStore.getState().draft?.assets.investments).toHaveLength(2)

    await user.click(within(investments).getAllByRole('button', { name: '削除' })[1]!)
    expect(useDraftStore.getState().draft?.assets.investments).toHaveLength(1)
  })
})
