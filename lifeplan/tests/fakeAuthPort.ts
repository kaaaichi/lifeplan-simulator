import type { AuthPort, AuthUser } from '../src/firebase/authPort'

export class FakeAuthPort implements AuthPort {
  private cb: ((user: AuthUser | null) => void) | null = null
  signInCalls = 0
  signOutCalls = 0
  failSignIn = false

  onChange(cb: (user: AuthUser | null) => void): () => void {
    this.cb = cb
    return () => {
      this.cb = null
    }
  }

  async signIn(): Promise<void> {
    this.signInCalls += 1
    if (this.failSignIn) throw new Error('auth/popup-closed-by-user')
  }

  async signOut(): Promise<void> {
    this.signOutCalls += 1
    this.cb?.(null)
  }

  /** テストから認証状態を発火させる */
  emit(user: AuthUser | null): void {
    this.cb?.(user)
  }
}

export function fakeUser(uid: string): AuthUser {
  return { uid, displayName: `User ${uid}`, email: `${uid}@example.com`, photoURL: null }
}
