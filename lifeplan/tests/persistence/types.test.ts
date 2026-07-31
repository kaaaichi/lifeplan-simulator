import { describe, it, expect } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/types'
import { DocValidationError, UnsupportedSchemaVersionError } from '../../src/persistence/errors'

describe('persistence/types', () => {
  it('CURRENT_SCHEMA_VERSION は 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
  })
})

describe('persistence/errors', () => {
  it('DocValidationError は message と path を持つ', () => {
    const e = new DocValidationError('baseYear must be positive', 'baseYear')
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('baseYear must be positive')
    expect(e.path).toBe('baseYear')
  })
  it('UnsupportedSchemaVersionError は foundVersion を持つ', () => {
    const e = new UnsupportedSchemaVersionError(99)
    expect(e).toBeInstanceOf(Error)
    expect(e.foundVersion).toBe(99)
  })
})
