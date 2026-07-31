// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessDenied } from './AccessDenied'
import { useAuthStore } from '../../store/authStore'
import { FakeAuthPort, fakeUser } from '../../../tests/fakeAuthPort'

describe('AccessDenied', () => {
  let port: FakeAuthPort
  beforeEach(() => {
    port = new FakeAuthPort()
    useAuthStore.getState().init(port, ['someone-else'])
    port.emit(fakeUser('uid-x'))
  })

  it('「アクセス権がありません」と UID（許可リスト登録用）を表示する', () => {
    render(<AccessDenied />)
    expect(screen.getByText('アクセス権がありません')).toBeInTheDocument()
    expect(screen.getByText('uid-x', { selector: 'code' })).toBeInTheDocument()
  })

  it('「別のアカウントでログイン」で signOut がポートに届く', async () => {
    render(<AccessDenied />)
    await userEvent.click(screen.getByRole('button', { name: '別のアカウントでログイン' }))
    expect(port.signOutCalls).toBe(1)
  })
})
