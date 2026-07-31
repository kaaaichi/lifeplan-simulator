// src/masterData/index.ts
import { utilities } from './utilities'
import { pension } from './pension'
import { educationMaster } from './education'
import type { MasterData } from '../types'

export const lifeplanMaster: MasterData = {
  education: educationMaster, utilities, pension,
}
export * from './utilities'
export * from './pension'
export * from './education'
export * from './nursery'
