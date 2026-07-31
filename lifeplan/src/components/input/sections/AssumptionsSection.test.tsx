// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { AssumptionsSection } from './AssumptionsSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('AssumptionsSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('edits the central return rate into the draft', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    const rate = screen.getByLabelText('利回り(中央)')
    await user.clear(rate)
    await user.type(rate, '4.5')

    expect(useDraftStore.getState().draft?.assumptions.investmentReturnRate).toBe(4.5)
  })

  it('rejects an endAge at or below the primary age at baseYear', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    // placeholder: baseYear 2026, primary birthYear 1990 → 現在年齢 36 → min 37
    const endAge = screen.getByLabelText('終了年齢')
    await user.clear(endAge)
    await user.type(endAge, '36')

    expect(screen.getByRole('alert')).toHaveTextContent('37以上')
    expect(useDraftStore.getState().draft?.assumptions.endAge).toBe(95)
  })

  it('clears coastFireTargetAmount when the override is unchecked', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE目標額を上書きする' }))

    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAmount).toBeUndefined()
  })

  it('sets coastFireTargetAge when the override checkbox is checked, and edits it', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAge).toBeUndefined()
    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE目標年齢を上書きする' }))
    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAge).toBe(65)

    const ageField = screen.getByLabelText('コーストFIRE目標年齢')
    await user.clear(ageField)
    await user.type(ageField, '70')
    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAge).toBe(70)

    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE目標年齢を上書きする' }))
    expect(useDraftStore.getState().draft?.assumptions.coastFireTargetAge).toBeUndefined()
  })

  it('sets coastFireReturnRate when the override checkbox is checked, and edits it', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    expect(useDraftStore.getState().draft?.assumptions.coastFireReturnRate).toBeUndefined()
    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE想定利回りを上書きする' }))
    expect(useDraftStore.getState().draft?.assumptions.coastFireReturnRate).toBe(4)

    const rateField = screen.getByLabelText('コーストFIRE想定利回り')
    await user.clear(rateField)
    await user.type(rateField, '3.5')
    expect(useDraftStore.getState().draft?.assumptions.coastFireReturnRate).toBe(3.5)

    await user.click(screen.getByRole('checkbox', { name: 'コーストFIRE想定利回りを上書きする' }))
    expect(useDraftStore.getState().draft?.assumptions.coastFireReturnRate).toBeUndefined()
  })

  it('adds a one-time investment row', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    await user.click(screen.getByRole('button', { name: 'スポット投資を追加' }))

    expect(useDraftStore.getState().draft?.assumptions.oneTimeInvestments).toHaveLength(1)
  })

  it('clamps pensionStartAge and primary workUntilAge when endAge is lowered below them', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    // placeholder defaults: pensionStartAge 65, primary workUntilAge 65, endAge 95
    const endAge = screen.getByLabelText('終了年齢')
    await user.clear(endAge)
    await user.type(endAge, '60')

    const draft = useDraftStore.getState().draft
    expect(draft?.assumptions.endAge).toBe(60)
    expect(draft?.assumptions.pensionStartAge).toBe(60)
    expect(draft?.members.primary.workUntilAge).toBe(60)
  })

  it('also clamps spouse workUntilAge when endAge is lowered', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    // placeholder has a spouse with workUntilAge 65
    const endAge = screen.getByLabelText('終了年齢')
    await user.clear(endAge)
    await user.type(endAge, '60')

    expect(useDraftStore.getState().draft?.members.spouse?.workUntilAge).toBe(60)
  })

  it('gives each one-time investment row a unique label', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    await user.click(screen.getByRole('button', { name: 'スポット投資を追加' }))
    await user.click(screen.getByRole('button', { name: 'スポット投資を追加' }))

    const yearField1 = screen.getByLabelText('年（1）')
    const yearField2 = screen.getByLabelText('年（2）')
    expect(yearField1).toBeInTheDocument()
    expect(yearField2).toBeInTheDocument()

    await user.clear(yearField2)
    await user.type(yearField2, '2030')

    expect(useDraftStore.getState().draft?.assumptions.oneTimeInvestments?.[1]?.year).toBe(2030)
  })

  it('edits emergencyFundCash into the draft', async () => {
    const user = userEvent.setup()
    render(<AssumptionsSection />)

    const field = screen.getByLabelText('生活防衛資金')
    await user.clear(field)
    await user.type(field, '1500000')

    expect(useDraftStore.getState().draft?.assumptions.emergencyFundCash).toBe(1_500_000)
  })
})
