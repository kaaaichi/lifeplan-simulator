## 1. `Assumptions.emergencyFundCash` 追加と `simulate()` の取り崩しロジック（TDD）

- [x] 1.1 Red: `lifeplan/tests/simulate.integration.test.ts` に新しい`describe('emergencyFundCash 取り崩し', ...)`ブロックを追加し、以下4件のテストを書く。まだ`Assumptions`に`emergencyFundCash`が存在しないため`inputs.assumptions.emergencyFundCash`は`undefined`となり、`cash < undefined`は常に`false`で取り崩しが発生せず、4件ともFAILする。

```ts
import { simulate } from '../src/engine/simulate'
import { lifeplanMaster } from '../src/masterData'
import { baseInputs } from './_fixtures'

describe('emergencyFundCash 取り崩し', () => {
  it('投資残高が十分な場合、現金が生活防衛資金まで回復し総資産は変わらない', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ name: '投資', balance: 50_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const withFloor = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    const withoutFloor = simulate({ ...inputs, assumptions: { ...inputs.assumptions, emergencyFundCash: -1_000_000_000 } }, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!

    expect(withFloor.cashBalance).toBe(1_200_000)
    expect(withFloor.totalAssets).toBeCloseTo(withoutFloor.totalAssets, 6)
    expect(withFloor.investmentBalance).toBeLessThan(withoutFloor.investmentBalance)
  })

  it('投資残高が不足する場合、投資残高は0になり現金は生活防衛資金を下回ったままになる', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ name: '投資', balance: 500_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const row = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    expect(row.investmentBalance).toBe(0)
    expect(row.cashBalance).toBeLessThan(1_200_000)
  })

  it('現金残高が既に生活防衛資金以上の場合は取り崩しが発生しない', () => {
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [{ name: '普通', balance: 20_000_000 }], investments: [{ name: '投資', balance: 5_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
    }
    const withFloor = simulate(inputs, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    const withoutFloor = simulate({ ...inputs, assumptions: { ...inputs.assumptions, emergencyFundCash: 0 } }, lifeplanMaster).find(r => r.year === baseInputs.baseYear)!
    expect(withFloor.cashBalance).toBe(withoutFloor.cashBalance)
    expect(withFloor.investmentBalance).toBe(withoutFloor.investmentBalance)
  })

  it('楽観シナリオ(returnRate上書き)でも同じ閾値ロジックが適用される', () => {
    const deficitEvent = { id: 'e1', label: '一時的な大型出費', startYear: baseInputs.baseYear, endYear: baseInputs.baseYear, annualAmount: -30_000_000 }
    const inputs = {
      ...baseInputs,
      assets: { bankAccounts: [], investments: [{ name: '投資', balance: 50_000_000 }] },
      assumptions: { ...baseInputs.assumptions, annualInvestmentContribution: 0, emergencyFundCash: 1_200_000 },
      financialEvents: [deficitEvent],
    }
    const row = simulate(inputs, lifeplanMaster, { returnRate: 7 }).find(r => r.year === baseInputs.baseYear)!
    expect(row.cashBalance).toBe(1_200_000)
  })
})
```

- [x] 1.2 `cd lifeplan && npx vitest run tests/simulate.integration.test.ts` を実行し、追加した4件がFAILすることを確認する
- [x] 1.3 Green: `lifeplan/src/types.ts`の`Assumptions`インターフェース（57〜68行目）に`emergencyFundCash: number // 現金として維持する最低額(円)`を追加する
- [x] 1.4 Green: `lifeplan/src/persistence/defaultHousehold.ts`の`assumptions`オブジェクト（26〜36行目）に`emergencyFundCash: 1_200_000,`を追加する（`pensionAnnualPerPerson: 780_000,`の直後）
- [x] 1.5 Green: `lifeplan/src/persistence/placeholderHousehold.ts`の`assumptions`オブジェクト（25〜36行目）に`emergencyFundCash: 1_200_000,`を追加する（`pensionAnnualPerPerson: 780_000,`の直後）
- [x] 1.6 Green: `lifeplan/tests/_fixtures.ts`17行目の`assumptions`オブジェクトリテラルに`emergencyFundCash:1_200_000`を追加する
- [x] 1.7 Green: `lifeplan/src/engine/simulate.ts`50行目`cash = cash + annualCashFlow - contribution`の直後（52行目の「実績があれば年末残高を上書き」コメントの直前）に以下を追加する

```ts
    cash = cash + annualCashFlow - contribution

    // 生活防衛資金(§emergency-fund-drawdown): 現金残高が閾値を下回ったら投資残高を取り崩して補填する。
    // 総資産(cash+invest)は変わらない。投資残高で賄いきれない場合は0円まで取り崩し、現金は閾値未満のまま残す。
    if (cash < a.emergencyFundCash) {
      const shortfall = a.emergencyFundCash - cash
      const drawdown = Math.min(shortfall, Math.max(invest, 0))
      invest -= drawdown
      cash += drawdown
    }

    // 実績があれば年末残高を上書き（最新実績から翌年へ繰り越し＝自動リベース）
```

  （実績年は直後の`if (actual)`ブロックで`invest`/`cash`が上書きされるため、取り崩し計算の結果は実績年には反映されない。これは意図した挙動＝実績値が常に優先される）

- [x] 1.8 `npx vitest run tests/simulate.integration.test.ts` を再実行し、追加した4件を含め全てPASSすることを確認する
- [x] 1.9 `git add lifeplan/src/types.ts lifeplan/src/persistence/defaultHousehold.ts lifeplan/src/persistence/placeholderHousehold.ts lifeplan/src/engine/simulate.ts lifeplan/tests/_fixtures.ts lifeplan/tests/simulate.integration.test.ts && git commit` でコミットする

## 2. 永続化マイグレーション（TDD）

- [x] 2.1 Red: `lifeplan/tests/persistence/migrate.test.ts`に、`schemaVersion: 1`で`emergencyFundCash`を持たないシナリオを含む`HouseholdDoc`を`migrateHouseholdDoc`に渡すと、結果の`schemaVersion`が`2`になり、各シナリオの`inputs.assumptions.emergencyFundCash`が`1_200_000`に補完されることを検証するテストを追加する。

```ts
it('v1→v2: emergencyFundCash未設定のシナリオにデフォルト値1,200,000円を補完する', () => {
  const doc = {
    schemaVersion: 1,
    baseYear: 2027,
    activeScenarioId: 'x',
    scenarios: [{ id: 'x', name: 'ベース', inputs: { assumptions: { investmentReturnRate: 5 } } }],
    actuals: [],
  }
  const migrated = migrateHouseholdDoc(doc)
  expect(migrated.schemaVersion).toBe(2)
  expect((migrated.scenarios[0].inputs.assumptions as { emergencyFundCash: number }).emergencyFundCash).toBe(1_200_000)
})
```

  あわせて、既存の17〜23行目の「runner は版ごとの移行関数配列を CURRENT まで順に適用する構造を持つ（v1のみの現状は恒等）」テストは、`CURRENT_SCHEMA_VERSION`を2に上げると恒等でなくなる（v1→v2の変換が走り`schemaVersion`が2になる）ため、期待値とコメントを更新する。

```ts
it('runner は版ごとの移行関数配列を CURRENT まで順に適用する（v1→v2でschemaVersionが上がる）', () => {
  const doc = { schemaVersion: 1, baseYear: 2027, activeScenarioId: 'x', scenarios: [], actuals: [] }
  const migrated = migrateHouseholdDoc(doc)
  expect(migrated.schemaVersion).toBe(2)
  expect(migrated.baseYear).toBe(2027)
})
```

- [x] 2.2 `npx vitest run tests/persistence/migrate.test.ts` を実行し、新規テストがFAILすること・更新前の「v1のみの現状は恒等」テストが（まだ更新前なら）FAILすることを確認する
- [x] 2.3 Green: `lifeplan/src/persistence/types.ts`4行目の`export const CURRENT_SCHEMA_VERSION = 1`を`export const CURRENT_SCHEMA_VERSION = 2`に変更する
- [x] 2.4 Green: `lifeplan/src/persistence/migrate.ts`に`migrateV1ToV2`を実装し、`migrations`テーブルに登録する（既存の11〜15行目のコメント通りの拡張方法）

```ts
function migrateV1ToV2(doc: VersionedDoc): VersionedDoc {
  const scenarios = (doc.scenarios as Array<{ inputs: { assumptions: Record<string, unknown> } }>).map((s) => ({
    ...s,
    inputs: {
      ...s.inputs,
      assumptions: { emergencyFundCash: 1_200_000, ...s.inputs.assumptions },
    },
  }))
  return { ...doc, schemaVersion: 2, scenarios }
}

const migrations: Record<number, (doc: VersionedDoc) => VersionedDoc> = { 1: migrateV1ToV2 }
```

  （`{ emergencyFundCash: 1_200_000, ...s.inputs.assumptions }`の順序により、既存データに万が一同名フィールドが既にあればそちらが優先される）

- [x] 2.5 `npx vitest run tests/persistence/migrate.test.ts` を再実行し全テストがPASSすることを確認する
- [x] 2.6 `git add lifeplan/src/persistence/types.ts lifeplan/src/persistence/migrate.ts lifeplan/tests/persistence/migrate.test.ts && git commit` でコミットする

## 3. 入力フォームへのフィールド追加

- [x] 3.1 Red: `lifeplan/src/components/input/sections/AssumptionsSection.test.tsx`に以下のテストを追加する

```ts
it('edits emergencyFundCash into the draft', async () => {
  const user = userEvent.setup()
  render(<AssumptionsSection />)

  const field = screen.getByLabelText('生活防衛資金')
  await user.clear(field)
  await user.type(field, '1500000')

  expect(useDraftStore.getState().draft?.assumptions.emergencyFundCash).toBe(1_500_000)
})
```

- [x] 3.2 `npx vitest run src/components/input/sections/AssumptionsSection.test.tsx` を実行し、「生活防衛資金」ラベルの要素が存在せずFAILすることを確認する
- [x] 3.3 Green: `lifeplan/src/components/input/sections/AssumptionsSection.tsx`82行目（`年金額(1人あたり年)`の`MoneyField`）の直後に以下を追加する

```tsx
      <MoneyField label="生活防衛資金" value={a.emergencyFundCash} onCommit={(emergencyFundCash) => setAssumptions({ emergencyFundCash })} />
```

- [x] 3.4 `npx vitest run src/components/input/sections/AssumptionsSection.test.tsx` を再実行しPASSすることを確認する
- [x] 3.5 `git add lifeplan/src/components/input/sections/AssumptionsSection.tsx lifeplan/src/components/input/sections/AssumptionsSection.test.tsx && git commit` でコミットする

## 4. 全体回帰・ゴールデンマスター確認

- [x] 4.1 `cd lifeplan && npm test` を実行し、`golden.integration.test.ts`を含む全テストスイートがgreenであることを確認する。2027年は現行シミュレーションで現金残高が-88万円（閾値120万円を下回る）ことが確認済みのため、取り崩しが発生し2027年の投資残高が変化する見込みである。ログの`err`（対ゴールデン誤差率）を確認し、±5%以内に収まっているかを明示的に記録する。収まらない場合はここで作業を止め、乖離の扱いをユーザーに報告・相談する（総資産自体は不変のため、乖離が出るとすれば投資残高と現金残高の内訳のみ）
  → 360 unit/integration tests pass。golden.integration.test.tsの全6検証年(2027/2030/2035/2040/2050/2060)で誤差0.00%（乖離なし）。理由: ゴールデンマスター用`defaultHousehold.ts`(スプレッドシート由来)には育休等の大型FinancialEventsが含まれておらず、cashが120万円を下回らないため取り崩しロジック自体が発火しない。「2027年現金-88万円」はダッシュボードのユーザー画面が別途一次資料調査タスク(FinancialEvent)を適用した本番シナリオの表示であり、golden fixtureとは別データ
- [x] 4.2 `npm run typecheck` と `npm run lint` を実行し、両方エラーなしであることを確認する → 両方エラーなし
- [x] 4.3 `npm run build` を実行しエラーなしであることを確認する → ビルド成功
- [x] 4.4 `npm run test:e2e` を実行し、既存のe2eテストがgreenであることを確認する → 5/5 pass
- [x] 4.5 4.1〜4.4で追加の修正が必要だった場合はコミットする（無ければ不要） → 追加修正なし（コード変更は既にTask 1-3で完了済み）、コミット不要

## 5. アーカイブ

- [x] 5.1 `openspec validate emergency-fund-drawdown --strict` を実行しpassすることを確認する → "Change 'emergency-fund-drawdown' is valid"
- [x] 5.2 `openspec archive emergency-fund-drawdown` を実行し、`openspec/specs/emergency-fund-drawdown/spec.md`に本changeの要件が統合されたことを確認する → 7 Requirements統合を確認
- [x] 5.3 archiveによるファイル移動・生成分を`git add`してコミットする
- [x] 5.4 `CLAUDE.md`の「現在のステータス」に本changeの実装完了を追記し、「次にやりたいこと」に本項目があれば除去する → 「次にやりたいこと」への事前記載は無かったため追記のみ
