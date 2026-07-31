// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MembersSection } from './MembersSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('MembersSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits the primary member income into the draft', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    const primary = screen.getByRole('group', { name: '世帯主' })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '12000000')

    expect(useDraftStore.getState().draft?.members.primary.takeHomeIncome).toBe(12_000_000)
    expect(useDraftStore.getState().dirty).toBe(true)
  })

  it('removes the spouse after confirmation', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MembersSection />)

    await user.click(screen.getByRole('checkbox', { name: '配偶者あり' }))

    expect(useDraftStore.getState().draft?.members.spouse).toBeNull()
  })

  it('keeps the spouse when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MembersSection />)

    await user.click(screen.getByRole('checkbox', { name: '配偶者あり' }))

    expect(useDraftStore.getState().draft?.members.spouse).not.toBeNull()
  })

  it('adds and removes a child', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    await user.click(screen.getByRole('button', { name: '子を追加' }))
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(2)

    const firstChild = screen.getByRole('group', { name: '第一子' })
    await user.click(within(firstChild).getByRole('button', { name: '削除' }))
    expect(useDraftStore.getState().draft?.members.children).toHaveLength(1)
  })

  it('adds a new child with allowanceMonthly undefined (auto mode)', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    await user.click(screen.getByRole('button', { name: '子を追加' }))

    const children = useDraftStore.getState().draft?.members.children
    expect(children).toHaveLength(2)
    expect(children?.[1]?.allowanceMonthly).toBeUndefined()
  })

  it('starts a newly-added child in auto mode with the checkbox checked and no MoneyField shown', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    await user.click(screen.getByRole('button', { name: '子を追加' }))

    const secondChild = screen.getByRole('group', { name: '第2子' })
    const autoCheckbox = within(secondChild).getByRole('checkbox', { name: 'お小遣いを年齢に応じて自動計算する' })
    expect(autoCheckbox).toBeChecked()
    expect(within(secondChild).queryByLabelText('こづかい(月)')).not.toBeInTheDocument()
  })

  it('starts an existing child with an explicit allowanceMonthly in manual mode', () => {
    render(<MembersSection />)

    const firstChild = screen.getByRole('group', { name: '第一子' })
    const autoCheckbox = within(firstChild).getByRole('checkbox', { name: 'お小遣いを年齢に応じて自動計算する' })
    expect(autoCheckbox).not.toBeChecked()
    expect(within(firstChild).getByLabelText('こづかい(月)')).toHaveValue(0)
  })

  it('unchecking the auto checkbox reveals the MoneyField with value 0', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    await user.click(screen.getByRole('button', { name: '子を追加' }))
    const secondChild = screen.getByRole('group', { name: '第2子' })
    const autoCheckbox = within(secondChild).getByRole('checkbox', { name: 'お小遣いを年齢に応じて自動計算する' })

    await user.click(autoCheckbox)

    expect(autoCheckbox).not.toBeChecked()
    const children = useDraftStore.getState().draft?.members.children
    expect(children?.[1]?.allowanceMonthly).toBe(0)
    expect(within(secondChild).getByLabelText('こづかい(月)')).toHaveValue(0)
  })

  it('re-checking the auto checkbox sets allowanceMonthly back to undefined and hides the MoneyField', async () => {
    const user = userEvent.setup()
    render(<MembersSection />)

    const firstChild = screen.getByRole('group', { name: '第一子' })
    const autoCheckbox = within(firstChild).getByRole('checkbox', { name: 'お小遣いを年齢に応じて自動計算する' })
    expect(autoCheckbox).not.toBeChecked()

    await user.click(autoCheckbox)

    expect(autoCheckbox).toBeChecked()
    const children = useDraftStore.getState().draft?.members.children
    expect(children?.[0]?.allowanceMonthly).toBeUndefined()
    expect(within(firstChild).queryByLabelText('こづかい(月)')).not.toBeInTheDocument()
  })
})
