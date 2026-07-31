import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Scenario } from '../../persistence/types'
import type { Actual } from '../../types'
import { selectScenarioSummary } from '../../store/selectors'
import {
  duplicateScenarioAction,
  deleteScenarioAction,
  renameScenarioAction,
  setActiveScenarioAction,
  type ActionResult,
} from '../../store/scenarioActions'
import { formatYen } from '../formatYen'
import styles from './ScenarioCard.module.css'

interface Props {
  scenario: Scenario
  actuals: Actual[]
  isActive: boolean
  canDelete: boolean
  onError: (message: string | null) => void
}

export function ScenarioCard({ scenario, actuals, isActive, canDelete, onError }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(scenario.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // 不正な組み合わせで simulate が throw してもページを巻き込まない(§14.4 の保険と同方針)
  const summary = useMemo(() => {
    try {
      return selectScenarioSummary(scenario.inputs, actuals)
    } catch {
      return null
    }
  }, [scenario.inputs, actuals])

  const run = async (action: Promise<ActionResult>): Promise<boolean> => {
    const result = await action
    onError(result.ok ? null : (result.error ?? '操作に失敗しました'))
    return result.ok
  }

  return (
    <li className={styles.card} aria-label={scenario.name}>
      <div className={styles.titleRow}>
        {renaming ? (
          <>
            <input
              aria-label="シナリオ名"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
            <button
              onClick={() => {
                void run(renameScenarioAction(scenario.id, nameInput)).then((ok) => {
                  if (ok) setRenaming(false)
                })
              }}
            >
              確定
            </button>
            <button
              onClick={() => {
                setRenaming(false)
                setNameInput(scenario.name)
              }}
            >
              キャンセル
            </button>
          </>
        ) : (
          <>
            <h3 className={styles.name}>{scenario.name}</h3>
            {isActive && <span className={styles.badge}>アクティブ</span>}
          </>
        )}
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>終了年齢時点の総資産</dt>
          <dd>{summary ? formatYen(summary.endTotalAssets) : '—'}</dd>
        </div>
        <div>
          <dt>推奨積立額</dt>
          <dd>
            {summary && summary.requiredMonthlyInvestment !== null
              ? `${formatYen(summary.requiredMonthlyInvestment)}/月`
              : '—'}
          </dd>
        </div>
      </dl>
      <div className={styles.actions}>
        {!isActive && (
          <button onClick={() => void run(setActiveScenarioAction(scenario.id))}>アクティブにする</button>
        )}
        <Link className={styles.editLink} to={`/input/${scenario.id}`}>
          編集
        </Link>
        <button onClick={() => void run(duplicateScenarioAction(scenario.id))}>複製</button>
        {!renaming && <button onClick={() => setRenaming(true)}>名前変更</button>}
        {confirmingDelete ? (
          <span className={styles.confirm}>
            削除しますか？
            <button
              onClick={() => {
                void run(deleteScenarioAction(scenario.id)).then(() => setConfirmingDelete(false))
              }}
            >
              削除する
            </button>
            <button onClick={() => setConfirmingDelete(false)}>キャンセル</button>
          </span>
        ) : (
          <button disabled={!canDelete} onClick={() => setConfirmingDelete(true)}>
            削除
          </button>
        )}
      </div>
    </li>
  )
}
