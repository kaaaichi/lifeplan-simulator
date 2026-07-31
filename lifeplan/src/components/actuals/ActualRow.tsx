import { MoneyField } from '../input/fields/MoneyField'
import { TextField } from '../input/fields/TextField'
import type { Actual } from '../../types'
import { setActualAction, deleteActualAction, type ActionResult } from '../../store/actualsActions'
import styles from './ActualRow.module.css'

interface Props {
  actual: Actual
  onError: (message: string | null) => void
}

/**
 * note を空文字にしたら、Firestore が undefined フィールドを書けないためキー自体を落とす
 * (firestoreRepository.ts の `delete content.updatedAt` と同じ delete パターン。
 * 分割代入での drop は @typescript-eslint/no-unused-vars に引っかかるため使わない)。
 */
function withNote(actual: Actual, note: string): Actual {
  const next: Actual = { ...actual, note }
  if (note === '') delete next.note
  return next
}

export function ActualRow({ actual, onError }: Props) {
  const run = async (action: Promise<ActionResult>) => {
    const result = await action
    onError(result.ok ? null : (result.error ?? '操作に失敗しました'))
  }

  return (
    <li className={styles.row} aria-label={`${actual.year + 1}年始`}>
      <span className={styles.year}>{actual.year + 1}年始</span>
      <MoneyField
        label="現金残高"
        value={actual.cashBalance}
        onCommit={(cashBalance) => void run(setActualAction({ ...actual, cashBalance }))}
      />
      <MoneyField
        label="投資残高"
        value={actual.investmentBalance}
        onCommit={(investmentBalance) => void run(setActualAction({ ...actual, investmentBalance }))}
      />
      <TextField
        label="メモ"
        value={actual.note ?? ''}
        onCommit={(note) => void run(setActualAction(withNote(actual, note)))}
      />
      <button type="button" onClick={() => void run(deleteActualAction(actual.year))}>
        削除
      </button>
    </li>
  )
}
