import { describe, it, expect } from 'vitest'
import { defaultInputs } from '../../src/persistence/seedOverride'
import { defaultInputs as placeholderInputs } from '../../src/persistence/placeholderHousehold'

describe('seedOverride', () => {
  it('ローカル seed.local.json が無ければプレースホルダにフォールバックする', () => {
    expect(defaultInputs).toEqual(placeholderInputs)
  })
})
