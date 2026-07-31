import { useEffect, useRef, useState } from 'react'
import styles from './fields.module.css'

export interface NumberFieldProps {
  label: string
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  disabled?: boolean
}

export function NumberField({ label, value, onCommit, min, max, step, suffix, disabled }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const lastCommitted = useRef(value)

  // 外部要因(破棄/保存/他フィールド起因)の value 変化にだけ表示を追随させる。
  // 入力途中の不正文字列は保持する(§14.4: ドラフトは最後の正常値を維持)。
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value
      setText(String(value))
      setError(null)
    }
  }, [value])

  const handleChange = (raw: string) => {
    setText(raw)
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setError('数値を入力してください')
      return
    }
    if (min !== undefined && parsed < min) {
      setError(`${min}以上を入力してください`)
      return
    }
    if (max !== undefined && parsed > max) {
      setError(`${max}以下を入力してください`)
      return
    }
    setError(null)
    lastCommitted.current = parsed
    onCommit(parsed)
  }

  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <input
          type="number"
          value={text}
          step={step}
          disabled={disabled}
          aria-invalid={error !== null}
          aria-label={label}
          onChange={(e) => handleChange(e.target.value)}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </label>
  )
}
