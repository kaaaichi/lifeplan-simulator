import { describe, it, expect } from 'vitest'
import { persistenceMode, firebaseConfigFromEnv, allowedUids } from '../../src/firebase/config'

const fullEnv = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'proj',
  VITE_FIREBASE_STORAGE_BUCKET: 'b',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
  VITE_FIREBASE_APP_ID: 'a',
} as ImportMetaEnv

describe('persistenceMode', () => {
  it('VITE_PERSISTENCE 未設定なら memory', () => {
    expect(persistenceMode({} as ImportMetaEnv)).toBe('memory')
  })
  it('firestore 指定で firestore', () => {
    expect(persistenceMode({ VITE_PERSISTENCE: 'firestore' } as ImportMetaEnv)).toBe('firestore')
  })
  it('未知の値は memory（fail-closed）', () => {
    expect(persistenceMode({ VITE_PERSISTENCE: 'firebase' } as ImportMetaEnv)).toBe('memory')
  })
})

describe('firebaseConfigFromEnv', () => {
  it('全キー揃いで FirebaseOptions を返す', () => {
    expect(firebaseConfigFromEnv(fullEnv)).toEqual({
      apiKey: 'k',
      authDomain: 'example.firebaseapp.com',
      projectId: 'proj',
      storageBucket: 'b',
      messagingSenderId: 'm',
      appId: 'a',
    })
  })
  it('不足キーがあれば throw（メッセージに不足キー名）', () => {
    const env = { ...fullEnv, VITE_FIREBASE_APP_ID: '' } as ImportMetaEnv
    expect(() => firebaseConfigFromEnv(env)).toThrow(/VITE_FIREBASE_APP_ID/)
  })
})

describe('allowedUids', () => {
  it('カンマ区切り・空白 trim・空要素除去', () => {
    expect(allowedUids({ VITE_FIREBASE_ALLOWED_UIDS: ' uidA , uidB ,' } as ImportMetaEnv)).toEqual([
      'uidA',
      'uidB',
    ])
  })
  it('未設定なら空配列（全員 denied = fail-closed）', () => {
    expect(allowedUids({} as ImportMetaEnv)).toEqual([])
  })
})
