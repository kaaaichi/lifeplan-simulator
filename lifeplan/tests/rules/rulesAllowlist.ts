/// <reference types="node" />
import { readFileSync } from 'node:fs'

/** firestore.rules を読む（テストと rules で許可リストを二重管理しないための単一情報源） */
export function readRules(): string {
  return readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
}

/** `request.auth.uid in ['a', 'b']` の配列リテラルから UID を抽出する */
export function allowlistedUids(rulesText: string): string[] {
  const m = /request\.auth\.uid in \[([^\]]*)\]/.exec(rulesText)
  const inner = m?.[1]
  if (inner === undefined) throw new Error('firestore.rules に許可リストが見つかりません')
  return [...inner.matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '')
}
