import { describe, it, expect } from 'vitest'
import type { HouseholdDoc } from '../../src/persistence/types'
import { createDefaultDoc, toDoc, fromDoc } from '../../src/persistence/doc'
import {
  duplicateScenario,
  deleteScenario,
  renameScenario,
  setActiveScenario,
} from '../../src/persistence/scenarioOps'

/** base + second の2本を持つ doc（roundtrip 済み） */
function docWithTwo(): HouseholdDoc {
  const base = createDefaultDoc()
  return fromDoc(toDoc(duplicateScenario(base, 'base', 'second')))
}

describe('duplicateScenario', () => {
  it('adds a deep copy with the new id and keeps activeScenarioId', () => {
    const doc = createDefaultDoc()
    const content = duplicateScenario(doc, 'base', 'copy-1')

    expect(content.scenarios).toHaveLength(2)
    expect(content.activeScenarioId).toBe('base')
    const copy = content.scenarios[1]!
    expect(copy.id).toBe('copy-1')
    expect(copy.inputs).toEqual(doc.scenarios[0]!.inputs)
    // deep clone: 元と参照非共有
    expect(copy.inputs).not.toBe(doc.scenarios[0]!.inputs)
    expect(copy.inputs.members).not.toBe(doc.scenarios[0]!.inputs.members)
  })

  it('names the copy 「◯◯のコピー」 and numbers collisions 2, 3, ...', () => {
    const doc = createDefaultDoc()
    const once = fromDoc(toDoc(duplicateScenario(doc, 'base', 'c1')))
    expect(once.scenarios[1]!.name).toBe('ベースプランのコピー')

    const twice = fromDoc(toDoc(duplicateScenario(once, 'base', 'c2')))
    expect(twice.scenarios[2]!.name).toBe('ベースプランのコピー2')

    const thrice = fromDoc(toDoc(duplicateScenario(twice, 'base', 'c3')))
    expect(thrice.scenarios[3]!.name).toBe('ベースプランのコピー3')
  })

  it('throws on unknown sourceId / duplicated newId', () => {
    const doc = createDefaultDoc()
    expect(() => duplicateScenario(doc, 'nope', 'c1')).toThrow('シナリオが見つかりません')
    expect(() => duplicateScenario(doc, 'base', 'base')).toThrow('シナリオIDが重複')
  })
})

describe('deleteScenario', () => {
  it('refuses to delete the last scenario', () => {
    const doc = createDefaultDoc()
    expect(() => deleteScenario(doc, 'base')).toThrow('最後のシナリオは削除できません')
  })

  it('deleting the active scenario moves activeScenarioId to the first remaining', () => {
    const doc = docWithTwo() // active = base
    const content = deleteScenario(doc, 'base')
    expect(content.scenarios.map((s) => s.id)).toEqual(['second'])
    expect(content.activeScenarioId).toBe('second')
  })

  it('deleting a non-active scenario keeps activeScenarioId', () => {
    const doc = docWithTwo()
    const content = deleteScenario(doc, 'second')
    expect(content.scenarios.map((s) => s.id)).toEqual(['base'])
    expect(content.activeScenarioId).toBe('base')
  })

  it('throws on unknown id', () => {
    expect(() => deleteScenario(docWithTwo(), 'nope')).toThrow('シナリオが見つかりません')
  })
})

describe('renameScenario', () => {
  it('renames with trimming', () => {
    const content = renameScenario(docWithTwo(), 'second', '  強気プラン  ')
    expect(content.scenarios[1]!.name).toBe('強気プラン')
  })

  it('rejects empty (after trim) names and unknown ids', () => {
    const doc = docWithTwo()
    expect(() => renameScenario(doc, 'second', '   ')).toThrow('シナリオ名を入力してください')
    expect(() => renameScenario(doc, 'nope', 'x')).toThrow('シナリオが見つかりません')
  })
})

describe('setActiveScenario', () => {
  it('switches activeScenarioId', () => {
    const content = setActiveScenario(docWithTwo(), 'second')
    expect(content.activeScenarioId).toBe('second')
  })

  it('throws on unknown id', () => {
    expect(() => setActiveScenario(docWithTwo(), 'nope')).toThrow('シナリオが見つかりません')
  })
})

describe('all ops', () => {
  it('outputs pass fromDoc(toDoc(...)) (§15.3)', () => {
    const doc = docWithTwo()
    for (const content of [
      duplicateScenario(doc, 'base', 'c9'),
      deleteScenario(doc, 'second'),
      renameScenario(doc, 'base', '改名'),
      setActiveScenario(doc, 'second'),
    ]) {
      expect(() => fromDoc(toDoc(content))).not.toThrow()
    }
  })

  it('preserves actuals and baseline fields', () => {
    const doc = docWithTwo()
    const content = setActiveScenario(doc, 'second')
    expect(content.actuals).toEqual(doc.actuals)
    expect(content.baseline).toEqual(doc.baseline)
  })
})
