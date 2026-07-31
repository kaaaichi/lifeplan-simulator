// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { FirebaseAuthGate } from './FirebaseAuthGate'
import { useHouseholdStore, defaultRepository } from '../../store/householdStore'
import { useAuthStore } from '../../store/authStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { FakeAuthPort, fakeUser } from '../../../tests/fakeAuthPort'

describe('FirebaseAuthGate', () => {
  let port: FakeAuthPort
  let injectedRepo: InMemoryHouseholdRepository

  beforeEach(() => {
    port = new FakeAuthPort()
    injectedRepo = new InMemoryHouseholdRepository()
    useHouseholdStore.setState({ repository: defaultRepository })
    // 前のテストが残した status: 'allowed' 等のグローバルstateが、次のテストの
    // 初回renderで(init()のeffectが走る前に)読まれてrepositoryが誤って
    // 差し替わるのを防ぐ(useHouseholdStoreと同じ理由でのリセット)
    useAuthStore.setState({ status: 'initializing', user: null, signInError: null })
  })

  function renderGate() {
    return render(
      <FirebaseAuthGate
        createPort={() => port}
        createRepository={() => injectedRepo}
        getAllowedUids={() => ['uid-ok']}
      >
        <p>アプリ本体</p>
      </FirebaseAuthGate>,
    )
  }

  it('認証状態が届くまで読み込み中を表示する', () => {
    renderGate()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('未サインインでログイン画面を出す', () => {
    renderGate()
    act(() => port.emit(null))
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
  })

  it('許可外 UID で「アクセス権がありません」を出し、本体を描画しない', () => {
    renderGate()
    act(() => port.emit(fakeUser('uid-ng')))
    expect(screen.getByText('アクセス権がありません')).toBeInTheDocument()
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('許可 UID で repository を差し替えてから本体を描画する', () => {
    renderGate()
    act(() => port.emit(fakeUser('uid-ok')))
    expect(screen.getByText('アプリ本体')).toBeInTheDocument()
    expect(useHouseholdStore.getState().repository).toBe(injectedRepo)
  })

  // シナリオ: サインアウト後に再サインインするとrepositoryが再差し替えされる（受け入れ試験）
  it('サインアウト後に再度サインインすると repository を再差し替えする', () => {
    const repos = [new InMemoryHouseholdRepository(), new InMemoryHouseholdRepository()]
    let call = 0
    render(
      <FirebaseAuthGate
        createPort={() => port}
        createRepository={() => repos[call++]!}
        getAllowedUids={() => ['uid-ok']}
      >
        <p>アプリ本体</p>
      </FirebaseAuthGate>,
    )

    act(() => port.emit(fakeUser('uid-ok')))
    expect(useHouseholdStore.getState().repository).toBe(repos[0])

    act(() => port.emit(null))
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()

    act(() => port.emit(fakeUser('uid-ok')))
    expect(useHouseholdStore.getState().repository).toBe(repos[1])
  })
})
