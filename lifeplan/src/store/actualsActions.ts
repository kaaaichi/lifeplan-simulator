// 実績・baseline操作の保存アクション(§16.4)。構造操作(scenarioActions.ts)と同じく即時保存・ドラフト無し。
import type { Actual } from '../types'
import { setActual, deleteActual, captureBaseline, recaptureBaseline } from '../persistence/actualsOps'
import { applyHouseholdOp, type ActionResult } from './applyHouseholdOp'

export type { ActionResult }

export const setActualAction = (actual: Actual): Promise<ActionResult> =>
  applyHouseholdOp((doc) => setActual(doc, actual))

export const deleteActualAction = (year: number): Promise<ActionResult> =>
  applyHouseholdOp((doc) => deleteActual(doc, year))

export const captureBaselineAction = (): Promise<ActionResult> =>
  applyHouseholdOp((doc) => captureBaseline(doc, { capturedAt: new Date().toISOString() }))

export const recaptureBaselineAction = (): Promise<ActionResult> =>
  applyHouseholdOp((doc) => recaptureBaseline(doc, { capturedAt: new Date().toISOString() }))
