import { useState } from 'react'
import { useHouseholdStore } from '../../store/householdStore'
import { ScenarioCard } from './ScenarioCard'
import styles from './ScenariosPage.module.css'

export function ScenariosPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className={styles.main}>
      <h2>シナリオ管理</h2>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {doc.scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            actuals={doc.actuals}
            isActive={s.id === doc.activeScenarioId}
            canDelete={doc.scenarios.length > 1}
            onError={setError}
          />
        ))}
      </ul>
    </main>
  )
}
