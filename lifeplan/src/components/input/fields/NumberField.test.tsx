// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NumberField } from './NumberField'

describe('NumberField', () => {
  it('commits a valid parsed number', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="年間投資額" value={600000} onCommit={onCommit} min={0} />)

    const input = screen.getByLabelText('年間投資額')
    await user.clear(input)
    await user.type(input, '720000')

    expect(onCommit).toHaveBeenLastCalledWith(720000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error and does not commit when the input is empty', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="年間投資額" value={600000} onCommit={onCommit} min={0} />)

    await user.clear(screen.getByLabelText('年間投資額'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows an error and does not commit below min', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<NumberField label="終了年齢" value={95} onCommit={onCommit} min={37} max={120} />)

    const input = screen.getByLabelText('終了年齢')
    await user.clear(input)
    await user.type(input, '30')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('37以上')
  })

  it('follows an external value change (discard/save)', () => {
    const { rerender } = render(<NumberField label="終了年齢" value={95} onCommit={() => {}} />)
    rerender(<NumberField label="終了年齢" value={90} onCommit={() => {}} />)
    expect(screen.getByLabelText('終了年齢')).toHaveValue(90)
  })

  it('is findable by exact label text even with a suffix', () => {
    render(<NumberField label="生まれ年" value={1990} onCommit={() => {}} suffix="年" />)
    expect(screen.getByLabelText('生まれ年')).toBeInTheDocument()
  })
})
