// HouseholdRepository ポートの Firestore 実装（設計書 §12.3 ②）。
// - 保存: updatedAt を serverTimestamp() に差し替えて setDoc → 読み返して server 確定値を返す（H3）
// - 読込/購読: fromDoc（検証＋マイグレーション＋未来版 fail-closed C1）を必ず通す
// - Timestamp↔ISO 変換はこの境界に閉じる（pure 層は Firebase 型を知らない）
// - 自分の save も購読に発火させる（InMemory と同契約。ローカル snapshot は estimate で読む）
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'
import type { HouseholdDoc } from './types'
import type { HouseholdRepository } from './repository'
import { fromDoc } from './doc'

/** snapshot の生データを fromDoc に渡せる形へ（updatedAt: Timestamp → ISO 文字列） */
function rawFromSnapshot(snap: DocumentSnapshot): unknown {
  const data = snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>
  const { updatedAt, ...rest } = data
  return updatedAt instanceof Timestamp
    ? { ...rest, updatedAt: updatedAt.toDate().toISOString() }
    : rest
}

export class FirestoreHouseholdRepository implements HouseholdRepository {
  constructor(private db: Firestore) {}

  private ref(householdId: string): DocumentReference {
    return doc(this.db, 'households', householdId)
  }

  async load(householdId: string): Promise<HouseholdDoc | null> {
    const snap = await getDoc(this.ref(householdId))
    if (!snap.exists()) return null
    return fromDoc(rawFromSnapshot(snap))
  }

  async save(householdId: string, docData: HouseholdDoc): Promise<HouseholdDoc> {
    // 呼び出し側の updatedAt（あれば stale な値）は使わず、serverTimestamp() で上書きする
    const content: Partial<HouseholdDoc> = { ...docData }
    delete content.updatedAt
    await setDoc(this.ref(householdId), { ...content, updatedAt: serverTimestamp() })
    const snap = await getDoc(this.ref(householdId))
    return fromDoc(rawFromSnapshot(snap))
  }

  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    onError?: (e: unknown) => void,
  ): () => void {
    return onSnapshot(
      this.ref(householdId),
      (snap) => {
        try {
          cb(snap.exists() ? fromDoc(rawFromSnapshot(snap)) : null)
        } catch (e) {
          onError?.(e)
        }
      },
      (e) => onError?.(e),
    )
  }
}
