import { describe, it, expect, vi } from 'vitest'
import { InMemoryHouseholdRepository } from '../../src/persistence/repository'
import { createDefaultDoc } from '../../src/persistence/doc'

describe('InMemoryHouseholdRepository', () => {
  it('未保存時の load は null', async () => {
    const repo = new InMemoryHouseholdRepository()
    expect(await repo.load('h1')).toBeNull()
  })

  it('save→load で往復する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    const loaded = await repo.load('h1')
    expect(loaded).toEqual(doc)
  })

  it('save は確定 doc（渡した doc と同一内容）を返す', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    const saved = await repo.save('h1', doc)
    expect(saved).toEqual(doc)
  })

  it('subscribe は購読直後に現在値(未保存はnull)で1回発火する', () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('subscribe は既存データがあればそれで初回発火する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(doc)
  })

  it('subscribe は save のたびに再発火する', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    const doc = createDefaultDoc()
    await repo.save('h1', doc)
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith(doc)
  })

  it('unsubscribe すると以後発火しない', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    const unsubscribe = repo.subscribe('h1', cb)
    unsubscribe()
    await repo.save('h1', createDefaultDoc())
    expect(cb).toHaveBeenCalledTimes(1) // 初回発火のみ
  })

  it('別の householdId の save は影響しない', async () => {
    const repo = new InMemoryHouseholdRepository()
    const cb = vi.fn()
    repo.subscribe('h1', cb)
    await repo.save('h2', createDefaultDoc())
    expect(cb).toHaveBeenCalledTimes(1) // 初回発火のみ、h2への保存では発火しない
  })
})
