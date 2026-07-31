import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useHouseholdStore } from '../../store/householdStore'
import type { HouseholdRepository } from '../../persistence/repository'
import { FirestoreHouseholdRepository } from '../../persistence/firestoreRepository'
import type { AuthPort } from '../../firebase/authPort'
import { createFirebaseAuthPort } from '../../firebase/authPort'
import { allowedUids } from '../../firebase/config'
import { getFirestoreDb } from '../../firebase/app'
import { LoginPage } from './LoginPage'
import { AccessDenied } from './AccessDenied'

interface FirebaseAuthGateProps {
  children: ReactNode
  // DI ポイント（テスト用。既定値が本物）
  createPort?: () => AuthPort
  createRepository?: () => HouseholdRepository
  getAllowedUids?: () => string[]
}

export function FirebaseAuthGate({
  children,
  createPort = createFirebaseAuthPort,
  createRepository = () => new FirestoreHouseholdRepository(getFirestoreDb()),
  getAllowedUids = allowedUids,
}: FirebaseAuthGateProps) {
  const status = useAuthStore((s) => s.status)
  const init = useAuthStore((s) => s.init)
  const [repositoryReady, setRepositoryReady] = useState(false)

  useEffect(() => {
    init(createPort(), getAllowedUids())
  }, [init, createPort, getAllowedUids])

  useEffect(() => {
    // allowed になってから repository を差し替え、差し替え完了後に子（Layout の load）を描画する
    if (status === 'allowed' && !repositoryReady) {
      useHouseholdStore.setState({ repository: createRepository() })
      setRepositoryReady(true)
    }
  }, [status, repositoryReady, createRepository])

  useEffect(() => {
    // allowed から外れたら次回 allowed 時に repository を再差し替えできるようリセットする
    if (status !== 'allowed' && repositoryReady) {
      setRepositoryReady(false)
    }
  }, [status, repositoryReady])

  if (status === 'initializing') return <p>読み込み中...</p>
  if (status === 'signedOut') return <LoginPage />
  if (status === 'denied') return <AccessDenied />
  return repositoryReady ? <>{children}</> : null
}
