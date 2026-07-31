import type { Inputs } from '../types'
import { defaultInputs as placeholderInputs } from './placeholderHousehold'

// 開発者がローカルにのみ置く実データ (gitignore 対象、Inputs 型準拠の JSON)。
// 無ければプレースホルダにフォールバックする。
// import.meta.glob は Vite 専用機能で、素の Node.js ESM ローダー（tsx 等）では存在しない。
// scripts/simulateCli.ts のように Node.js から直接importされる経路でも安全に動くよう、
// 呼び出し前に try/catch で吸収する。
function loadLocalSeed(): Inputs | undefined {
  try {
    const localSeeds = import.meta.glob('./seed.local.json', { eager: true }) as Record<string, { default: Inputs }>
    return Object.values(localSeeds)[0]?.default
  } catch {
    return undefined
  }
}

export const defaultInputs: Inputs = loadLocalSeed() ?? placeholderInputs
