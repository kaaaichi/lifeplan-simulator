// src/masterData/realValueScenarios.ts

/** 為替(USD/JPY)ライブ取得失敗時のフォールバック値(2026-07-15時点の分析値) */
export const FALLBACK_USD_JPY_RATE = 162

/** S&P500 Shiller CAPEレシオ ライブ取得失敗時のフォールバック値(2026-07-15時点の分析値) */
export const FALLBACK_CAPE_RATIO = 41

/**
 * 実質資産評価額の反転先シナリオ(静的定数)。分析時点(2026-07)のスナップショットであり、
 * 時間とともに実態と乖離しうる(design.md Risks参照)。見直しが必要な場合はこの配列を直接更新する。
 */
export const REAL_VALUE_SCENARIOS = [
  { id: 'a', label: '穏当な反転', targetFx: 135, targetCape: 30, description: '為替→135円 / CAPE→30' },
  { id: 'b', label: '企業物価PPP水準', targetFx: 92, targetCape: 28, description: '為替→92円 / CAPE→28' },
  { id: 'c', label: '消費者物価PPP水準', targetFx: 106, targetCape: 25, description: '為替→106円 / CAPE→25' },
] as const
