import { useAuthStore } from '../../store/authStore'
import styles from './auth.module.css'

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn)
  const signInError = useAuthStore((s) => s.signInError)
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.logo} aria-hidden>
          ¥
        </span>
        <h1 className={styles.title}>家計の羅針盤</h1>
        <p className={styles.lead}>夫婦のライフプラン・シミュレーション</p>
        <button type="button" className={styles.googleButton} onClick={() => void signIn()}>
          Googleでログイン
        </button>
        {signInError && (
          <p role="alert" className={styles.error}>
            {signInError}
          </p>
        )}
      </div>
    </main>
  )
}
