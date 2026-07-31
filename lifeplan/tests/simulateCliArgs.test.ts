import { describe, it, expect } from 'vitest'
import { parseArgs } from '../scripts/simulateCli'

describe('parseArgs', () => {
  it('必須引数がすべて揃っていれば、フラグはデフォルト(false)でパースできる', () => {
    const result = parseArgs([
      '--household',
      'uid-abc',
      '--scenario',
      'active',
      '--events',
      '/tmp/events.json',
    ])
    expect(result).toEqual({
      household: 'uid-abc',
      scenario: 'active',
      events: '/tmp/events.json',
      save: false,
      activate: false,
    })
  })

  it('--save と --activate を指定するとフラグがtrueになる', () => {
    const result = parseArgs([
      '--household',
      'uid-abc',
      '--scenario',
      'scenario-1',
      '--events',
      './events.json',
      '--save',
      '--activate',
    ])
    expect(result.save).toBe(true)
    expect(result.activate).toBe(true)
  })

  it('引数の順序が入れ替わっても正しくパースできる', () => {
    const result = parseArgs([
      '--activate',
      '--events',
      'events.json',
      '--scenario',
      'active',
      '--save',
      '--household',
      'uid-xyz',
    ])
    expect(result).toEqual({
      household: 'uid-xyz',
      scenario: 'active',
      events: 'events.json',
      save: true,
      activate: true,
    })
  })

  it('--household が欠けていればエラーを投げる', () => {
    expect(() =>
      parseArgs(['--scenario', 'active', '--events', 'events.json']),
    ).toThrow(/--household/)
  })

  it('--scenario が欠けていればエラーを投げる', () => {
    expect(() =>
      parseArgs(['--household', 'uid-abc', '--events', 'events.json']),
    ).toThrow(/--scenario/)
  })

  it('--events が欠けていればエラーを投げる', () => {
    expect(() =>
      parseArgs(['--household', 'uid-abc', '--scenario', 'active']),
    ).toThrow(/--events/)
  })

  it('必須引数が複数欠けていれば、欠けているものすべてをエラーメッセージに含める', () => {
    expect(() => parseArgs([])).toThrow(/--household.*--scenario.*--events/s)
  })

  it('値を伴うべき引数が末尾にあり値が省略されていればエラーを投げる', () => {
    expect(() =>
      parseArgs(['--scenario', 'active', '--events', 'events.json', '--household']),
    ).toThrow(/--household requires a value/)
  })

  it('未知の引数が指定されたらエラーを投げる', () => {
    expect(() =>
      parseArgs([
        '--household',
        'uid-abc',
        '--scenario',
        'active',
        '--events',
        'events.json',
        '--bogus',
      ]),
    ).toThrow(/unknown argument/)
  })
})
