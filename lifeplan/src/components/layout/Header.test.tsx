// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { useAuthStore } from '../../store/authStore'
import { FakeAuthPort, fakeUser } from '../../../tests/fakeAuthPort'

function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  )
}

describe('Header', () => {
  it('renders the app name', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '家計の羅針盤' })).toBeInTheDocument()
  })

  it('has a nav link to the scenarios page', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'シナリオ' })).toHaveAttribute('href', '/scenarios')
  })

  it('has a nav link to the actuals page', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '実績' })).toHaveAttribute('href', '/actuals')
  })
})

describe('Header ユーザー表示', () => {
  it('allowed のときアバターとログアウトボタンを表示し、クリックで signOut が届く', async () => {
    const port = new FakeAuthPort()
    useAuthStore.getState().init(port, ['uid-a'])
    act(() => port.emit(fakeUser('uid-a')))
    renderHeader()
    expect(screen.getByText('ログアウト')).toBeInTheDocument()
    await userEvent.click(screen.getByText('ログアウト'))
    expect(port.signOutCalls).toBe(1)
  })

  it('未認証（memory モード相当）のときユーザー領域を出さない', () => {
    const port = new FakeAuthPort()
    useAuthStore.getState().init(port, [])
    renderHeader()
    expect(screen.queryByText('ログアウト')).not.toBeInTheDocument()
  })
})
