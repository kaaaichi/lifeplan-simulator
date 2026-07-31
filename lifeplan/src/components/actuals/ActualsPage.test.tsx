// lifeplan/src/components/actuals/ActualsPage.test.tsx
// @vitest-environment jsdom
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { ActualsPage } from './ActualsPage'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../store/householdStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { setActual, captureBaseline } from '../../persistence/actualsOps'

async function setup(opts?: { withActual?: boolean; withBaseline?: boolean }) {
  const repository = new InMemoryHouseholdRepository()
  let doc = createDefaultDoc()
  if (opts?.withActual) {
    doc = fromDoc(toDoc(setActual(doc, { year: doc.baseYear, cashBalance: 1_000_000, investmentBalance: 2_000_000 })))
  }
  if (opts?.withBaseline) {
    doc = fromDoc(toDoc(captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' })))
  }
  await repository.save(HOUSEHOLD_ID, doc)
  await useHouseholdStore.getState().load(repository)
  return { repository, doc: useHouseholdStore.getState().doc! }
}

describe('ActualsPage', () => {
  it('shows the baseline capture prompt when nothing recorded yet', async () => {
    await setup()
    render(<ActualsPage />)
    expect(
      screen.getByText('まだ記録されていません。現在の入力内容を当初プランとして凍結します。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '当初プランとして記録する' })).toBeInTheDocument()
  })

  it('adds a new year via the year picker', async () => {
    const user = userEvent.setup()
    const { doc } = await setup()
    render(<ActualsPage />)

    await user.selectOptions(screen.getByLabelText('追加する年'), String(doc.baseYear))
    await user.click(screen.getByRole('button', { name: '年を追加' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals).toHaveLength(1))
    expect(screen.getByRole('listitem', { name: `${doc.baseYear + 1}年始` })).toBeInTheDocument()
  })

  it('edits cash balance for a recorded year', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear + 1}年始` })
    const cashInput = within(row).getByLabelText('現金残高')
    await user.clear(cashInput)
    await user.type(cashInput, '3000000')

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals[0]?.cashBalance).toBe(3_000_000))
  })

  it('deletes a recorded year', async () => {
    const user = userEvent.setup()
    const { doc } = await setup({ withActual: true })
    render(<ActualsPage />)

    const row = screen.getByRole('listitem', { name: `${doc.baseYear + 1}年始` })
    await user.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals).toHaveLength(0))
  })

  it('captures a baseline and then offers recapture', async () => {
    const user = userEvent.setup()
    await setup()
    render(<ActualsPage />)

    await user.click(screen.getByRole('button', { name: '当初プランとして記録する' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.baseline).toBeDefined())
    expect(screen.getByRole('button', { name: '再ベースライン' })).toBeInTheDocument()
  })

  it('recaptures a baseline only after two-step confirmation', async () => {
    const user = userEvent.setup()
    await setup({ withBaseline: true })
    render(<ActualsPage />)

    await user.click(screen.getByRole('button', { name: '再ベースライン' }))
    expect(
      screen.getByText('現在の入力内容で当初プランを上書きします。よろしいですか？'),
    ).toBeInTheDocument()
    // 1段階目ではまだ上書きされない
    expect(useHouseholdStore.getState().doc?.baseline?.capturedAt).toBe('2026-01-01T00:00:00.000Z')

    await user.click(screen.getByRole('button', { name: '上書きする' }))
    await waitFor(() =>
      expect(useHouseholdStore.getState().doc?.baseline?.capturedAt).not.toBe('2026-01-01T00:00:00.000Z'),
    )
  })

  it('allows recording a year before baseYear as a reference-only actual (§16.9)', async () => {
    const user = userEvent.setup()
    const { doc } = await setup()
    render(<ActualsPage />)

    const priorYear = doc.baseYear - 2
    await user.selectOptions(screen.getByLabelText('追加する年'), String(priorYear))
    await user.click(screen.getByRole('button', { name: '年を追加' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.actuals).toHaveLength(1))
    expect(screen.getByRole('listitem', { name: `${priorYear + 1}年始` })).toBeInTheDocument()
  })
})
