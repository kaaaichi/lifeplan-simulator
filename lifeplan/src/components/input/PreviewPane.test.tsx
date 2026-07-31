// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { PreviewPane } from './PreviewPane'
import { useDraftStore } from '../../store/draftStore'
import { useHouseholdStore, defaultRepository } from '../../store/householdStore'
import { defaultInputs } from '../../persistence/placeholderHousehold'

describe('PreviewPane', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ doc: null, status: 'loading', error: null, repository: defaultRepository })
    useDraftStore.getState().beginEdit('base', structuredClone(defaultInputs))
  })

  it('renders preview KPIs and the chart for the draft', async () => {
    render(<PreviewPane />)

    await waitFor(() => expect(screen.getByText('終了年齢時点の総資産')).toBeInTheDocument())
    expect(screen.getByText('推奨毎月積立額')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'プレビュー' })).toBeInTheDocument()
  })

  it('falls back gracefully when the simulation cannot run', async () => {
    // endAge を現在年齢未満に細工 → simulate が空系列 → セレクタ throw → boundary が受ける
    const broken = structuredClone(defaultInputs)
    broken.assumptions.endAge = 10
    useDraftStore.getState().beginEdit('base', broken)

    render(<PreviewPane />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('この設定ではシミュレーションできません'))
  })
})
