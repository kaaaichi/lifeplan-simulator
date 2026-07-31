// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PeriodSelector } from './PeriodSelector'

describe('PeriodSelector', () => {
  it('選択中の期間に aria-selected=true を付け、別の期間をクリックすると onChange を呼ぶ', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="to65" onChange={onChange} />)

    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: '全期間' }))
    expect(onChange).toHaveBeenCalledWith('full')
  })

  it('period="full" のとき「全期間」に aria-selected=true が付く', () => {
    render(<PeriodSelector period="full" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '全期間' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '65歳まで' })).toHaveAttribute('aria-selected', 'false')
  })

  it('「10年」「20年」ボタンが表示され、クリックするとonChangeに対応する値を渡す', () => {
    const onChange = vi.fn()
    render(<PeriodSelector period="to65" onChange={onChange} />)

    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('tab', { name: '10年' }))
    expect(onChange).toHaveBeenCalledWith('y10')

    fireEvent.click(screen.getByRole('tab', { name: '20年' }))
    expect(onChange).toHaveBeenCalledWith('y20')
  })

  it('period="y10"/"y20" のとき対応するボタンに aria-selected=true が付く', () => {
    const { rerender } = render(<PeriodSelector period="y10" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '10年' })).toHaveAttribute('aria-selected', 'true')

    rerender(<PeriodSelector period="y20" onChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: '20年' })).toHaveAttribute('aria-selected', 'true')
  })
})
