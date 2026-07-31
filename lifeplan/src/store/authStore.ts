import { create } from 'zustand'
import type { AuthPort, AuthUser } from '../firebase/authPort'

export type AuthStatus = 'initializing' | 'signedOut' | 'allowed' | 'denied'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  signInError: string | null
  init: (port: AuthPort, allowedUids: string[]) => void
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

// 購読の冪等化(householdStore.load と同じパターン。StrictMode の二重 effect 対策)
let unsubscribe: (() => void) | null = null
let activePort: AuthPort | null = null

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  user: null,
  signInError: null,
  init: (port, allowedUids) => {
    unsubscribe?.()
    activePort = port
    set({ status: 'initializing', user: null, signInError: null })
    unsubscribe = port.onChange((user) => {
      if (!user) {
        set({ status: 'signedOut', user: null })
        return
      }
      // fail-closed: 許可リストが空なら全員 denied(強制は firestore.rules 側)
      set({ status: allowedUids.includes(user.uid) ? 'allowed' : 'denied', user })
    })
  },
  signIn: async () => {
    if (!activePort) return
    set({ signInError: null })
    try {
      await activePort.signIn()
    } catch {
      // ポップアップ閉鎖・ネットワーク断など。詳細コードはユーザーに不要
      set({ signInError: 'ログインに失敗しました。もう一度お試しください。' })
    }
  },
  signOut: async () => {
    await activePort?.signOut()
  },
}))
