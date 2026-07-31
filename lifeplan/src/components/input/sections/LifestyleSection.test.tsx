// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { LifestyleSection } from './LifestyleSection'
import { useDraftStore } from '../../../store/draftStore'
import { defaultInputs } from '../../../persistence/placeholderHousehold'

describe('LifestyleSection', () => {
  beforeEach(() => {
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('switches the electric type into the draft', async () => {
    const user = userEvent.setup()
    render(<LifestyleSection />)

    await user.selectOptions(screen.getByLabelText('電気契約'), 'オール電化')

    expect(useDraftStore.getState().draft?.lifestyle.electricType).toBe('オール電化')
  })

  it('edits the internet cost into the draft', async () => {
    const user = userEvent.setup()
    render(<LifestyleSection />)

    const net = screen.getByLabelText('インターネット(月)')
    await user.clear(net)
    await user.type(net, '5500')

    expect(useDraftStore.getState().draft?.lifestyle.internetMonthly).toBe(5_500)
  })
})
