// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AppliancesSection } from './AppliancesSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AppliancesSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('adds and removes an appliance', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const appliances = screen.getByRole('group', { name: '家電買い替え' })
    await user.click(within(appliances).getByRole('button', { name: '追加' }))
    expect(useDraftStore.getState().draft?.appliances).toHaveLength(3)

    await user.click(within(appliances).getAllByRole('button', { name: '削除' })[2]!)
    expect(useDraftStore.getState().draft?.appliances).toHaveLength(2)
  })

  it('edits an appliance price into the draft', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const appliances = screen.getByRole('group', { name: '家電買い替え' })
    const price = within(appliances).getAllByLabelText('価格')[0]!
    await user.clear(price)
    await user.type(price, '150000')

    expect(useDraftStore.getState().draft?.appliances[0]?.price).toBe(150_000)
  })

  it('adds a home maintenance item', async () => {
    const user = userEvent.setup()
    render(<AppliancesSection />)

    const home = screen.getByRole('group', { name: '住宅メンテナンス' })
    await user.click(within(home).getByRole('button', { name: '追加' }))

    expect(useDraftStore.getState().draft?.homeMaintenance).toHaveLength(1)
  })
})
