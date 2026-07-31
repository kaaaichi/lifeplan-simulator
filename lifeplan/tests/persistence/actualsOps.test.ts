import { describe, it, expect } from 'vitest'
import type { HouseholdDoc } from '../../src/persistence/types'
import { createDefaultDoc, toDoc, fromDoc } from '../../src/persistence/doc'
import { setActual, deleteActual, captureBaseline, recaptureBaseline } from '../../src/persistence/actualsOps'
import { captureBaseline as engineCaptureBaseline } from '../../src/engine/baseline'
import { lifeplanMaster } from '../../src/masterData'

function docWithActual(year: number, cashBalance: number, investmentBalance: number): HouseholdDoc {
  const base = createDefaultDoc()
  return fromDoc(toDoc(setActual(base, { year, cashBalance, investmentBalance })))
}

describe('setActual', () => {
  it('adds a new year and keeps ascending order regardless of insertion order', () => {
    const doc = createDefaultDoc()
    const withLater = fromDoc(toDoc(setActual(doc, { year: doc.baseYear + 1, cashBalance: 100, investmentBalance: 200 })))
    const content = setActual(withLater, { year: doc.baseYear, cashBalance: 50, investmentBalance: 60 })
    expect(content.actuals.map((a) => a.year)).toEqual([doc.baseYear, doc.baseYear + 1])
  })

  it('overwrites an existing year in place (no duplicate entries)', () => {
    const doc = docWithActual(2026, 100, 200)
    const content = setActual(doc, { year: 2026, cashBalance: 999, investmentBalance: 888 })
    expect(content.actuals).toEqual([{ year: 2026, cashBalance: 999, investmentBalance: 888 }])
  })

  it('preserves an optional note', () => {
    const doc = createDefaultDoc()
    const content = setActual(doc, { year: doc.baseYear, cashBalance: 100, investmentBalance: 200, note: 'メモ' })
    expect(content.actuals[0]!.note).toBe('メモ')
  })
})

describe('deleteActual', () => {
  it('removes the given year', () => {
    const doc = docWithActual(2026, 100, 200)
    const content = deleteActual(doc, 2026)
    expect(content.actuals).toEqual([])
  })

  it('throws on unknown year', () => {
    const doc = createDefaultDoc()
    expect(() => deleteActual(doc, 2026)).toThrow('実績が見つかりません')
  })
})

describe('captureBaseline', () => {
  it('freezes the active scenario simulate() output with the given capturedAt', () => {
    const doc = createDefaultDoc()
    const content = captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' })
    const expected = engineCaptureBaseline(doc.scenarios[0]!.inputs, lifeplanMaster, {
      capturedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(content.baseline).toEqual(expected)
  })

  it('throws if a baseline already exists', () => {
    const captured = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    expect(() => captureBaseline(captured, { capturedAt: '2026-02-01T00:00:00.000Z' })).toThrow('既に記録')
  })
})

describe('recaptureBaseline', () => {
  it('throws if no baseline exists yet', () => {
    expect(() =>
      recaptureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' }),
    ).toThrow('まだ記録されていません')
  })

  it('overwrites an existing baseline with a fresh capturedAt', () => {
    const captured = fromDoc(toDoc(captureBaseline(createDefaultDoc(), { capturedAt: '2026-01-01T00:00:00.000Z' })))
    const content = recaptureBaseline(captured, { capturedAt: '2026-03-01T00:00:00.000Z' })
    expect(content.baseline!.capturedAt).toBe('2026-03-01T00:00:00.000Z')
  })
})

describe('all ops', () => {
  it('outputs pass fromDoc(toDoc(...)) (§16.3)', () => {
    const doc = createDefaultDoc()
    for (const content of [
      setActual(doc, { year: doc.baseYear, cashBalance: 100, investmentBalance: 200 }),
      captureBaseline(doc, { capturedAt: '2026-01-01T00:00:00.000Z' }),
    ]) {
      expect(() => fromDoc(toDoc(content))).not.toThrow()
    }
  })
})
