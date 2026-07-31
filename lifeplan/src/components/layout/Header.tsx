// lifeplan/src/components/layout/Header.tsx
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import styles from './Header.module.css'

export function Header() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <header className={styles.header}>
      <span className={styles.logo}>¥</span>
      <h1 className={styles.title}>家計の羅針盤</h1>
      <nav className={styles.nav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? styles.active : undefined)}>
          ダッシュボード
        </NavLink>
        <NavLink to="/input" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          入力
        </NavLink>
        <NavLink to="/scenarios" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          シナリオ
        </NavLink>
        <NavLink to="/actuals" className={({ isActive }) => (isActive ? styles.active : undefined)}>
          実績
        </NavLink>
      </nav>
      {status === 'allowed' && user && (
        <div className={styles.user}>
          {user.photoURL ? (
            <img
              className={styles.avatar}
              src={user.photoURL}
              alt={user.displayName ?? 'ユーザー'}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={styles.avatar} aria-hidden>
              {(user.displayName ?? '?').charAt(0)}
            </span>
          )}
          <button type="button" className={styles.signOut} onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      )}
    </header>
  )
}
