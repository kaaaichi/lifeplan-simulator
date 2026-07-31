---
name: "lifeplan-simulate"
description: 育休・産休・車購入・住宅ローンなどのイベントを考慮したwhat-ifシミュレーションを本番Firestoreデータに対して実行する
allowed-tools: Bash(node -e:*), Write, Read, WebSearch, WebFetch, AskUserQuestion
category: Simulation
tags: [lifeplan, simulation, what-if, firestore, financial-events]
---

`lifeplan` の本番Firestoreデータに対して、育休・産休・車購入・住宅ローンなどの「イベント」を
仮に発生させた場合の資産推移を試算する（what-ifシミュレーション）。ユーザーとの対話でイベント条件を
ヒアリングし、`FinancialEvent[]` のJSONを組み立てて `scripts/simulateCli.ts` を実行し、結果を提示する。

**重要な前提**
- このコマンドは**本番Firestore**（プロジェクト `YOUR_FIREBASE_PROJECT_ID`）の実データに対して動作する。ローカルのみで完結する操作ではない。
- `lifeplan/scripts/service-account.local.json` がローカルに配置されている必要がある（Firebase Admin SDKの認証情報。`lifeplan/scripts/README.md` に発行手順あり）。無ければユーザーに配置を依頼して中断する。
- CLIは `--save` を付けない限り**Firestoreを一切変更しない**（試算のみ）。`--save` を付けて初めて新しい複製シナリオが `households/{uid}.scenarios` に書き込まれる。`--activate` は `--save` と同時に指定した場合のみ意味を持ち（新シナリオを `activeScenarioId` にする）、`--save` なしで `--activate` だけ付けてもCLI側が警告を出して無視する。
- `npm run` 系の実行はリポジトリ直下ではなく `lifeplan/` パッケージ配下で行う。Bashで `cd lifeplan` してから `npx tsx scripts/simulateCli.ts ...` を実行すること（このディレクトリ構成は worktree でも本体でも同じ）。
- `scripts/simulateCli.ts` の実行（試算のみでも、`--save` を付ける場合でも）は、Claude Code の Bash 実行許可プロンプトを毎回トリガーします。これは意図的な設計です。Firestore への書き込みが明示的な操作となるよう、ユーザーが各実行を明確に承認する必要があります。

## 手順

### 1. イベント内容のヒアリング

**AskUserQuestion** ツール等で、以下を対話的に確認する（一度に全部聞かず、種類が決まってから期間・金額の順に聞いてよい）。

1. **イベントの種類**: 育休・産休、車購入、住宅ローン（借り換え含む）、旅行等の臨時支出、その他の一時的な収入/支出変化、のどれか。複数個でもよい。
2. **期間**: 開始年（西暦）と終了年（西暦、または「それ以降ずっと」）。
   - `FinancialEvent` は**年単位**でしか期間を扱えない（月単位の按分機能はエンジンに無い）。「2027年6月〜2028年3月に育休」のように月をまたぐ場合は、Claude自身が月割りで年間換算額を計算してから渡すこと（例: 2027年は7ヶ月分の影響額、2028年は3ヶ月分の影響額として、年ごとに異なる `annualAmount` を持つ複数イベントに分解する）。
   - 「以降ずっと」の場合は `endYear: null` とする。
3. **金額**: 収入減少額・給付額・返済額など、年間換算でいくらの `annualCashFlow` インパクトになるか。

### 2. 金額が不明な場合の調査方針（一次資料 + research/レポート必須）

公的給付（育児休業給付金・出産手当金等）や複雑な制度に依存する金額は、**安易な一律近似（例:「手取りの80%相当」で済ませる）で済ませてはいけない**。過去に一律80%近似で計算した結果、高所得者の給付上限額超過や180日経過後の給付率低下（67%→50%）を見落とし、実際の減収額を大幅に過小評価する事故があった。必ず以下の手順を踏む。

1. **WebSearch** で制度の概要を把握し、一次資料（厚生労働省・協会けんぽ等の公式サイト・公式PDF）のURLを特定する。
2. その一次資料を **WebFetch**（PDFの場合はダウンロード後 **Read** の `pages` オプション）で直接確認し、計算式・上限額/下限額・給付率が変化する条件（期間経過による変化、高所得者が上限に達するケース等）を正確に把握する。孫引き（まとめサイトの又聞き情報）で済ませず、必ず一次資料の記載と突き合わせる。
3. リポジトリ直下の **`research/`** フォルダに、`research/YYYY-MM-DD-<トピック>.md` の形式で調査レポートを作成する（**Write** ツール）。CLAUDE.md（グローバル）の「調査・レポート作成のルール」に従い、主張ごとに情報源（媒体名・年・可能ならURL）を明記し、一次資料で確認できない推定値（例: 手取り年収からの額面年収の逆算）は「未確認」「通説」等と明示して確認済みの事実と区別する。
4. このレポートに基づいて `FinancialEvent` の金額を計算する。ユーザーの入力データ（手取り年収等）だけでは決まらない要素（額面年収、標準報酬月額等）がある場合は、その仮定をレポートに明記した上で、必要ならユーザーに確認する。
5. 同じ制度・トピックについて `research/` に既存の調査レポートがある場合は、内容が古くなっていないか一次資料の更新有無を軽く確認した上で、無ければ再調査せず既存レポートを再利用してよい（毎回作り直す必要はない）。

一次資料でも確認できなかった要素（額面年収の逆算等）を含め、計算結果と前提はユーザーに提示し、納得を得てから次に進む。

### 3. ローン（車・住宅等）を含める場合の年間返済額の算出

`src/engine/loan.ts` の `monthlyLoanPayment(principal, annualRatePercent, years)` と同じ計算式（元利均等返済のPMT）を使い、月次返済額を求めてから年換算（×12）する。式:

- 金利0%の場合: `月次返済額 = principal / (years * 12)`
- 金利が正の場合:
  - `r = annualRatePercent / 100 / 12`（月利）
  - `n = years * 12`（返済回数）
  - `月次返済額 = principal * r * (1 + r)^n / ((1 + r)^n - 1)`

これは純粋な計算なのでCLIやアプリを起動する必要はない。Claude自身が計算するか、`node -e` のワンライナーで再現してよい。例:

```bash
node -e "const P=3000000,r=1.5/100/12,n=7*12,f=Math.pow(1+r,n);console.log(P*r*f/(f-1))"
```

年間返済額（月次×12）は**支出**なので、`FinancialEvent.annualAmount` には**負の値**として入れる（`annualCashFlow = income - totalExpense + Σ annualAmount` という加算式のため。既存の住宅ローン等と別枠で臨時に発生する借入を想定）。車の一括購入など単年の一時支出も同様に、その年だけ `startYear === endYear` で負の `annualAmount` を持つイベントにする。

### 4. `FinancialEvent[]` JSONの組み立てと書き出し

以下の形の配列を組み立てる（`id` は一意であれば形式は問わない。`crypto.randomUUID()` 相当のランダム文字列でよい）。

```json
[
  {
    "id": "8f3e...",
    "label": "育休による収入減（給付金差引後）",
    "kind": "収入",
    "startYear": 2027,
    "endYear": 2027,
    "annualAmount": -1200000
  },
  {
    "id": "a1b2...",
    "label": "車ローン返済",
    "kind": "支出",
    "startYear": 2027,
    "endYear": 2032,
    "annualAmount": -600000
  }
]
```

- `label`: 何のイベントかが分かる日本語の短い説明。
- `kind`: `"収入"` または `"支出"`（必須）。ダッシュボード/CLIの「単年度収入」「単年度支出」列のどちらに反映するかを決める。育休・産休のような収入減は `"収入"`、車ローン返済・車購入・維持費のような支出は `"支出"` を使う。`annualCashFlow`（単年度収支）への反映結果はどちらでも同じ（`income - totalExpense` の計算上、符号がそのまま効く）だが、`kind` を誤ると「単年度収入」「単年度支出」列の見え方が実態と合わなくなるので注意。
- `startYear`/`endYear`: 上記手順1で確定した年（`endYear: null` は「以降ずっと」）。
- `annualAmount`: 収入増・支出減（＝手元に残るお金が増える方向）なら正、収入減・支出増（＝手元に残るお金が減る方向）なら負。

これを**リポジトリ外の一時ディレクトリ**（このセッションのスクラッチディレクトリがあればそこ、無ければ `/tmp` 等）に、`lifeplan-events-<適当なタイムスタンプ>.json` のようなファイル名で **Write** ツールで書き出す。

### 5. CLIの試算実行（`--save` なし）

対象の `--household <uid>`（Firestore上の households ドキュメントのUID）と `--scenario <scenarioId|active>`（通常は `active`）をユーザーに確認する。`--household` が既知でなければ必ず聞く（自分の判断で決め打ちしない）。

**注意（複製元シナリオの二重計上）**: `--scenario active` は現在の `activeScenarioId` を複製元にする。もし直前に本コマンドで試算・保存したシナリオが誤り（近似が不正確だった等）で、それがまだ `active` のままやり直す場合、`active` を指定すると**既に保存済みの誤ったイベントが入ったシナリオを複製元にしてしまい、新しいイベントが二重に計上される**。やり直しの場合は、イベントを含まない元のシナリオ（例: `base`）を明示的に `--scenario` に指定すること。対象シナリオの一覧は試算実行時のログ（`households/{uid} を読み込みました（scenarios: ...）`）に表示されるので、複製元に意図した通りのイベントが含まれているか確認してから進める。

確認できたら、まず**保存せずに試算のみ**実行する。

```bash
cd lifeplan && npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <手順4で書き出した一時JSONのパス>
```

このコマンドは対象シナリオを内部で複製し、複製シナリオの `inputs.financialEvents` に指定イベントを追加した上で `simulate()` を実行し、年次テーブル（year, income, totalExpense, annualCashFlow, totalAssets）を標準出力に表示する。`--save` を付けていないため、この時点ではFirestoreは一切変更されない。

想定される失敗ケース（CLIがエラー終了し非ゼロで戻る）:
- `households/{uid}` が存在しない
- 指定した `--scenario` のシナリオIDが存在しない
- `--events` のJSONが配列でない、または `startYear > endYear` のイベントを含む

失敗した場合はエラーメッセージをユーザーに提示し、内容（UID間違い・シナリオID間違い・JSON不備等）を一緒に確認する。

### 6. 結果の提示と保存確認

CLIが出力した年次テーブルをそのままユーザーに提示する。合わせて、追加したイベントの内容（種類・期間・金額）を短く要約する。

その上で **AskUserQuestion** 等で「この試算結果を実際に保存しますか？」を確認する。

- **保存しない場合**: ここで終了。Firestoreには何も残らない（複製シナリオは試算用の一時的なものであり、`--save` を付けなかった実行では保存されていない）。
- **保存する場合**: `--save` を付けて同じコマンドを再実行する。

  ```bash
  cd lifeplan && npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <同じ一時JSONのパス> --save
  ```

  さらに「この試算結果をダッシュボードにすぐ反映（アクティブなシナリオに設定）しますか？」も確認し、反映したい場合のみ `--activate` を追加する。

  ```bash
  cd lifeplan && npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <同じ一時JSONのパス> --save --activate
  ```

  `--activate` を付けなければ、シナリオは複製・保存はされるがダッシュボードで表示中のアクティブシナリオは変わらない（後でシナリオ管理画面から手動でアクティブにできる）。

### 7. 最後に

保存した場合は、新しく作られた複製シナリオのID（CLIの出力に含まれる）と、`activeScenarioId` を切り替えたかどうかをユーザーに伝える。書き出した一時JSONファイルは片付け不要（リポジトリ外なのでコミット対象にならない）。

不要になった（間違った近似で保存してしまった等の）シナリオを削除したい場合は、本CLIには削除機能がないため、ダッシュボードの「シナリオ管理」画面（`/scenarios`）からユーザー自身に削除してもらうよう案内するのが基本。急ぎでその場で削除したい場合に限り、`src/persistence/scenarioOps.ts` の `deleteScenario`（既存の純関数、UIの削除ボタンと同じロジック）を使った一時スクリプトを書いて実行してもよいが、本番データの削除操作なので実行前に対象シナリオ名・IDをユーザーに確認すること。
