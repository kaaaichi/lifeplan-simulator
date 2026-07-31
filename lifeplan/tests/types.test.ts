// tests/types.test.ts
import { describe, it, expect } from 'vitest'
import type { Inputs } from '../src/types'

describe('types', () => {
  it('allows constructing a minimal Inputs object', () => {
    const i: Pick<Inputs, 'baseYear'> = { baseYear: 2026 }
    expect(i.baseYear).toBe(2026)
  })
})
