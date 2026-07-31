import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../../src/store/authStore'
import { FakeAuthPort, fakeUser } from '../fakeAuthPort'

describe('authStore', () => {
  let port: FakeAuthPort

  beforeEach(() => {
    port = new FakeAuthPort()
  })

  it('init 直後（onChange 発火前）は initializing', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    expect(useAuthStore.getState().status).toBe('initializing')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('null 発火で signedOut', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(null)
    expect(useAuthStore.getState().status).toBe('signedOut')
  })

  it('許可 UID で allowed・user が入る', () => {
    useAuthStore.getState().init(port, ['uid-a', 'uid-b'])
    port.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('allowed')
    expect(useAuthStore.getState().user?.uid).toBe('uid-a')
  })

  it('許可外 UID で denied（user は表示用に保持）', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(fakeUser('uid-x'))
    expect(useAuthStore.getState().status).toBe('denied')
    expect(useAuthStore.getState().user?.uid).toBe('uid-x')
  })

  it('許可リストが空なら全員 denied（fail-closed）', () => {
    useAuthStore.getState().init(port, [])
    port.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('denied')
  })

  it('signIn はポートに委譲し、失敗時は signInError を設定する', async () => {
    useAuthStore.getState().init(port, ['uid-a'])
    await useAuthStore.getState().signIn()
    expect(port.signInCalls).toBe(1)
    expect(useAuthStore.getState().signInError).toBeNull()

    port.failSignIn = true
    await useAuthStore.getState().signIn()
    expect(useAuthStore.getState().signInError).toMatch(/ログインに失敗/)

    // 再試行で signInError はクリアされる
    port.failSignIn = false
    await useAuthStore.getState().signIn()
    expect(useAuthStore.getState().signInError).toBeNull()
  })

  it('signOut はポートに委譲し、onChange(null) 経由で signedOut になる', async () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(fakeUser('uid-a'))
    await useAuthStore.getState().signOut()
    expect(port.signOutCalls).toBe(1)
    expect(useAuthStore.getState().status).toBe('signedOut')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('init は冪等: 再 init で旧ポートの購読を解除し、旧ポートの emit は無視される', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    const newPort = new FakeAuthPort()
    useAuthStore.getState().init(newPort, ['uid-a'])
    port.emit(fakeUser('uid-a')) // 旧ポート
    expect(useAuthStore.getState().status).toBe('initializing')
    newPort.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('allowed')
  })
})
