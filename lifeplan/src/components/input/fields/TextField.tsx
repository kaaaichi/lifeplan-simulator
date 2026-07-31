import styles from './fields.module.css'

export interface TextFieldProps {
  label: string
  value: string
  onCommit: (v: string) => void
}

export function TextField({ label, value, onCommit }: TextFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <input type="text" value={value} onChange={(e) => onCommit(e.target.value)} />
      </span>
    </label>
  )
}
