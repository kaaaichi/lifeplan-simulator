import { useDraftStore } from '../../store/draftStore'
import styles from './SaveBar.module.css'

export function SaveBar() {
  const dirty = useDraftStore((s) => s.dirty)
  const saveError = useDraftStore((s) => s.saveError)
  const save = useDraftStore((s) => s.save)
  const discard = useDraftStore((s) => s.discard)

  return (
    <div className={styles.bar}>
      {dirty && <span className={styles.dirty}>未保存の変更があります</span>}
      {saveError && (
        <span role="alert" className={styles.error}>
          {saveError}
        </span>
      )}
      <button type="button" disabled={!dirty} onClick={() => void save()}>
        保存
      </button>
      <button
        type="button"
        className={styles.secondary}
        disabled={!dirty}
        onClick={() => {
          if (window.confirm('編集内容を破棄しますか?')) discard()
        }}
      >
        破棄
      </button>
    </div>
  )
}
