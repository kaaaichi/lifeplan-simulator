import { useAuthStore } from '../../store/authStore'
import styles from './auth.module.css'

export function AccessDenied() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>アクセス権がありません</h1>
        <p className={styles.lead}>このアカウントは許可されていません。</p>
        {/* UID は許可リスト登録（firestore.rules / .env.local）に使う（設計判断3） */}
        {user && (
          <p className={styles.uid}>
            {user.email} / UID: <code>{user.uid}</code>
          </p>
        )}
        <button type="button" className={styles.googleButton} onClick={() => void signOut()}>
          別のアカウントでログイン
        </button>
      </div>
    </main>
  )
}
