// @vitest-environment jsdom
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { ScenariosPage } from './ScenariosPage'
import { useHouseholdStore, HOUSEHOLD_ID } from '../../store/householdStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { createDefaultDoc, toDoc, fromDoc } from '../../persistence/doc'
import { duplicateScenario } from '../../persistence/scenarioOps'

async function setup(opts?: { scenarios?: 1 | 2 }) {
  const repository = new InMemoryHouseholdRepository()
  let doc = createDefaultDoc()
  if ((opts?.scenarios ?? 2) === 2) {
    doc = fromDoc(toDoc(duplicateScenario(doc, 'base', 'second')))
  }
  await repository.save(HOUSEHOLD_ID, doc)
  await useHouseholdStore.getState().load(repository)
  return render(
    <MemoryRouter>
      <ScenariosPage />
    </MemoryRouter>,
  )
}

describe('ScenariosPage', () => {
  it('renders a card per scenario with name, summary and active badge', async () => {
    await setup()

    const baseCard = screen.getByRole('listitem', { name: 'ベースプラン' })
    expect(within(baseCard).getByText('アクティブ')).toBeInTheDocument()
    expect(within(baseCard).getByText('終了年齢時点の総資産')).toBeInTheDocument()
    expect(within(baseCard).getByText('推奨積立額')).toBeInTheDocument()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    expect(within(copyCard).queryByText('アクティブ')).not.toBeInTheDocument()
    expect(within(copyCard).getByRole('link', { name: '編集' })).toHaveAttribute('href', '/input/second')
  })

  it('switches the active scenario', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: 'アクティブにする' }))

    await waitFor(() => expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('second'))
    expect(within(screen.getByRole('listitem', { name: 'ベースプランのコピー' })).getByText('アクティブ')).toBeInTheDocument()
  })

  it('renames inline with confirm, and cancel restores the input', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: '名前変更' }))
    const nameInput = within(copyCard).getByLabelText('シナリオ名')
    await user.clear(nameInput)
    await user.type(nameInput, '強気プラン')
    await user.click(within(copyCard).getByRole('button', { name: '確定' }))

    await waitFor(() =>
      expect(useHouseholdStore.getState().doc?.scenarios.find((s) => s.id === 'second')?.name).toBe('強気プラン'),
    )
    expect(screen.getByRole('listitem', { name: '強気プラン' })).toBeInTheDocument()
  })

  it('deletes only after the two-step confirmation', async () => {
    const user = userEvent.setup()
    await setup()

    const copyCard = screen.getByRole('listitem', { name: 'ベースプランのコピー' })
    await user.click(within(copyCard).getByRole('button', { name: '削除' }))
    // 1段階目では消えない
    expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(2)
    expect(within(copyCard).getByText('削除しますか？')).toBeInTheDocument()

    await user.click(within(copyCard).getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(useHouseholdStore.getState().doc?.scenarios).toHaveLength(1))
    expect(screen.queryByRole('listitem', { name: 'ベースプランのコピー' })).not.toBeInTheDocument()
  })

  it('disables delete when only one scenario remains', async () => {
    await setup({ scenarios: 1 })

    const baseCard = screen.getByRole('listitem', { name: 'ベースプラン' })
    expect(within(baseCard).getByRole('button', { name: '削除' })).toBeDisabled()
  })

  it('duplicates and a new card appears (no navigation)', async () => {
    const user = userEvent.setup()
    await setup({ scenarios: 1 })

    await user.click(screen.getByRole('button', { name: '複製' }))

    await waitFor(() => expect(screen.getByRole('listitem', { name: 'ベースプランのコピー' })).toBeInTheDocument())
    expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('base') // アクティブ不変
  })
})
