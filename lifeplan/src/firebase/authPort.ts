import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth } from './app'

export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

/** 認証の最小ポート。firebase 依存は createFirebaseAuthPort に閉じる。 */
export interface AuthPort {
  onChange(cb: (user: AuthUser | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
}

export function createFirebaseAuthPort(): AuthPort {
  const auth = getFirebaseAuth()
  return {
    onChange: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null),
      ),
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider())
    },
    signOut: () => firebaseSignOut(auth),
  }
}
