## ADDED Requirements

### Requirement: 大学費用データモデル
`education.json`の`大学`エントリは、区分（国立・公立・私立文・私立理）ごとに`tuition`（年間授業料）・`facilityFee`（年間施設設備費、国立・公立は0）・`entranceFee`（入学時一時金）の3フィールドを持たなければならない(SHALL)。

#### Scenario: 4区分の数値が一次資料+20%バッファと一致する
- **WHEN** `educationMaster`の`大学`エントリを参照する
- **THEN** 国立=`{tuition:643000, facilityFee:0, entranceFee:338000}`、公立=`{tuition:644000, facilityFee:0, entranceFee:470000}`、私立文=`{tuition:993000, facilityFee:173000, entranceFee:269000}`、私立理=`{tuition:1395000, facilityFee:160000, entranceFee:282000}`となっている

### Requirement: 入学金は大学1年目のみ計上
`universityCost(edu, uni, gradeIndex)`は、`gradeIndex===18`（大学1年目）のときのみ`entranceFee`を加算し、大学2〜4年目（`gradeIndex`が19〜21）では加算してはならない(SHALL NOT)。

#### Scenario: 大学1年目は tuition + facilityFee + entranceFee の合計になる
- **WHEN** `gradeIndex=18`で`universityCost(edu, '私立理', 18)`を呼び出す
- **THEN** 戻り値は`1395000 + 160000 + 282000 = 1837000`になる

#### Scenario: 大学2〜4年目は entranceFee を含まない
- **WHEN** `gradeIndex=19, 20, 21`のいずれかで`universityCost(edu, '私立理', gradeIndex)`を呼び出す
- **THEN** 戻り値は`tuition + facilityFee`（`1395000 + 160000 = 1555000`）のみで、`entranceFee`は含まれない

### Requirement: 既存呼び出し側との互換性
`universityCost(edu, uni, gradeIndex)`の関数シグネチャ（引数・戻り値の型）は変更してはならない(SHALL NOT)。`src/engine/expenses.ts`の呼び出しコードは本changeにより変更してはならない(SHALL NOT)。

#### Scenario: gradeIndexが大学範囲外の場合は0を返す
- **WHEN** `gradeIndex`が18未満または21超（例: 17や22）で`universityCost()`を呼び出す
- **THEN** 0を返す（既存挙動と同じ）

### Requirement: ゴールデンマスター回帰の維持
本changeの適用後も、`tests/golden.integration.test.ts`の検証年（2027, 2030, 2035, 2040, 2050, 2060）における投資残高の対ゴールデン誤差率は±5%以内でなければならない(SHALL)。

#### Scenario: 既存のゴールデン回帰テストがgreenのまま
- **WHEN** 本changeの実装後に`npm test`を実行する
- **THEN** `golden.integration.test.ts`のすべてのテストがpassする
