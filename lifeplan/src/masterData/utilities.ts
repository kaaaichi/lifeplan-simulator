// src/masterData/utilities.ts
import type { ElectricType, PhonePlan } from '../types'

const electricGasKei: Record<number, number> = { 1: 67188, 2: 117156, 3: 135552, 4: 142116, 5: 164376 }
const electricAllElectric: Record<number, number> = { 1: 129012, 2: 154848, 3: 173448, 4: 178968, 5: 178968 }
const gasMonthly: Record<number, number> = { 1: 35187, 2: 51426, 3: 61596, 4: 58929, 5: 61905 }

export function electricityAnnual(type: ElectricType, household: number): number {
  const h = Math.min(5, Math.max(1, household))
  return (type === 'オール電化' ? electricAllElectric : electricGasKei)[h]!
}
export function gasAnnual(type: ElectricType, household: number): number {
  if (type === 'オール電化') return 0
  const h = Math.min(5, Math.max(1, household))
  return gasMonthly[h]! * 12
}

export interface UtilitiesMaster {
  phoneMonthly: Record<PhonePlan, number>
  nhkAnnual: number
}
export const utilities: UtilitiesMaster = {
  phoneMonthly: { 大手キャリアスマホ: 7876, 格安simスマホ: 2957, ガラケー: 3071 },
  nhkAnnual: 25000,
}
