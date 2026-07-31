import styles from './fields.module.css'

export interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: readonly T[]
  onCommit: (v: T) => void
}

export function SelectField<T extends string>({ label, value, options, onCommit }: SelectFieldProps<T>) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control}>
        <select value={value} onChange={(e) => onCommit(e.target.value as T)}>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}
