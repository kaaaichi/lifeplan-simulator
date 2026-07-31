import { describe, it, expect } from 'vitest'
import edu from '../src/masterData/education.json'
import { DEFAULT_INCOME_BAND } from '../src/masterData/education'

// 注: 元リポジトリにあったスプレッドシート由来の golden fixture は、作者世帯の実データから
// 算出した期待値だったため公開版には含めていない(README「公開版で省いているもの」参照)。

describe('extracted fixtures', () => {
  it('education has 12 grades for 公立', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Object.keys((edu as any)[DEFAULT_INCOME_BAND]['公立'])).toHaveLength(12)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((edu as any)[DEFAULT_INCOME_BAND]['公立']['小1'].tuition).toBe(143500)
  })
})
