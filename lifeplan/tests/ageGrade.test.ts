import { describe, it, expect } from 'vitest'
import { ageAt, gradeIndexAt } from '../src/engine/ageGrade'

describe('ageAt', () => {
  it('2024年7月生まれは2026年4月時点で1歳', () => {
    expect(ageAt(2024, 7, 2026)).toBe(1)
  })
})

describe('gradeIndexAt', () => {
  // 第一子 2024年生まれは CSV で 2025=0才児(idx0), 2031=公立小1(idx6)
  it('2024年生まれは2025年度に0才児(index 0)', () => {
    expect(gradeIndexAt(2024, 7, 2025)).toBe(0)
  })
  it('2024年生まれは2031年度に小1(index 6)', () => {
    expect(gradeIndexAt(2024, 7, 2031)).toBe(6)
  })
  it('大学卒業後(大5相当)は範囲外 -1', () => {
    expect(gradeIndexAt(2024, 7, 2050)).toBe(-1)
  })
  it('早生まれ2024/1生は2025年度に1才児(index 1)', () => {
    expect(gradeIndexAt(2024, 1, 2025)).toBe(1)
  })
  it('早生まれ2024/1生は2030年度に小1(index 6)', () => {
    expect(gradeIndexAt(2024, 1, 2030)).toBe(6)
  })
})
