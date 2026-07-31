// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { App } from './App'
import { useHouseholdStore, defaultRepository } from './store/householdStore'
import { useMarketDataStore } from './store/marketDataStore'

describe('App', () => {
  // Dashboard は RealAssetValueCard 経由でマウント時に本物の fetch(市場データ取得)を呼び出す。
  // ユニットテストでは実ネットワークに触れないよう fetch を失敗するダミーに差し替える
  // (Dashboard.test.tsx / RealAssetValueCard.test.tsx と同じ流儀)。
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in App.integration.test.tsx')))
    useMarketDataStore.setState({ usdJpy: { status: 'loading' }, cape: { status: 'loading' } })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('bootstraps the default household and renders the dashboard', async () => {
    render(<App />)

    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '家計の羅針盤' })).toBeInTheDocument()
  })

  it('navigates to the input page via the header link', async () => {
    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByText('現在の総資産')).toBeInTheDocument())

    await user.click(screen.getByRole('link', { name: '入力' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: '入力' })).toBeInTheDocument())
  })
})
