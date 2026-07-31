// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { App } from './App'
import { useHouseholdStore, HOUSEHOLD_ID } from './store/householdStore'
import { useDraftStore } from './store/draftStore'
import { InMemoryHouseholdRepository } from './persistence/repository'
import { createDefaultDoc, toDoc, fromDoc } from './persistence/doc'
import { duplicateScenario } from './persistence/scenarioOps'

describe('InputPage integration', () => {
  let repository: InMemoryHouseholdRepository
  // C1 テストが load を差し替えるため、beforeEach で元の実装に戻して他テストへの漏れを防ぐ
  const originalLoad = useHouseholdStore.getState().load

  beforeEach(() => {
    window.history.pushState({}, '', '/input')
    // 毎テスト新しい repository を注入して独立させる(Layout が state.repository を load に渡す)
    repository = new InMemoryHouseholdRepository()
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository, load: originalLoad })
    useDraftStore.setState({ scenarioId: null, draft: null, dirty: false, saveError: null })
  })

  it('bootstraps via the injected repository (Layout passes state.repository to load)', async () => {
    render(<App />)

    await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    expect(useHouseholdStore.getState().repository).toBe(repository)
    expect(await repository.load(HOUSEHOLD_ID)).not.toBeNull() // seed が注入先に書かれている
  })

  it('edits, previews, saves, and reflects on the dashboard', async () => {
    const user = userEvent.setup()
    render(<App />)

    // ドラフトが張られてフォームが出る(手取り年収は世帯主/配偶者で重複するため group でスコープ)
    const primary = await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '12000000')

    // プレビューが出ている(debounce 後)
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'プレビュー' })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(
        useHouseholdStore.getState().doc?.scenarios.find((s) => s.id === 'base')?.inputs.members.primary.takeHomeIncome,
      ).toBe(12_000_000),
    )
    expect(useDraftStore.getState().dirty).toBe(false)

    // ダッシュボードへ遷移して表示される(保存済みなので blocker は出ない)
    await user.click(screen.getByRole('link', { name: 'ダッシュボード' }))
    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())
  })

  it('blocks navigation while dirty until confirmed', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)

    const primary = await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '9000000')

    await user.click(screen.getByRole('link', { name: 'ダッシュボード' }))

    // confirm=false → /input に留まる
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('refuses editing when the household store is in error state (C1)', async () => {
    useHouseholdStore.setState({
      status: 'error',
      error: new Error('boom'),
      load: async () => {}, // error 状態を上書きさせない
    })
    render(<App />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('編集できません'))
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
  })

  it('edits the scenario specified by /input/:scenarioId (not the active one)', async () => {
    // base(アクティブ) + second の2本を事前シード
    const base = createDefaultDoc()
    const seeded = fromDoc(toDoc(duplicateScenario(base, 'base', 'second'), { updatedAt: new Date().toISOString() }))
    await repository.save(HOUSEHOLD_ID, seeded)
    window.history.pushState({}, '', '/input/second')

    render(<App />)

    await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    expect(useDraftStore.getState().scenarioId).toBe('second')
    expect(useHouseholdStore.getState().doc?.activeScenarioId).toBe('base') // アクティブは不変
  })

  it('discards the dirty draft when confirming navigation away from /input/:scenarioId (Finding 2)', async () => {
    // base(アクティブ) + second の2本を事前シード
    const base = createDefaultDoc()
    const seeded = fromDoc(toDoc(duplicateScenario(base, 'base', 'second'), { updatedAt: new Date().toISOString() }))
    await repository.save(HOUSEHOLD_ID, seeded)
    window.history.pushState({}, '', '/input/second')

    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)

    const primary = await screen.findByRole('group', { name: '世帯主' }, { timeout: 3000 })
    expect(useDraftStore.getState().scenarioId).toBe('second')
    const income = within(primary).getByLabelText('手取り年収')
    await user.clear(income)
    await user.type(income, '9000000')
    expect(useDraftStore.getState().dirty).toBe(true)

    // 「入力」ナビ(→ /input、アクティブシナリオ編集)へ遷移。confirm=true で通過
    await user.click(screen.getByRole('link', { name: '入力' }))

    // second の dirty ドラフトが生き残らず、アクティブ(base)へ張り直されていること
    await waitFor(() => expect(useDraftStore.getState().dirty).toBe(false))
    expect(useDraftStore.getState().scenarioId).toBe('base')
  })

  it('shows an error (no form) for an unknown scenario id', async () => {
    window.history.pushState({}, '', '/input/nope')

    render(<App />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('シナリオが見つかりません'))
    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'シナリオ管理へ' })).toBeInTheDocument()
  })
})
