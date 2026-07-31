import type { FirebaseOptions } from 'firebase/app'

export type PersistenceMode = 'memory' | 'firestore'

/** 既定は memory。'firestore' 以外の値はすべて memory（fail-closed）。 */
export function persistenceMode(env: ImportMetaEnv = import.meta.env): PersistenceMode {
  return env.VITE_PERSISTENCE === 'firestore' ? 'firestore' : 'memory'
}

export function firebaseConfigFromEnv(env: ImportMetaEnv = import.meta.env): FirebaseOptions {
  const entries = [
    ['apiKey', 'VITE_FIREBASE_API_KEY', env.VITE_FIREBASE_API_KEY],
    ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN', env.VITE_FIREBASE_AUTH_DOMAIN],
    ['projectId', 'VITE_FIREBASE_PROJECT_ID', env.VITE_FIREBASE_PROJECT_ID],
    ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET', env.VITE_FIREBASE_STORAGE_BUCKET],
    ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID', env.VITE_FIREBASE_MESSAGING_SENDER_ID],
    ['appId', 'VITE_FIREBASE_APP_ID', env.VITE_FIREBASE_APP_ID],
  ] as const
  const missing = entries.filter(([, , value]) => !value).map(([, envKey]) => envKey)
  if (missing.length > 0) {
    throw new Error(`Firebase 設定が不足しています: ${missing.join(', ')}（lifeplan/.env.local を確認）`)
  }
  return Object.fromEntries(entries.map(([key, , value]) => [key, value])) as FirebaseOptions
}

/** クライアント側の許可 UID リスト（UX 用。強制は firestore.rules）。未設定は空=全員 denied。 */
export function allowedUids(env: ImportMetaEnv = import.meta.env): string[] {
  return (env.VITE_FIREBASE_ALLOWED_UIDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
