import { lazy, Suspense, type ReactNode } from 'react'
import { persistenceMode } from '../../firebase/config'

// firebase 系モジュールを memory モードのバンドル/unit テストに持ち込まないための lazy 分割
const FirebaseAuthGate = lazy(() =>
  import('./FirebaseAuthGate').then((m) => ({ default: m.FirebaseAuthGate })),
)

export function AuthGate({ children }: { children: ReactNode }) {
  if (persistenceMode() === 'memory') return <>{children}</>
  return (
    <Suspense fallback={<p>読み込み中...</p>}>
      <FirebaseAuthGate>{children}</FirebaseAuthGate>
    </Suspense>
  )
}
