// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { SelectField } from './SelectField'

describe('SelectField', () => {
  it('commits the selected option', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<SelectField label="住居タイプ" value="賃貸" options={['賃貸', '持ち家'] as const} onCommit={onCommit} />)

    await user.selectOptions(screen.getByLabelText('住居タイプ'), '持ち家')

    expect(onCommit).toHaveBeenCalledWith('持ち家')
  })
})
