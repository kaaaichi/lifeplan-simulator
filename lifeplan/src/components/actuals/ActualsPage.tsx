import { useState } from 'react'
import { useHouseholdStore } from '../../store/householdStore'
import { selectActiveScenario } from '../../store/selectors'
import type { HouseholdDoc } from '../../persistence/types'
import { ActualRow } from './ActualRow'
import {
  setActualAction,
  captureBaselineAction,
  recaptureBaselineAction,
  type ActionResult,
} from '../../store/actualsActions'
import styles from './ActualsPage.module.css'

/** baseYear の10年前からアクティブシナリオの終了年までで、まだ記録されていない年の一覧(§16.5・§16.9)。
 *  baseYear より前の年は参考記録用(simulateはbaseYear以降しか見ないためリベースには無関係)。 */
const PRE_BASE_YEAR_REFERENCE_RANGE = 10

function availableYears(doc: HouseholdDoc): number[] {
  const scenario = selectActiveScenario(doc)
  const endYear = scenario.inputs.members.primary.birthYear + scenario.inputs.assumptions.endAge
  const recorded = new Set(doc.actuals.map((a) => a.year))
  const years: number[] = []
  for (let y = doc.baseYear - PRE_BASE_YEAR_REFERENCE_RANGE; y <= endYear; y++) {
    if (!recorded.has(y)) years.push(y)
  }
  return years
}

export function ActualsPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRecapture, setConfirmingRecapture] = useState(false)
  const [addingYear, setAddingYear] = useState<number | ''>('')

  if (status === 'error') {
    return (
      <main className={styles.main}>
        <p role="alert">データの読み込みに失敗したため、操作できません。アプリを更新してください。</p>
      </main>
    )
  }
  if (!doc) {
    return (
      <main className={styles.main}>
        <p>読み込み中...</p>
      </main>
    )
  }

  const run = async (action: Promise<ActionResult>): Promise<boolean> => {
    const result = await action
    setError(result.ok ? null : (result.error ?? '操作に失敗しました'))
    return result.ok
  }

  const years = availableYears(doc)

  return (
    <main className={styles.main}>
      <h2>実績値</h2>
      <p className={styles.note}>
        ※ ここでの「年」は年始時点を表します（例:「2025年始」＝2024年12月末と同じ時点）。
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <section className={styles.baseline} aria-label="当初プラン">
        {doc.baseline ? (
          <>
            <p>記録日時: {new Date(doc.baseline.capturedAt ?? '').toLocaleString('ja-JP')}</p>
            {confirmingRecapture ? (
              <span className={styles.confirm}>
                現在の入力内容で当初プランを上書きします。よろしいですか？
                <button
                  type="button"
                  onClick={() => {
                    void run(recaptureBaselineAction()).then(() => setConfirmingRecapture(false))
                  }}
                >
                  上書きする
                </button>
                <button type="button" onClick={() => setConfirmingRecapture(false)}>
                  キャンセル
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingRecapture(true)}>
                再ベースライン
              </button>
            )}
          </>
        ) : (
          <>
            <p>まだ記録されていません。現在の入力内容を当初プランとして凍結します。</p>
            <button type="button" onClick={() => void run(captureBaselineAction())}>
              当初プランとして記録する
            </button>
          </>
        )}
      </section>

      <ul className={styles.list} aria-label="記録済みの実績">
        {doc.actuals.map((a) => (
          <ActualRow key={a.year} actual={a} onError={setError} />
        ))}
      </ul>

      <div className={styles.addRow}>
        <label>
          <span>追加する年</span>
          <select
            aria-label="追加する年"
            value={addingYear}
            onChange={(e) => setAddingYear(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={years.length === 0}
          >
            <option value="" disabled>
              年を選択
            </option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y + 1}年始
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={addingYear === ''}
          onClick={() => {
            if (addingYear === '') return
            void run(setActualAction({ year: addingYear, cashBalance: 0, investmentBalance: 0 })).then((ok) => {
              if (ok) setAddingYear('')
            })
          }}
        >
          年を追加
        </button>
      </div>
    </main>
  )
}
