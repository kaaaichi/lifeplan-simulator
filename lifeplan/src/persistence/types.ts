import type { Inputs, Actual } from '../types'
import type { Baseline } from '../engine/baseline'

export const CURRENT_SCHEMA_VERSION = 3

export interface Scenario {
  id: string
  name: string
  inputs: Inputs
}

export interface HouseholdDoc {
  schemaVersion: number
  baseYear: number
  activeScenarioId: string
  scenarios: Scenario[]
  actuals: Actual[]
  baseline?: Baseline
  updatedAt?: string
}

export type HouseholdContent = Omit<HouseholdDoc, 'schemaVersion' | 'updatedAt'>
