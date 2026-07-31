## Why

`research/2026-07-15-education-cost-benchmark.md`の調査により、`src/masterData/education.json`の大学費用（国立81.8万円/年など）が出典不明であること、特に国立の数値が別統計（日本政策金融公庫調査の私立文系"入学費用"81.8万円）と偶然完全一致しており転記ミスの疑いが強いこと、私立文系・理系は文科省・私学事業団の実際の調査値より約30%低く見積もられていることが判明した。また入学金（入学料）は現状まったくモデル化されておらず（`outside`は常に0）、大学1年目に発生する一時費用が試算から欠落している。

## What Changes

- `src/masterData/education.json`の`大学`エントリを`{tuition, outside}`から`{tuition, facilityFee, entranceFee}`に拡張する
- 4区分（国立・公立・私立文・私立理）すべてを、一次資料の実額に20%のバッファを乗せた値に更新する
  - 国立: `tuition:643000, facilityFee:0, entranceFee:338000`（出典: e-Gov「国立大学等の授業料その他の費用に関する省令」標準額）
  - 公立: `tuition:644000, facilityFee:0, entranceFee:470000`（出典: 文部科学省「国公私立大学の授業料等の推移」令和3年度、入学料は地域外入学者の平均）
  - 私立文: `tuition:993000, facilityFee:173000, entranceFee:269000`（出典: 文部科学省・日本私立学校振興・共済事業団「私立大学等の令和5年度入学者に係る学生納付金等調査」文科系学部）
  - 私立理: `tuition:1395000, facilityFee:160000, entranceFee:282000`（同調査、理科系学部）
  - 検定料（受験料、国立17,000円等）は金額が小さいため今回はモデル化しない
- `src/masterData/education.ts`の`universityCost()`を、`tuition + facilityFee`を大学1〜4年目すべてで、`entranceFee`を大学1年目（`gradeIndex===18`）のみ加算するよう変更する。関数シグネチャは変更しないため、`src/engine/expenses.ts`側の呼び出し方は無変更で済む

## Capabilities

### New Capabilities
- `university-cost-model`: 大学費用（授業料・施設設備費・入学料）の前提データとその年次計算ロジック

### Modified Capabilities
（なし）

## Impact

- `src/masterData/education.json`: `大学`エントリのスキーマ変更・数値更新
- `src/masterData/education.ts`: `universityCost()`のロジック変更（シグネチャ不変）
- `src/engine/expenses.ts`: 変更不要（呼び出し方が変わらないため）
- ゴールデンマスター回帰（`tests/golden.integration.test.ts`）: 実世帯の子（2024年生・大学「国立」想定、大学費用発生は2042〜2045年）の大学費用総額が4年間327.2万円→291.0万円に変化する（減少方向）。検証年（2027, 2030, 2035, 2040, 2050, 2060）はこの期間と直接重ならないが、2050年・2060年の投資残高は複利計算で間接的に影響を受けるため、実装後に既存の±5%許容誤差内に収まることを確認する

design.md は作成しない: `education.json`と`education.ts`という2ファイルに閉じた変更であり、schema拡張・計算ロジックの分岐（1年目のみentranceFee加算）ともにbrainstorming対話で合意済みで、cross-cuttingな影響・新規依存・大きなあいまいさのいずれにも該当しないため（OpenSpecのdesign.md作成基準に従う判断）。
