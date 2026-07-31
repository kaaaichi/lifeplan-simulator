// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { HousingSection } from './HousingSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('HousingSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('shows rent fields for 賃貸 and hides loan fields', () => {
    render(<HousingSection />)
    expect(screen.getByLabelText('家賃(月)')).toBeInTheDocument()
    expect(screen.queryByLabelText('ローン返済(月)')).not.toBeInTheDocument()
  })

  it('switches to 持ち家 and shows owner fields', async () => {
    const user = userEvent.setup()
    render(<HousingSection />)

    await user.selectOptions(screen.getByLabelText('住居タイプ'), '持ち家')

    expect(useDraftStore.getState().draft?.housing.type).toBe('持ち家')
    expect(screen.getByLabelText('ローン返済(月)')).toBeInTheDocument()
    expect(screen.getByLabelText('固定資産税(年)')).toBeInTheDocument()
    expect(screen.queryByLabelText('家賃(月)')).not.toBeInTheDocument()
  })

  it('edits the rent into the draft', async () => {
    const user = userEvent.setup()
    render(<HousingSection />)

    const rent = screen.getByLabelText('家賃(月)')
    await user.clear(rent)
    await user.type(rent, '180000')

    expect(useDraftStore.getState().draft?.housing.rentMonthly).toBe(180_000)
  })
})
