import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'
import { firebaseConfigFromEnv } from './config'

// トップレベル副作用なし。memory モード・unit テストでは一切呼ばれない。
let app: FirebaseApp | null = null
let firestoreDb: Firestore | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfigFromEnv())
  return app
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function getFirestoreDb(): Firestore {
  // Child.allowanceMonthly のような明示的な undefined フィールドを setDoc できるよう
  // ignoreUndefinedProperties を有効化する。initializeFirestore は同一 app に対して
  // 一度しか呼べないため、app と同様にモジュールレベルでキャッシュする。
  if (!firestoreDb) {
    firestoreDb = initializeFirestore(getFirebaseApp(), { ignoreUndefinedProperties: true })
  }
  return firestoreDb
}
