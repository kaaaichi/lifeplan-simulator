import { describe, it, expect } from 'vitest'
import { captureBaseline } from '../src/engine/baseline'
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { sampleInputs } from './_sampleInputs'

describe('captureBaseline', () => {
  it('実績なし simulate の系列を凍結する', () => {
    const b = captureBaseline(sampleInputs, lifeplanMaster)
    const rows = simulate(sampleInputs, lifeplanMaster)
    expect(b.series.map(p => p.year)).toEqual(rows.map(r => r.year))
    expect(b.series.map(p => p.totalAssets)).toEqual(rows.map(r => r.totalAssets))
    expect(b.series.map(p => p.investmentBalance)).toEqual(rows.map(r => r.investmentBalance))
    expect(b.series.map(p => p.cashBalance)).toEqual(rows.map(r => r.cashBalance))
  })
  it('呼び出し間で不変（決定的）', () => {
    const a = captureBaseline(sampleInputs, lifeplanMaster)
    const b = captureBaseline(sampleInputs, lifeplanMaster)
    expect(a.series).toEqual(b.series)
  })
  it('capturedAt は呼び出し側注入（内部時計を持たない）', () => {
    const b = captureBaseline(sampleInputs, lifeplanMaster, { capturedAt: '2026-12-31' })
    expect(b.capturedAt).toBe('2026-12-31')
  })
})
