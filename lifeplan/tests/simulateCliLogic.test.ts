import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'
import {
  resolveSourceScenarioId,
  validateFinancialEvents,
  mergeFinancialEvents,
  resolveActiveScenarioId,
  formatYearTable,
  convertAdminRawDoc,
} from '../scripts/simulateCli'
import { createDefaultDoc } from '../src/persistence/doc'
import type { FinancialEvent, YearRow } from '../src/types'

describe('resolveSourceScenarioId', () => {
  it('"active" が指定された場合は doc.activeScenarioId を返す', () => {
    const doc = createDefaultDoc()
    expect(resolveSourceScenarioId(doc, 'active')).toBe(doc.activeScenarioId)
  })

  it('"active" 以外はそのまま返す', () => {
    const doc = createDefaultDoc()
    expect(resolveSourceScenarioId(doc, 'some-other-id')).toBe('some-other-id')
  })
})

function makeEvent(overrides: Partial<FinancialEvent> = {}): FinancialEvent {
  return {
    id: 'evt-1',
    label: '育休',
    kind: '収入',
    startYear: 2027,
    endYear: 2028,
    annualAmount: -1_000_000,
    ...overrides,
  }
}

describe('validateFinancialEvents', () => {
  it('startYear <= endYear のイベントは許容する', () => {
    expect(() => validateFinancialEvents([makeEvent({ startYear: 2027, endYear: 2028 })])).not.toThrow()
  })

  it('startYear === endYear のイベントは許容する', () => {
    expect(() => validateFinancialEvents([makeEvent({ startYear: 2027, endYear: 2027 })])).not.toThrow()
  })

  it('endYear: null（無期限継続）のイベントは許容する', () => {
    expect(() => validateFinancialEvents([makeEvent({ startYear: 2027, endYear: null })])).not.toThrow()
  })

  it('startYear > endYear のイベントは弾く', () => {
    expect(() => validateFinancialEvents([makeEvent({ startYear: 2029, endYear: 2028 })])).toThrow(
      /startYear.*endYear/,
    )
  })

  it('複数イベント中1件でも不正なら弾く', () => {
    const events = [
      makeEvent({ id: 'ok', startYear: 2027, endYear: 2028 }),
      makeEvent({ id: 'ng', startYear: 2030, endYear: 2029 }),
    ]
    expect(() => validateFinancialEvents(events)).toThrow(/ng/)
  })

  it('配列でない値はエラーにする', () => {
    expect(() => validateFinancialEvents(null as unknown as FinancialEvent[])).toThrow()
    expect(() => validateFinancialEvents({} as unknown as FinancialEvent[])).toThrow()
  })

  it('kindが"収入"/"支出"以外の値はエラーにする', () => {
    const invalid = { ...makeEvent(), kind: '謎' } as unknown as FinancialEvent
    expect(() => validateFinancialEvents([invalid])).toThrow(/kind/)
  })

  it('kindが欠けている場合もエラーにする', () => {
    const event = makeEvent() as Partial<FinancialEvent>
    delete event.kind
    expect(() => validateFinancialEvents([event as FinancialEvent])).toThrow(/kind/)
  })
})

describe('mergeFinancialEvents', () => {
  it('既存イベントが未定義の場合は追加分だけになる', () => {
    const additional = [makeEvent({ id: 'new-1' })]
    expect(mergeFinancialEvents(undefined, additional)).toEqual(additional)
  })

  it('既存イベントを保持したまま追加分をconcatする（既存が先、追加が後）', () => {
    const existing = [makeEvent({ id: 'existing-1' })]
    const additional = [makeEvent({ id: 'new-1' })]
    const merged = mergeFinancialEvents(existing, additional)
    expect(merged.map((e) => e.id)).toEqual(['existing-1', 'new-1'])
    // 元の配列を破壊していない
    expect(existing).toHaveLength(1)
  })

  it('追加分が空でも既存はそのまま保持される', () => {
    const existing = [makeEvent({ id: 'existing-1' })]
    expect(mergeFinancialEvents(existing, [])).toEqual(existing)
  })
})

describe('resolveActiveScenarioId', () => {
  it('save かつ activate のときのみ新シナリオIDに切り替える', () => {
    expect(resolveActiveScenarioId('base', 'new-id', true, true)).toBe('new-id')
  })

  it('save のみ（activate なし）では変更しない', () => {
    expect(resolveActiveScenarioId('base', 'new-id', true, false)).toBe('base')
  })

  it('activate のみ（save なし）では変更しない', () => {
    expect(resolveActiveScenarioId('base', 'new-id', false, true)).toBe('base')
  })

  it('どちらも指定なしでは変更しない', () => {
    expect(resolveActiveScenarioId('base', 'new-id', false, false)).toBe('base')
  })
})

describe('formatYearTable', () => {
  const rows: YearRow[] = [
    {
      year: 2027,
      agePrimary: 40,
      ageSpouse: 38,
      agesChildren: [10],
      income: 6_000_000,
      expenses: {
        食費: 0, 日用品: 0, ライフライン: 0, 住宅: 0, 教育費: 0, 家電: 0, 住宅大型: 0,
        こづかい: 0, 衣服: 0, 医療: 0, 外食レジャー: 0, 雑費: 0, 車: 0, 保育料: 0,
      },
      totalExpense: 4_000_000,
      annualCashFlow: 2_000_000,
      investmentContribution: 500_000,
      investmentReturn: 100_000,
      investmentBalance: 10_000_000,
      cashBalance: 3_000_000,
      totalAssets: 13_000_000,
      investmentRatio: 0.77,
      coastFireNumber: 0,
      isActual: false,
    },
  ]

  it('西暦/単年度収入/単年度支出/単年度収支/年始総資産の日本語列見出しを含む（フローとストックの区別を明示するため）', () => {
    const table = formatYearTable(rows)
    expect(table).toContain('西暦')
    expect(table).toContain('単年度収入')
    expect(table).toContain('単年度支出')
    expect(table).toContain('単年度収支')
    expect(table).toContain('年始総資産')
    expect(table).toContain('2027')
  })

  it('単年度収入・単年度支出・単年度収支がその年中のフロー、年始総資産がその年始時点のストックであることを示す注記を含む（ダッシュボードのAnnualTableと同じ「残高は年始・フローは当年」という見せ方に揃える）', () => {
    const table = formatYearTable(rows)
    expect(table).toContain('単年度収入・単年度支出・単年度収支はその年中の実績')
    expect(table).toContain('年始総資産はその年始時点（前年12月末と同じ値）の残高')
  })

  it('複数行を改行で連結して出力する', () => {
    const rows2: YearRow[] = [rows[0]!, { ...rows[0]!, year: 2028 }]
    const table = formatYearTable(rows2)
    const lines = table.split('\n')
    // ヘッダー + 区切り線 + 2データ行 = 4行以上
    expect(lines.length).toBeGreaterThanOrEqual(4)
    expect(table).toContain('2028')
  })
})

describe('convertAdminRawDoc', () => {
  it('updatedAt が Timestamp ならISO文字列に変換する', () => {
    const ts = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
    const raw = { schemaVersion: 1, updatedAt: ts, baseYear: 2026 }
    const result = convertAdminRawDoc(raw) as Record<string, unknown>
    expect(result.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(result.baseYear).toBe(2026)
  })

  it('updatedAt が無ければそのまま返す', () => {
    const raw = { schemaVersion: 1, baseYear: 2026 }
    const result = convertAdminRawDoc(raw) as Record<string, unknown>
    expect(result).toEqual(raw)
  })
})
