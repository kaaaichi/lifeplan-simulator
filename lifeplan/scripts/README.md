# scripts/

Node.js から実行するローカル運用スクリプト置き場。ブラウザ向け Vite ビルドには含まれない。

## extract-master.mjs

Plan 1 Task4 で使用したゴールデンマスター抽出スクリプト。詳細はリポジトリ直下の CLAUDE.md 参照。

## simulateCli.ts（what-if シミュレーションCLI）

Claude Code のスラッシュコマンドから駆動して、本番Firestoreの `households/{householdId}` に対して
シナリオの what-if シミュレーション（イベント差し替え）を行うためのCLI。
引数解析・Firebase Admin SDK初期化・doc読み込みに加え、シナリオ複製・FinancialEventsのマージ・
`simulate()` 実行・年次テーブル出力・（`--save` 指定時のみ）Firestore書き込みを行う。

### サービスアカウントキーの発行手順

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクト `YOUR_FIREBASE_PROJECT_ID` を開く。
2. 左上の歯車アイコン →「プロジェクトの設定」→「サービス アカウント」タブを開く。
3. 「新しい秘密鍵の生成」をクリックし、確認ダイアログで生成する。
4. ダウンロードされた JSON ファイルをリネームし、このディレクトリ（`lifeplan/scripts/`）直下に
   `service-account.local.json` という名前で配置する。

```
lifeplan/scripts/service-account.local.json   ← ここに配置
```

### 絶対にコミットしないこと

`service-account.local.json` は本番Firestoreへの管理者権限を持つ秘密鍵です。
**このファイルを絶対に git にコミットしないでください。**

- `.gitignore` に明示的なエントリ（`scripts/service-account.local.json`）を追加済みで、
  `git check-ignore -v scripts/service-account.local.json` で除外対象であることを確認済み。
  （注意: この JSON ファイルの拡張子は `.json` であり、既存の `*.local` パターン単体では
  マッチしない。`src/persistence/seed.local.json` と同様、個別に明示パスを `.gitignore` へ
  追加する必要がある。）
- 誤ってコミットしてしまった場合は、直ちに Firebase Console からそのキーを無効化し、
  新しいキーを再発行すること（git 履歴からの削除だけでは不十分）。

### 使い方

```
npx tsx scripts/simulateCli.ts --household <uid> --scenario <scenarioId|active> --events <path> [--save] [--activate]
```

引数:

| 引数 | 必須 | 説明 |
|---|---|---|
| `--household <uid>` | 必須 | 対象 `households/{uid}` ドキュメントのUID |
| `--scenario <scenarioId\|active>` | 必須 | 複製元シナリオのID。`active` を指定すると `activeScenarioId` を使う |
| `--events <path>` | 必須 | 複製シナリオへ追加する `FinancialEvent[]` を含む一時JSONファイルへのパス |
| `--save` | 任意（フラグ） | 指定するとシミュレーション結果をFirestoreへ保存する |
| `--activate` | 任意（フラグ） | 指定すると複製シナリオを `activeScenarioId` にする（`--save` と併用した場合のみ有効） |

必須引数が1つでも欠けている場合、または未知の引数が指定された場合は、エラーメッセージを表示して
非ゼロ終了する。

エミュレータに対して実行したい場合は、通常の Firebase Admin SDK の挙動どおり
環境変数 `FIRESTORE_EMULATOR_HOST` を設定すればよい（このスクリプト側での特別な分岐はない）。
