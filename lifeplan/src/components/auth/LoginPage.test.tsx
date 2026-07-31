// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { useAuthStore } from '../../store/authStore'
import { FakeAuthPort } from '../../../tests/fakeAuthPort'

describe('LoginPage', () => {
  let port: FakeAuthPort
  beforeEach(() => {
    port = new FakeAuthPort()
    useAuthStore.getState().init(port, [])
  })

  it('「Googleでログイン」ボタンだけを出す（§8.4）', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
  })

  it('クリックで signIn がポートに届く', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    expect(port.signInCalls).toBe(1)
  })

  it('signIn 失敗時にエラーメッセージを表示する', async () => {
    port.failSignIn = true
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ログインに失敗しました')
  })
})
