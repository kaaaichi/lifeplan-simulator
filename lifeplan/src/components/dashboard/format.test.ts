import { describe, it, expect } from 'vitest'
import { formatYenCompact, yAxisWidth, groupEventMarkersByYear } from './format'
import type { EventMarker } from '../../store/selectors'

describe('formatYenCompact', () => {
  it('formats 0 as "0"', () => {
    expect(formatYenCompact(0)).toBe('0')
  })

  it('formats values under 1億 in 万円 with grouping', () => {
    expect(formatYenCompact(5_000_000)).toBe('500万')
    expect(formatYenCompact(48_923_000)).toBe('4,892万')
    expect(formatYenCompact(99_000_000)).toBe('9,900万')
  })

  it('rounds sub-万 values to the nearest 万', () => {
    expect(formatYenCompact(1_234_567)).toBe('123万')
  })

  it('collapses values that round to 0万 into "0"', () => {
    expect(formatYenCompact(4_000)).toBe('0')
  })

  it('formats 億-scale values with one decimal, trimming trailing .0', () => {
    expect(formatYenCompact(123_000_000)).toBe('1.2億')
    expect(formatYenCompact(200_000_000)).toBe('2億')
    expect(formatYenCompact(150_000_000)).toBe('1.5億')
  })

  it('drops the decimal at 10億 and above', () => {
    expect(formatYenCompact(1_234_000_000)).toBe('12億')
    expect(formatYenCompact(12_340_000_000)).toBe('123億')
  })

  it('promotes values that round up to 1億 into 億 notation', () => {
    expect(formatYenCompact(99_996_000)).toBe('1億')
  })

  it('formats negative values with a leading minus', () => {
    expect(formatYenCompact(-3_500_000)).toBe('-350万')
    expect(formatYenCompact(-250_000_000)).toBe('-2.5億')
  })
})

describe('yAxisWidth', () => {
  it('returns a wider axis for longer labels', () => {
    const narrow = yAxisWidth([1_000_000]) // 100万
    const wide = yAxisWidth([98_000_000]) // 9,800万
    expect(wide).toBeGreaterThan(narrow)
  })

  it('accounts for negative values needing a minus sign', () => {
    const positive = yAxisWidth([98_000_000])
    const negative = yAxisWidth([-98_000_000, 98_000_000])
    expect(negative).toBeGreaterThan(positive)
  })

  it('stays within sane bounds', () => {
    expect(yAxisWidth([])).toBeGreaterThanOrEqual(40)
    expect(yAxisWidth([999_999_999_999_999])).toBeLessThanOrEqual(96)
    expect(yAxisWidth([0])).toBeGreaterThanOrEqual(40)
  })

  it('is monotonic even when recharts extends the domain above the data max', () => {
    // 9,800万 → a nice tick of 1億 is SHORTER, so the data-max width must still cover it
    expect(yAxisWidth([98_000_000])).toBeGreaterThanOrEqual(yAxisWidth([100_000_000]))
  })
})

describe('groupEventMarkersByYear', () => {
  it('merges markers that share a year into one entry with labels joined by "/"', () => {
    const markers: EventMarker[] = [
      { year: 2030, label: '家電買い替え', kind: 'appliance' },
      { year: 2030, label: '子の進学/卒業', kind: 'school' },
    ]
    expect(groupEventMarkersByYear(markers)).toEqual([
      { year: 2030, label: '家電買い替え/子の進学/卒業' },
    ])
  })

  it('keeps markers from different years as separate entries', () => {
    const markers: EventMarker[] = [
      { year: 2031, label: '退職', kind: 'retirement' },
      { year: 2030, label: '家電買い替え', kind: 'appliance' },
    ]
    expect(groupEventMarkersByYear(markers)).toEqual([
      { year: 2030, label: '家電買い替え' },
      { year: 2031, label: '退職' },
    ])
  })

  it('drops duplicate labels within the same year', () => {
    const markers: EventMarker[] = [
      { year: 2030, label: '家電買い替え', kind: 'appliance' },
      { year: 2030, label: '家電買い替え', kind: 'appliance' },
    ]
    expect(groupEventMarkersByYear(markers)).toEqual([{ year: 2030, label: '家電買い替え' }])
  })

  it('returns an empty array for no markers', () => {
    expect(groupEventMarkersByYear([])).toEqual([])
  })
})
