# Plan 7: ログイン画面＋Firebase実配線 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** §8.4 のログイン画面（Google ログイン・許可外は「アクセス権がありません」）と、§12.3 ②③ の Firebase 実配線（Firestore アダプタ・セキュリティルール・IaC ファイル・Hosting デプロイ）を実装し、夫婦2人が本番 URL で同一世帯ドキュメントを共有できる状態にする。

**Architecture:** ports-and-adapters を維持する。`HouseholdRepository` ポート（Plan 3 で凍結済み）の Firestore 実装 `FirestoreHouseholdRepository` を `src/persistence/` に**純追加**し、保存時 `toDoc`・読込時 `fromDoc`（検証＋マイグレーション＋未来版 fail-closed C1）を通す。認証は `AuthPort`（純 interface）＋ `authStore`（Zustand）＋ `AuthGate`（画面分岐）で構成し、firebase SDK への依存は `src/firebase/` とアダプタ・`FirebaseAuthGate`（lazy 分割）に閉じ込める。**既定モードは従来どおり InMemory**（`memory`）で、Vite の `--mode firebase`（`VITE_PERSISTENCE=firestore`）を指定したときだけ認証ゲート＋Firestore になる。これにより既存の全テスト・e2e・CI は無改変で green を維持する。

**Tech Stack:** 既存（React 19 + TS + Zustand + react-router-dom + Vitest + Playwright）＋ 新規: `firebase`（クライアント SDK、runtime dep）、`firebase-tools`・`@firebase/rules-unit-testing`（devDeps、エミュレータテスト用）。

**仕様の源泉:** `docs/superpowers/specs/2026-06-30-lifeplan-dashboard-design.md` §12.3 ②③・§12.4・§8.4（＋§8.1 ヘッダーのユーザーアイコン）。

## 環境前提（2026-07-07 時点で準備済み）

- Firebase プロジェクト `YOUR_FIREBASE_PROJECT_ID`（Spark）／Web アプリ登録済み。firebaseConfig は `lifeplan/.env.local` に `VITE_FIREBASE_*` 形式で配置済み（gitignore 済み）。
- Firestore `(default)` asia-northeast1 作成済み・**closed rules のまま**（ルールデプロイまで全遮断で正）。
- Auth Google プロバイダ有効化済み。**2人の UID は未取得**（初回サインインで発行される。Task 7 で取得・登録）。
- ローカル: firebase-tools 15.22.4 で `firebase login` 済み、Java 21（エミュレータ用）あり。

## 設計判断（スペックからの逸脱・補足。実装者は従うこと）

1. **`hasPendingWrites` エコー抑止は実装しない**: §12.3.2 は将来拡張として挙げるが、本アプリの購読コールバックは store への set のみで再 save ループが存在しない。逆に InMemory 実装は「自分の save が購読リスナーに発火する」契約で、`draftStore.save`／`scenarioActions` はこの再発火で `householdStore.doc` が更新されることに依存している。Firestore アダプタも**自分の save を購読に見せる**（ローカルスナップショットは `serverTimestamps: 'estimate'` で読む）。
2. **compare-and-set（`expectedUpdatedAt` 付き save）は今回も見送り**: ポート契約の変更を伴うため §12.6 の既知の負債のまま（last-write-wins）。
3. **AccessDenied 画面に UID を表示する**（§8.4 のメッセージに加えて）: 未登録アカウントで初回サインイン→表示された UID を許可リストへ登録、という Task 7 のワークフローを画面だけで完結させるため。
4. **UID は `firestore.rules` にハードコードしてコミットする**: UID は認証を突破しない限り意味を持たない不透明 ID であり秘匿情報ではない。クライアント側の許可判定は `.env.local` の `VITE_FIREBASE_ALLOWED_UIDS`（UX 用）、強制はルール（セキュリティ境界）。**両方を更新する手順を Task 7 に含める**。
5. **許可リストの単一検証**: ルールテストは `firestore.rules` から許可 UID を正規表現で抽出して使う（テスト側に UID を二重管理しない）。Task 7 で実 UID に差し替えてもルールテストは無改変で green のまま。

## Global Constraints

- 作業ディレクトリはリポジトリ root の `lifeplan/`。コマンドはすべて `cd lifeplan && ...`。
- 作業ブランチ: main から `feat/plan7-firebase` を切り、最後に PR（squash merge 運用）。
- **背骨**: `src/engine/` と `src/persistence/` の**既存ファイルは無改変**（`firestoreRepository.ts` の純追加のみ可）。既存の全テスト（197）とゴールデン回帰（`tests/golden.integration.test.ts`）は不変で green。
- **既定モード = memory**: `VITE_PERSISTENCE` 未設定（通常の `dev`/`build`/`preview`/vitest/Playwright）では認証ゲートも firebase 初期化も一切走らない。firebase 系モジュールを `App.tsx` から静的 import しない（`React.lazy` 分割）。
- エミュレータテストはファイル名 `*.emu.test.ts`・`describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)` でガードする（エミュレータ無しの `npm test` では skip 扱い、`npm run test:emu` で実行）。
- テスト命名は既存慣行: コンポーネントテストは co-located `*.test.tsx` で先頭に `// @vitest-environment jsdom`、純TSテストは `tests/` 配下（node env）。
- スタイルは CSS Modules ＋ `src/styles/theme.css` の CSS 変数。UI 文言は日本語。
- 各タスク末尾で `npm run typecheck` を通し、必ず commit する。

## ファイル構成（このプランで増減するもの）

```
lifeplan/
  .env.firebase                        # 新規・コミット対象: VITE_PERSISTENCE=firestore のみ
  .firebaserc                          # 新規: default=YOUR_FIREBASE_PROJECT_ID
  firebase.json                        # 新規: firestore/hosting/emulators
  firestore.rules                      # 新規: households/{id} を許可 UID のみ read/write
  firestore.indexes.json               # 新規: 空
  src/
    vite-env.d.ts                      # 新規: ImportMetaEnv 型
    firebase/
      config.ts                        # 新規: persistenceMode/firebaseConfigFromEnv/allowedUids（純関数）
      app.ts                           # 新規: lazy 初期化（getFirebaseApp/getFirebaseAuth/getFirestoreDb）
      authPort.ts                      # 新規: AuthUser/AuthPort ＋ createFirebaseAuthPort
    persistence/firestoreRepository.ts # 新規: FirestoreHouseholdRepository（純追加）
    store/authStore.ts                 # 新規
    components/auth/
      AuthGate.tsx / FirebaseAuthGate.tsx / LoginPage.tsx / AccessDenied.tsx / auth.module.css
    App.tsx                            # 修正: AuthGate で RouterProvider を包む
    components/layout/Header.tsx(.module.css)  # 修正: ユーザーアイコン＋ログアウト
  tests/
    firebase/config.test.ts
    store/authStore.test.ts
    fakeAuthPort.ts                    # テスト用 FakeAuthPort（共有ヘルパ）
    rules/rulesAllowlist.ts            # firestore.rules から許可 UID を抽出するヘルパ
    rules/firestoreRules.emu.test.ts
    persistence/firestoreRepository.emu.test.ts
.github/workflows/ci.yml               # 修正: firestore-emulator ジョブ追加
```

---

### Task 1: 環境スイッチと Firebase 初期化モジュール

`firebase` SDK を導入し、「どのモードで動くか」「firebaseConfig をどう組み立てるか」「許可 UID リストをどう読むか」を純関数として TDD する。Vite の `firebase` モード（`.env.firebase`）と npm scripts もここで整える。

**Files:**
- Create: `lifeplan/src/vite-env.d.ts`
- Create: `lifeplan/src/firebase/config.ts`
- Create: `lifeplan/src/firebase/app.ts`
- Create: `lifeplan/.env.firebase`
- Modify: `lifeplan/package.json`（dep 追加・scripts `dev:fb`/`build:fb`）
- Test: `lifeplan/tests/firebase/config.test.ts`

**Interfaces:**
- Consumes: なし（純追加）
- Produces（後続タスクが使う）:
  - `persistenceMode(env?: ImportMetaEnv): 'memory' | 'firestore'`（未設定・未知値は `'memory'` = fail-closed）
  - `firebaseConfigFromEnv(env?: ImportMetaEnv): FirebaseOptions`（不足キーは throw、メッセージにキー名）
  - `allowedUids(env?: ImportMetaEnv): string[]`（`VITE_FIREBASE_ALLOWED_UIDS` をカンマ分割・trim・空要素除去。未設定→ `[]`）
  - `getFirebaseApp(): FirebaseApp` / `getFirebaseAuth(): Auth` / `getFirestoreDb(): Firestore`（メモ化 lazy 初期化。トップレベル副作用なし）

- [ ] **Step 1: firebase SDK をインストール**

```bash
cd lifeplan && npm install firebase
```

インストール後 `package.json` の `dependencies` に `firebase`（^12 系を想定。npm が解決した版をそのまま採用）が入っていることを確認。

- [ ] **Step 2: 失敗するテストを書く**

`lifeplan/tests/firebase/config.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import { persistenceMode, firebaseConfigFromEnv, allowedUids } from '../../src/firebase/config'

const fullEnv = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'example.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'proj',
  VITE_FIREBASE_STORAGE_BUCKET: 'b',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'm',
  VITE_FIREBASE_APP_ID: 'a',
} as ImportMetaEnv

describe('persistenceMode', () => {
  it('VITE_PERSISTENCE 未設定なら memory', () => {
    expect(persistenceMode({} as ImportMetaEnv)).toBe('memory')
  })
  it('firestore 指定で firestore', () => {
    expect(persistenceMode({ VITE_PERSISTENCE: 'firestore' } as ImportMetaEnv)).toBe('firestore')
  })
  it('未知の値は memory（fail-closed）', () => {
    expect(persistenceMode({ VITE_PERSISTENCE: 'firebase' } as ImportMetaEnv)).toBe('memory')
  })
})

describe('firebaseConfigFromEnv', () => {
  it('全キー揃いで FirebaseOptions を返す', () => {
    expect(firebaseConfigFromEnv(fullEnv)).toEqual({
      apiKey: 'k',
      authDomain: 'example.firebaseapp.com',
      projectId: 'proj',
      storageBucket: 'b',
      messagingSenderId: 'm',
      appId: 'a',
    })
  })
  it('不足キーがあれば throw（メッセージに不足キー名）', () => {
    const env = { ...fullEnv, VITE_FIREBASE_APP_ID: '' } as ImportMetaEnv
    expect(() => firebaseConfigFromEnv(env)).toThrow(/VITE_FIREBASE_APP_ID/)
  })
})

describe('allowedUids', () => {
  it('カンマ区切り・空白 trim・空要素除去', () => {
    expect(allowedUids({ VITE_FIREBASE_ALLOWED_UIDS: ' uidA , uidB ,' } as ImportMetaEnv)).toEqual([
      'uidA',
      'uidB',
    ])
  })
  it('未設定なら空配列（全員 denied = fail-closed）', () => {
    expect(allowedUids({} as ImportMetaEnv)).toEqual([])
  })
})
```

- [ ] **Step 3: 失敗を確認**

Run: `cd lifeplan && npx vitest run tests/firebase/config.test.ts`
Expected: FAIL（`src/firebase/config` が存在しない）

- [ ] **Step 4: 型定義と実装を書く**

`lifeplan/src/vite-env.d.ts` を新規作成:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PERSISTENCE?: string
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_ALLOWED_UIDS?: string
}
```

`lifeplan/src/firebase/config.ts` を新規作成:

```ts
import type { FirebaseOptions } from 'firebase/app'

export type PersistenceMode = 'memory' | 'firestore'

/** 既定は memory。'firestore' 以外の値はすべて memory（fail-closed）。 */
export function persistenceMode(env: ImportMetaEnv = import.meta.env): PersistenceMode {
  return env.VITE_PERSISTENCE === 'firestore' ? 'firestore' : 'memory'
}

export function firebaseConfigFromEnv(env: ImportMetaEnv = import.meta.env): FirebaseOptions {
  const entries = [
    ['apiKey', 'VITE_FIREBASE_API_KEY', env.VITE_FIREBASE_API_KEY],
    ['authDomain', 'VITE_FIREBASE_AUTH_DOMAIN', env.VITE_FIREBASE_AUTH_DOMAIN],
    ['projectId', 'VITE_FIREBASE_PROJECT_ID', env.VITE_FIREBASE_PROJECT_ID],
    ['storageBucket', 'VITE_FIREBASE_STORAGE_BUCKET', env.VITE_FIREBASE_STORAGE_BUCKET],
    ['messagingSenderId', 'VITE_FIREBASE_MESSAGING_SENDER_ID', env.VITE_FIREBASE_MESSAGING_SENDER_ID],
    ['appId', 'VITE_FIREBASE_APP_ID', env.VITE_FIREBASE_APP_ID],
  ] as const
  const missing = entries.filter(([, , value]) => !value).map(([, envKey]) => envKey)
  if (missing.length > 0) {
    throw new Error(`Firebase 設定が不足しています: ${missing.join(', ')}（lifeplan/.env.local を確認）`)
  }
  return Object.fromEntries(entries.map(([key, , value]) => [key, value])) as FirebaseOptions
}

/** クライアント側の許可 UID リスト（UX 用。強制は firestore.rules）。未設定は空=全員 denied。 */
export function allowedUids(env: ImportMetaEnv = import.meta.env): string[] {
  return (env.VITE_FIREBASE_ALLOWED_UIDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}
```

`lifeplan/src/firebase/app.ts` を新規作成（グルーコードのため単体テスト対象外。エミュレータテスト・手動確認で担保）:

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { firebaseConfigFromEnv } from './config'

// トップレベル副作用なし。memory モード・unit テストでは一切呼ばれない。
let app: FirebaseApp | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfigFromEnv())
  return app
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp())
}

export function getFirestoreDb(): Firestore {
  return getFirestore(getFirebaseApp())
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/firebase/config.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 6: Vite の firebase モードと scripts を追加**

`lifeplan/.env.firebase` を新規作成（**コミット対象**。秘密情報は置かない）:

```
# vite --mode firebase / vite build --mode firebase で読み込まれる。
# firebaseConfig 本体は .env.local（全モード共通・gitignore 済み）に置く。
VITE_PERSISTENCE=firestore
```

`lifeplan/package.json` の scripts に追加（既存 scripts は無改変）:

```json
    "dev:fb": "vite --mode firebase",
    "build:fb": "vite build --mode firebase",
```

- [ ] **Step 7: 全ゲート確認**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: 既存 197＋新規 7 テスト green、typecheck/lint 通過

- [ ] **Step 8: Commit**

```bash
cd lifeplan && git add src/vite-env.d.ts src/firebase/ tests/firebase/ .env.firebase package.json package-lock.json
git commit -m "feat(plan7): firebase SDK 導入と環境スイッチ（persistenceMode/config/lazy初期化・--mode firebase）"
```

---

### Task 2: IaC 一式・セキュリティルール・エミュレータテスト基盤

`firebase.json`／`.firebaserc`／`firestore.rules`／`firestore.indexes.json` をリポジトリ管理に載せ（§12.3 ③の最小形。Terraform は将来課題のまま）、ルールを rules-unit-testing でエミュレータ検証する。許可 UID はテスト側に二重管理せず、`firestore.rules` から抽出して使う（設計判断 5）。

**Files:**
- Create: `lifeplan/firebase.json`, `lifeplan/.firebaserc`, `lifeplan/firestore.rules`, `lifeplan/firestore.indexes.json`
- Create: `lifeplan/tests/rules/rulesAllowlist.ts`, `lifeplan/tests/rules/firestoreRules.emu.test.ts`
- Modify: `lifeplan/package.json`（devDeps・scripts `test:emu`/`deploy:rules`/`deploy:hosting`）、`lifeplan/.gitignore`

**Interfaces:**
- Consumes: なし
- Produces:
  - `firestore.rules` の許可リスト形式 `request.auth.uid in ['...', '...']`（Task 7 が実 UID に差し替える）
  - `readRules(): string` / `allowlistedUids(rulesText: string): string[]`（`tests/rules/rulesAllowlist.ts`。Task 7 後も無改変で機能する）
  - `npm run test:emu` = `firebase emulators:exec` 配下で `*.emu.test.ts` を実行（Task 3 も同じ入口を使う）

- [ ] **Step 1: devDeps をインストール**

```bash
cd lifeplan && npm install -D firebase-tools @firebase/rules-unit-testing
```

`@firebase/rules-unit-testing` は `firebase` を peer に持つ。npm が peer 警告を出したら `firebase` 本体と major を揃えた版を明示指定する。

- [ ] **Step 2: IaC ファイルを作成**

`lifeplan/.firebaserc`:

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  }
}
```

`lifeplan/firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "emulators": {
    "firestore": { "host": "127.0.0.1", "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": false
  }
}
```

（`singleProjectMode: false` はテストが `demo-rules`/`demo-adapter` の複数プロジェクト ID を使うため必須。）

`lifeplan/firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

`lifeplan/firestore.rules`（UID は Task 7 で差し替えるプレースホルダ。それまで実プロジェクトには**デプロイしない**＝コンソールの closed rules のまま全遮断）:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 夫婦2人の UID ホワイトリスト（§5・§12.3③）。登録手順は Plan 7 Task 7。
    function isAllowedUser() {
      return request.auth != null
        && request.auth.uid in ['PLACEHOLDER_UID_A', 'PLACEHOLDER_UID_B'];
    }
    match /households/{householdId} {
      allow read, write: if isAllowedUser();
    }
    // 上記以外はデフォルト拒否（match なし = deny）
  }
}
```

`lifeplan/.gitignore` に追記:

```
# firebase
.firebase/
*-debug.log
```

- [ ] **Step 3: 失敗するルールテストを書く**

`lifeplan/tests/rules/rulesAllowlist.ts` を新規作成:

```ts
import { readFileSync } from 'node:fs'

/** firestore.rules を読む（テストと rules で許可リストを二重管理しないための単一情報源） */
export function readRules(): string {
  return readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
}

/** `request.auth.uid in ['a', 'b']` の配列リテラルから UID を抽出する */
export function allowlistedUids(rulesText: string): string[] {
  const m = /request\.auth\.uid in \[([^\]]*)\]/.exec(rulesText)
  const inner = m?.[1]
  if (inner === undefined) throw new Error('firestore.rules に許可リストが見つかりません')
  return [...inner.matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '')
}
```

`lifeplan/tests/rules/firestoreRules.emu.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readRules, allowlistedUids } from './rulesAllowlist'

// firebase emulators:exec が FIRESTORE_EMULATOR_HOST を設定する。無ければ skip。
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

describe.skipIf(!emulatorHost)('firestore.rules（エミュレータ）', () => {
  const rules = readRules()
  const uids = allowlistedUids(rules)
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-rules',
      firestore: { rules },
    })
  })
  afterAll(async () => {
    await testEnv.cleanup()
  })
  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('許可リストは2件（夫婦2人）', () => {
    expect(uids).toHaveLength(2)
  })

  it('許可 UID は households を read/write できる', async () => {
    const db = testEnv.authenticatedContext(uids[0]!).firestore()
    await assertSucceeds(db.doc('households/primary').set({ schemaVersion: 1 }))
    await assertSucceeds(db.doc('households/primary').get())
  })

  it('許可外 UID は read/write できない', async () => {
    const db = testEnv.authenticatedContext('intruder-uid').firestore()
    await assertFails(db.doc('households/primary').get())
    await assertFails(db.doc('households/primary').set({ schemaVersion: 1 }))
  })

  it('未認証は read/write できない', async () => {
    const db = testEnv.unauthenticatedContext().firestore()
    await assertFails(db.doc('households/primary').get())
    await assertFails(db.doc('households/primary').set({ schemaVersion: 1 }))
  })

  it('households 以外のコレクションは許可 UID でも拒否（デフォルト deny）', async () => {
    const db = testEnv.authenticatedContext(uids[0]!).firestore()
    await assertFails(db.doc('other/doc').get())
    await assertFails(db.doc('other/doc').set({ x: 1 }))
  })
})
```

- [ ] **Step 4: test:emu ほか scripts を追加**

`lifeplan/package.json` の scripts に追加:

```json
    "test:emu": "firebase emulators:exec --only firestore --project demo-lifeplan \"vitest run emu.test\"",
    "deploy:rules": "firebase deploy --only firestore",
    "deploy:hosting": "npm run build:fb && firebase deploy --only hosting",
```

- [ ] **Step 5: エミュレータでルールテストを実行**

Run: `cd lifeplan && npm run test:emu`
Expected: PASS（5 tests。初回はエミュレータ jar のダウンロードが走る。Java 21 必須）

さらにエミュレータ無しで skip になることを確認:

Run: `cd lifeplan && npx vitest run emu.test`
Expected: skipped（0 failed）

- [ ] **Step 6: 全ゲート確認**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: green（emu テストは skip 扱い）

- [ ] **Step 7: Commit**

```bash
cd lifeplan && git add firebase.json .firebaserc firestore.rules firestore.indexes.json tests/rules/ package.json package-lock.json .gitignore
git commit -m "feat(plan7): IaC一式（firebase.json/.firebaserc/rules/indexes）とルールのエミュレータテスト"
```

---

### Task 3: FirestoreHouseholdRepository（アダプタ・エミュレータ契約テスト）

`HouseholdRepository` ポートの Firestore 実装（§12.3 ②）。保存時 `toDoc` 済み doc の `updatedAt` を `serverTimestamp()` に置き換えて書き、読み返して server 確定 ISO 文字列で返す（H3）。読込・購読は `fromDoc`（＝検証＋マイグレーション＋未来版 fail-closed C1）を通す。`Timestamp`↔ISO 変換はこのアダプタ境界に閉じる。InMemory と同じ「購読直後に1回発火」「自分の save も購読に見える」契約（H4・設計判断 1）。

**Files:**
- Create: `lifeplan/src/persistence/firestoreRepository.ts`
- Test: `lifeplan/tests/persistence/firestoreRepository.emu.test.ts`

**Interfaces:**
- Consumes: `HouseholdRepository`（`src/persistence/repository.ts`・無改変）、`fromDoc`/`createDefaultDoc`（`src/persistence/doc.ts`）、`UnsupportedSchemaVersionError`（`src/persistence/errors.ts`）、`Firestore` 型（Task 1 の `getFirestoreDb` が実体を渡す）
- Produces: `class FirestoreHouseholdRepository implements HouseholdRepository { constructor(db: Firestore) }`（Task 5 の `FirebaseAuthGate` が生成する）

- [ ] **Step 1: 失敗する契約テストを書く**

`lifeplan/tests/persistence/firestoreRepository.emu.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { FirestoreHouseholdRepository } from '../../src/persistence/firestoreRepository'
import { createDefaultDoc } from '../../src/persistence/doc'
import { UnsupportedSchemaVersionError } from '../../src/persistence/errors'
import type { HouseholdDoc } from '../../src/persistence/types'

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

// アダプタ契約テスト。ルール検証は tests/rules/ に分離済みなので、ここでは全許可ルールを使う。
const OPEN_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}`

describe.skipIf(!emulatorHost)('FirestoreHouseholdRepository（エミュレータ）', () => {
  let testEnv: RulesTestEnvironment
  let app: FirebaseApp
  let db: Firestore
  let repo: FirestoreHouseholdRepository

  beforeAll(async () => {
    // demo-adapter プロジェクトに全許可ルールを登録してから、通常の modular SDK で接続する
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-adapter',
      firestore: { rules: OPEN_RULES },
    })
    app = initializeApp({ projectId: 'demo-adapter', apiKey: 'fake-api-key' }, 'adapter-test')
    db = getFirestore(app)
    const [host, port] = emulatorHost!.split(':')
    connectFirestoreEmulator(db, host!, Number(port))
    repo = new FirestoreHouseholdRepository(db)
  })
  afterAll(async () => {
    await deleteApp(app)
    await testEnv.cleanup()
  })
  beforeEach(async () => {
    await testEnv.clearFirestore()
  })

  it('未保存の load は null', async () => {
    expect(await repo.load('nobody')).toBeNull()
  })

  it('save は server 確定 updatedAt（ISO文字列）付き doc を返し、load と往復する（H3）', async () => {
    const saved = await repo.save('t-roundtrip', createDefaultDoc())
    expect(typeof saved.updatedAt).toBe('string')
    expect(Number.isNaN(Date.parse(saved.updatedAt!))).toBe(false)
    const loaded = await repo.load('t-roundtrip')
    expect(loaded).toEqual(saved)
  })

  it('save は呼び出し側の updatedAt を server 値で置き換える', async () => {
    const stale = { ...createDefaultDoc(), updatedAt: '2000-01-01T00:00:00.000Z' }
    const saved = await repo.save('t-stamp', stale)
    expect(saved.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('subscribe は購読直後に現在値で1回発火する（H4）', async () => {
    const saved = await repo.save('t-initial', createDefaultDoc())
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-initial', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    expect(seen[0]).toEqual(saved)
    unsub()
  })

  it('未作成の subscribe は null で初期発火し、自分の save が購読に発火する（InMemory と同契約）', async () => {
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-echo', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    expect(seen[0]).toBeNull()
    await repo.save('t-echo', createDefaultDoc())
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(2))
    const last = seen[seen.length - 1]
    expect(last?.scenarios[0]?.id).toBe('base')
    expect(typeof last?.updatedAt).toBe('string')
    unsub()
  })

  it('unsubscribe 後は発火しない', async () => {
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-unsub', (d) => seen.push(d))
    await vi.waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1))
    unsub()
    const countAfterUnsub = seen.length
    await repo.save('t-unsub', createDefaultDoc())
    await new Promise((r) => setTimeout(r, 300))
    expect(seen.length).toBe(countAfterUnsub)
  })

  it('未来 schemaVersion は load が throw・subscribe は onError（fail-closed C1）', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('households/t-broken').set({ schemaVersion: 999 })
    })
    await expect(repo.load('t-broken')).rejects.toBeInstanceOf(UnsupportedSchemaVersionError)

    const errors: unknown[] = []
    const seen: (HouseholdDoc | null)[] = []
    const unsub = repo.subscribe('t-broken', (d) => seen.push(d), (e) => errors.push(e))
    await vi.waitFor(() => expect(errors.length).toBeGreaterThanOrEqual(1))
    expect(errors[0]).toBeInstanceOf(UnsupportedSchemaVersionError)
    expect(seen).toHaveLength(0)
    unsub()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `cd lifeplan && npm run test:emu`
Expected: FAIL（`firestoreRepository` が存在しない。tests/rules は PASS のまま）

- [ ] **Step 3: アダプタを実装**

`lifeplan/src/persistence/firestoreRepository.ts` を新規作成（**既存ファイル無改変・純追加**）:

```ts
// HouseholdRepository ポートの Firestore 実装（設計書 §12.3 ②）。
// - 保存: updatedAt を serverTimestamp() に差し替えて setDoc → 読み返して server 確定値を返す（H3）
// - 読込/購読: fromDoc（検証＋マイグレーション＋未来版 fail-closed C1）を必ず通す
// - Timestamp↔ISO 変換はこの境界に閉じる（pure 層は Firebase 型を知らない）
// - 自分の save も購読に発火させる（InMemory と同契約。ローカル snapshot は estimate で読む）
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'
import type { HouseholdDoc } from './types'
import type { HouseholdRepository } from './repository'
import { fromDoc } from './doc'

/** snapshot の生データを fromDoc に渡せる形へ（updatedAt: Timestamp → ISO 文字列） */
function rawFromSnapshot(snap: DocumentSnapshot): unknown {
  const data = snap.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>
  const { updatedAt, ...rest } = data
  return updatedAt instanceof Timestamp
    ? { ...rest, updatedAt: updatedAt.toDate().toISOString() }
    : rest
}

export class FirestoreHouseholdRepository implements HouseholdRepository {
  constructor(private db: Firestore) {}

  private ref(householdId: string): DocumentReference {
    return doc(this.db, 'households', householdId)
  }

  async load(householdId: string): Promise<HouseholdDoc | null> {
    const snap = await getDoc(this.ref(householdId))
    if (!snap.exists()) return null
    return fromDoc(rawFromSnapshot(snap))
  }

  async save(householdId: string, docData: HouseholdDoc): Promise<HouseholdDoc> {
    const { updatedAt: _clientStamp, ...content } = docData
    await setDoc(this.ref(householdId), { ...content, updatedAt: serverTimestamp() })
    const snap = await getDoc(this.ref(householdId))
    return fromDoc(rawFromSnapshot(snap))
  }

  subscribe(
    householdId: string,
    cb: (doc: HouseholdDoc | null) => void,
    onError?: (e: unknown) => void,
  ): () => void {
    return onSnapshot(
      this.ref(householdId),
      (snap) => {
        try {
          cb(snap.exists() ? fromDoc(rawFromSnapshot(snap)) : null)
        } catch (e) {
          onError?.(e)
        }
      },
      (e) => onError?.(e),
    )
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npm run test:emu`
Expected: PASS（rules 5 ＋ adapter 7 tests）

- [ ] **Step 5: 全ゲート確認（背骨: 既存テスト・golden 不変）**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: green（emu テストは skip、golden 回帰含め既存全 green）

- [ ] **Step 6: Commit**

```bash
cd lifeplan && git add src/persistence/firestoreRepository.ts tests/persistence/firestoreRepository.emu.test.ts
git commit -m "feat(plan7): FirestoreHouseholdRepository（toDoc/fromDoc境界・serverTimestamp・購読契約をエミュレータで検証）"
```

---

### Task 4: AuthPort と authStore（純ロジック TDD）

認証状態機械を firebase 非依存で TDD する。`AuthPort` は `onChange`/`signIn`/`signOut` の3メソッドの純 interface。`authStore` は許可リスト判定（fail-closed: リスト空なら全員 denied）を持つ。

**Files:**
- Create: `lifeplan/src/firebase/authPort.ts`
- Create: `lifeplan/src/store/authStore.ts`
- Create: `lifeplan/tests/fakeAuthPort.ts`（Task 5 のコンポーネントテストでも再利用）
- Test: `lifeplan/tests/store/authStore.test.ts`

**Interfaces:**
- Consumes: `getFirebaseAuth`（Task 1）
- Produces:
  - `interface AuthUser { uid: string; displayName: string | null; email: string | null; photoURL: string | null }`
  - `interface AuthPort { onChange(cb: (user: AuthUser | null) => void): () => void; signIn(): Promise<void>; signOut(): Promise<void> }`
  - `createFirebaseAuthPort(): AuthPort`
  - `useAuthStore`: state `{ status: 'initializing' | 'signedOut' | 'allowed' | 'denied'; user: AuthUser | null; signInError: string | null }`、actions `init(port, allowedUids)` / `signIn()` / `signOut()`
  - `class FakeAuthPort implements AuthPort`（`emit(user)` で認証状態を注入、`signInCalls`/`signOutCalls` カウンタ、`failSignIn` フラグ）

- [ ] **Step 1: 失敗するテストを書く**

`lifeplan/tests/fakeAuthPort.ts` を新規作成:

```ts
import type { AuthPort, AuthUser } from '../src/firebase/authPort'

export class FakeAuthPort implements AuthPort {
  private cb: ((user: AuthUser | null) => void) | null = null
  signInCalls = 0
  signOutCalls = 0
  failSignIn = false

  onChange(cb: (user: AuthUser | null) => void): () => void {
    this.cb = cb
    return () => {
      this.cb = null
    }
  }

  async signIn(): Promise<void> {
    this.signInCalls += 1
    if (this.failSignIn) throw new Error('auth/popup-closed-by-user')
  }

  async signOut(): Promise<void> {
    this.signOutCalls += 1
    this.cb?.(null)
  }

  /** テストから認証状態を発火させる */
  emit(user: AuthUser | null): void {
    this.cb?.(user)
  }
}

export function fakeUser(uid: string): AuthUser {
  return { uid, displayName: `User ${uid}`, email: `${uid}@example.com`, photoURL: null }
}
```

`lifeplan/tests/store/authStore.test.ts` を新規作成:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../../src/store/authStore'
import { FakeAuthPort, fakeUser } from '../fakeAuthPort'

describe('authStore', () => {
  let port: FakeAuthPort

  beforeEach(() => {
    port = new FakeAuthPort()
  })

  it('init 直後（onChange 発火前）は initializing', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    expect(useAuthStore.getState().status).toBe('initializing')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('null 発火で signedOut', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(null)
    expect(useAuthStore.getState().status).toBe('signedOut')
  })

  it('許可 UID で allowed・user が入る', () => {
    useAuthStore.getState().init(port, ['uid-a', 'uid-b'])
    port.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('allowed')
    expect(useAuthStore.getState().user?.uid).toBe('uid-a')
  })

  it('許可外 UID で denied（user は表示用に保持）', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(fakeUser('uid-x'))
    expect(useAuthStore.getState().status).toBe('denied')
    expect(useAuthStore.getState().user?.uid).toBe('uid-x')
  })

  it('許可リストが空なら全員 denied（fail-closed）', () => {
    useAuthStore.getState().init(port, [])
    port.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('denied')
  })

  it('signIn はポートに委譲し、失敗時は signInError を設定する', async () => {
    useAuthStore.getState().init(port, ['uid-a'])
    await useAuthStore.getState().signIn()
    expect(port.signInCalls).toBe(1)
    expect(useAuthStore.getState().signInError).toBeNull()

    port.failSignIn = true
    await useAuthStore.getState().signIn()
    expect(useAuthStore.getState().signInError).toMatch(/ログインに失敗/)

    // 再試行で signInError はクリアされる
    port.failSignIn = false
    await useAuthStore.getState().signIn()
    expect(useAuthStore.getState().signInError).toBeNull()
  })

  it('signOut はポートに委譲し、onChange(null) 経由で signedOut になる', async () => {
    useAuthStore.getState().init(port, ['uid-a'])
    port.emit(fakeUser('uid-a'))
    await useAuthStore.getState().signOut()
    expect(port.signOutCalls).toBe(1)
    expect(useAuthStore.getState().status).toBe('signedOut')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('init は冪等: 再 init で旧ポートの購読を解除し、旧ポートの emit は無視される', () => {
    useAuthStore.getState().init(port, ['uid-a'])
    const newPort = new FakeAuthPort()
    useAuthStore.getState().init(newPort, ['uid-a'])
    port.emit(fakeUser('uid-a')) // 旧ポート
    expect(useAuthStore.getState().status).toBe('initializing')
    newPort.emit(fakeUser('uid-a'))
    expect(useAuthStore.getState().status).toBe('allowed')
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `cd lifeplan && npx vitest run tests/store/authStore.test.ts`
Expected: FAIL（`authStore`/`authPort` が存在しない）

- [ ] **Step 3: 実装**

`lifeplan/src/firebase/authPort.ts` を新規作成:

```ts
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth } from './app'

export interface AuthUser {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

/** 認証の最小ポート。firebase 依存は createFirebaseAuthPort に閉じる。 */
export interface AuthPort {
  onChange(cb: (user: AuthUser | null) => void): () => void
  signIn(): Promise<void>
  signOut(): Promise<void>
}

export function createFirebaseAuthPort(): AuthPort {
  const auth = getFirebaseAuth()
  return {
    onChange: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL } : null),
      ),
    signIn: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider())
    },
    signOut: () => firebaseSignOut(auth),
  }
}
```

`lifeplan/src/store/authStore.ts` を新規作成:

```ts
import { create } from 'zustand'
import type { AuthPort, AuthUser } from '../firebase/authPort'

export type AuthStatus = 'initializing' | 'signedOut' | 'allowed' | 'denied'

interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  signInError: string | null
  init: (port: AuthPort, allowedUids: string[]) => void
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

// 購読の冪等化（householdStore.load と同じパターン。StrictMode の二重 effect 対策）
let unsubscribe: (() => void) | null = null
let activePort: AuthPort | null = null

export const useAuthStore = create<AuthState>((set) => ({
  status: 'initializing',
  user: null,
  signInError: null,
  init: (port, allowedUids) => {
    unsubscribe?.()
    activePort = port
    set({ status: 'initializing', user: null, signInError: null })
    unsubscribe = port.onChange((user) => {
      if (!user) {
        set({ status: 'signedOut', user: null })
        return
      }
      // fail-closed: 許可リストが空なら全員 denied（強制は firestore.rules 側）
      set({ status: allowedUids.includes(user.uid) ? 'allowed' : 'denied', user })
    })
  },
  signIn: async () => {
    if (!activePort) return
    set({ signInError: null })
    try {
      await activePort.signIn()
    } catch {
      // ポップアップ閉鎖・ネットワーク断など。詳細コードはユーザーに不要
      set({ signInError: 'ログインに失敗しました。もう一度お試しください。' })
    }
  },
  signOut: async () => {
    await activePort?.signOut()
  },
}))
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run tests/store/authStore.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: 全ゲート確認**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint`
Expected: green

- [ ] **Step 6: Commit**

```bash
cd lifeplan && git add src/firebase/authPort.ts src/store/authStore.ts tests/fakeAuthPort.ts tests/store/authStore.test.ts
git commit -m "feat(plan7): AuthPort と authStore（許可リスト判定 fail-closed・冪等 init を TDD）"
```

---

### Task 5: ログイン画面・AccessDenied・AuthGate と App/Header 配線

§8.4 の画面と、モード分岐ゲート。memory モードでは完全パススルー（既存挙動・既存テスト不変）。firestore モードでは `FirebaseAuthGate`（React.lazy 分割）が認証状態で LoginPage / AccessDenied / 本体を出し分け、allowed になった時点で `householdStore.repository` を Firestore 実装に差し替えてから子を描画する。Header に §8.1 のユーザーアイコン＋ログアウトを追加。

**Files:**
- Create: `lifeplan/src/components/auth/AuthGate.tsx`
- Create: `lifeplan/src/components/auth/FirebaseAuthGate.tsx`
- Create: `lifeplan/src/components/auth/LoginPage.tsx`
- Create: `lifeplan/src/components/auth/AccessDenied.tsx`
- Create: `lifeplan/src/components/auth/auth.module.css`
- Modify: `lifeplan/src/App.tsx`（AuthGate で包む）
- Modify: `lifeplan/src/components/layout/Header.tsx`・`Header.module.css`
- Test: `lifeplan/src/components/auth/LoginPage.test.tsx`、`AccessDenied.test.tsx`、`FirebaseAuthGate.test.tsx`、`lifeplan/src/components/layout/Header.test.tsx`（ケース追加）

**Interfaces:**
- Consumes: `useAuthStore`/`FakeAuthPort`（Task 4）、`persistenceMode`/`allowedUids`/`getFirestoreDb`（Task 1）、`createFirebaseAuthPort`（Task 4）、`FirestoreHouseholdRepository`（Task 3）、`useHouseholdStore`（既存）、`InMemoryHouseholdRepository`（テスト注入用・既存）
- Produces: `AuthGate({ children })`（App.tsx 専用）。`FirebaseAuthGate` は DI 用 props `createPort?: () => AuthPort` / `createRepository?: () => HouseholdRepository` / `getAllowedUids?: () => string[]` を持つ（既定値が本物、テストがフェイクを注入）

- [ ] **Step 1: 失敗するコンポーネントテストを書く**

`lifeplan/src/components/auth/LoginPage.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginPage } from './LoginPage'
import { useAuthStore } from '../../store/authStore'
import { FakeAuthPort } from '../../../tests/fakeAuthPort'

describe('LoginPage', () => {
  let port: FakeAuthPort
  beforeEach(() => {
    port = new FakeAuthPort()
    useAuthStore.getState().init(port, [])
  })

  it('「Googleでログイン」ボタンだけを出す（§8.4）', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
  })

  it('クリックで signIn がポートに届く', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    expect(port.signInCalls).toBe(1)
  })

  it('signIn 失敗時にエラーメッセージを表示する', async () => {
    port.failSignIn = true
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Googleでログイン' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ログインに失敗しました')
  })
})
```

`lifeplan/src/components/auth/AccessDenied.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessDenied } from './AccessDenied'
import { useAuthStore } from '../../store/authStore'
import { FakeAuthPort, fakeUser } from '../../../tests/fakeAuthPort'

describe('AccessDenied', () => {
  let port: FakeAuthPort
  beforeEach(() => {
    port = new FakeAuthPort()
    useAuthStore.getState().init(port, ['someone-else'])
    port.emit(fakeUser('uid-x'))
  })

  it('「アクセス権がありません」と UID（許可リスト登録用）を表示する', () => {
    render(<AccessDenied />)
    expect(screen.getByText('アクセス権がありません')).toBeInTheDocument()
    expect(screen.getByText(/uid-x/)).toBeInTheDocument()
  })

  it('「別のアカウントでログイン」で signOut がポートに届く', async () => {
    render(<AccessDenied />)
    await userEvent.click(screen.getByRole('button', { name: '別のアカウントでログイン' }))
    expect(port.signOutCalls).toBe(1)
  })
})
```

`lifeplan/src/components/auth/FirebaseAuthGate.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { FirebaseAuthGate } from './FirebaseAuthGate'
import { useHouseholdStore, defaultRepository } from '../../store/householdStore'
import { InMemoryHouseholdRepository } from '../../persistence/repository'
import { FakeAuthPort, fakeUser } from '../../../tests/fakeAuthPort'

describe('FirebaseAuthGate', () => {
  let port: FakeAuthPort
  let injectedRepo: InMemoryHouseholdRepository

  beforeEach(() => {
    port = new FakeAuthPort()
    injectedRepo = new InMemoryHouseholdRepository()
    useHouseholdStore.setState({ repository: defaultRepository })
  })

  function renderGate() {
    return render(
      <FirebaseAuthGate
        createPort={() => port}
        createRepository={() => injectedRepo}
        getAllowedUids={() => ['uid-ok']}
      >
        <p>アプリ本体</p>
      </FirebaseAuthGate>,
    )
  }

  it('認証状態が届くまで読み込み中を表示する', () => {
    renderGate()
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('未サインインでログイン画面を出す', () => {
    renderGate()
    act(() => port.emit(null))
    expect(screen.getByRole('button', { name: 'Googleでログイン' })).toBeInTheDocument()
  })

  it('許可外 UID で「アクセス権がありません」を出し、本体を描画しない', () => {
    renderGate()
    act(() => port.emit(fakeUser('uid-ng')))
    expect(screen.getByText('アクセス権がありません')).toBeInTheDocument()
    expect(screen.queryByText('アプリ本体')).not.toBeInTheDocument()
  })

  it('許可 UID で repository を差し替えてから本体を描画する', () => {
    renderGate()
    act(() => port.emit(fakeUser('uid-ok')))
    expect(screen.getByText('アプリ本体')).toBeInTheDocument()
    expect(useHouseholdStore.getState().repository).toBe(injectedRepo)
  })
})
```

`lifeplan/src/components/layout/Header.test.tsx` に追記するケース（既存テストは無改変。import に `useAuthStore`・`FakeAuthPort, fakeUser`・`act` を追加）:

```tsx
describe('Header ユーザー表示', () => {
  it('allowed のときアバターとログアウトボタンを表示し、クリックで signOut が届く', async () => {
    const port = new FakeAuthPort()
    useAuthStore.getState().init(port, ['uid-a'])
    act(() => port.emit(fakeUser('uid-a')))
    renderHeader() // 既存テストと同じレンダリングヘルパ/パターンを使う
    expect(screen.getByText('ログアウト')).toBeInTheDocument()
    await userEvent.click(screen.getByText('ログアウト'))
    expect(port.signOutCalls).toBe(1)
  })

  it('未認証（memory モード相当）のときユーザー領域を出さない', () => {
    const port = new FakeAuthPort()
    useAuthStore.getState().init(port, [])
    renderHeader()
    expect(screen.queryByText('ログアウト')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `cd lifeplan && npx vitest run src/components/auth src/components/layout/Header.test.tsx`
Expected: FAIL（コンポーネント未実装）

- [ ] **Step 3: コンポーネントを実装**

`lifeplan/src/components/auth/auth.module.css`:

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--color-bg, #f6f7f9);
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-width: 22rem;
  width: 100%;
  padding: 2.5rem 2rem;
  border-radius: 12px;
  background: var(--color-surface, #fff);
  box-shadow: 0 2px 12px rgb(0 0 0 / 8%);
  text-align: center;
}
.logo {
  font-size: 2rem;
}
.title {
  font-size: 1.25rem;
  margin: 0;
}
.lead {
  color: var(--color-muted, #667);
  margin: 0;
  font-size: 0.9rem;
}
.googleButton {
  margin-top: 0.5rem;
  padding: 0.65rem 1.5rem;
  border: 1px solid var(--color-muted, #ccd);
  border-radius: 8px;
  background: var(--color-surface, #fff);
  font-size: 1rem;
  cursor: pointer;
}
.error {
  color: var(--color-negative, #c0392b);
  font-size: 0.85rem;
  margin: 0;
}
.uid {
  font-size: 0.8rem;
  color: var(--color-muted, #667);
  word-break: break-all;
  margin: 0;
}
```

（`theme.css` に該当する CSS 変数名が既にあればそちらを優先し、fallback 値は削る。実装時に `src/styles/theme.css` を確認すること。）

`lifeplan/src/components/auth/LoginPage.tsx`:

```tsx
import { useAuthStore } from '../../store/authStore'
import styles from './auth.module.css'

export function LoginPage() {
  const signIn = useAuthStore((s) => s.signIn)
  const signInError = useAuthStore((s) => s.signInError)
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.logo} aria-hidden>
          ¥
        </span>
        <h1 className={styles.title}>家計の羅針盤</h1>
        <p className={styles.lead}>夫婦のライフプラン・シミュレーション</p>
        <button type="button" className={styles.googleButton} onClick={() => void signIn()}>
          Googleでログイン
        </button>
        {signInError && (
          <p role="alert" className={styles.error}>
            {signInError}
          </p>
        )}
      </div>
    </main>
  )
}
```

`lifeplan/src/components/auth/AccessDenied.tsx`:

```tsx
import { useAuthStore } from '../../store/authStore'
import styles from './auth.module.css'

export function AccessDenied() {
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>アクセス権がありません</h1>
        <p className={styles.lead}>このアカウントは許可されていません。</p>
        {/* UID は許可リスト登録（firestore.rules / .env.local）に使う（設計判断3） */}
        {user && (
          <p className={styles.uid}>
            {user.email} / UID: <code>{user.uid}</code>
          </p>
        )}
        <button type="button" className={styles.googleButton} onClick={() => void signOut()}>
          別のアカウントでログイン
        </button>
      </div>
    </main>
  )
}
```

`lifeplan/src/components/auth/FirebaseAuthGate.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useHouseholdStore } from '../../store/householdStore'
import type { HouseholdRepository } from '../../persistence/repository'
import { FirestoreHouseholdRepository } from '../../persistence/firestoreRepository'
import type { AuthPort } from '../../firebase/authPort'
import { createFirebaseAuthPort } from '../../firebase/authPort'
import { allowedUids } from '../../firebase/config'
import { getFirestoreDb } from '../../firebase/app'
import { LoginPage } from './LoginPage'
import { AccessDenied } from './AccessDenied'

interface FirebaseAuthGateProps {
  children: ReactNode
  // DI ポイント（テスト用。既定値が本物）
  createPort?: () => AuthPort
  createRepository?: () => HouseholdRepository
  getAllowedUids?: () => string[]
}

export function FirebaseAuthGate({
  children,
  createPort = createFirebaseAuthPort,
  createRepository = () => new FirestoreHouseholdRepository(getFirestoreDb()),
  getAllowedUids = allowedUids,
}: FirebaseAuthGateProps) {
  const status = useAuthStore((s) => s.status)
  const init = useAuthStore((s) => s.init)
  const [repositoryReady, setRepositoryReady] = useState(false)

  useEffect(() => {
    init(createPort(), getAllowedUids())
  }, [init, createPort, getAllowedUids])

  useEffect(() => {
    // allowed になってから repository を差し替え、差し替え完了後に子（Layout の load）を描画する
    if (status === 'allowed' && !repositoryReady) {
      useHouseholdStore.setState({ repository: createRepository() })
      setRepositoryReady(true)
    }
  }, [status, repositoryReady, createRepository])

  if (status === 'initializing') return <p>読み込み中...</p>
  if (status === 'signedOut') return <LoginPage />
  if (status === 'denied') return <AccessDenied />
  return repositoryReady ? <>{children}</> : null
}
```

`lifeplan/src/components/auth/AuthGate.tsx`:

```tsx
import { lazy, Suspense, type ReactNode } from 'react'
import { persistenceMode } from '../../firebase/config'

// firebase 系モジュールを memory モードのバンドル/unit テストに持ち込まないための lazy 分割
const FirebaseAuthGate = lazy(() =>
  import('./FirebaseAuthGate').then((m) => ({ default: m.FirebaseAuthGate })),
)

export function AuthGate({ children }: { children: ReactNode }) {
  if (persistenceMode() === 'memory') return <>{children}</>
  return (
    <Suspense fallback={<p>読み込み中...</p>}>
      <FirebaseAuthGate>{children}</FirebaseAuthGate>
    </Suspense>
  )
}
```

- [ ] **Step 4: App.tsx と Header を配線**

`lifeplan/src/App.tsx` の `App` を修正（routes・Layout は無改変）:

```tsx
import { AuthGate } from './components/auth/AuthGate'
// …既存 import はそのまま…

export function App() {
  const router = useMemo(() => createBrowserRouter(routes), [])
  return (
    <AuthGate>
      <RouterProvider router={router} />
    </AuthGate>
  )
}
```

`lifeplan/src/components/layout/Header.tsx` の `</nav>` の後にユーザー領域を追加:

```tsx
import { useAuthStore } from '../../store/authStore'
// …既存 import はそのまま…

export function Header() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <header className={styles.header}>
      {/* …既存の logo/title/nav はそのまま… */}
      {status === 'allowed' && user && (
        <div className={styles.user}>
          {user.photoURL ? (
            <img
              className={styles.avatar}
              src={user.photoURL}
              alt={user.displayName ?? 'ユーザー'}
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className={styles.avatar} aria-hidden>
              {(user.displayName ?? '?').charAt(0)}
            </span>
          )}
          <button type="button" className={styles.signOut} onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      )}
    </header>
  )
}
```

`lifeplan/src/components/layout/Header.module.css` に追記:

```css
.user {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-muted, #ccd);
  object-fit: cover;
  font-size: 0.8rem;
}
.signOut {
  border: none;
  background: none;
  color: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}
```

（既存 `.nav` に `margin-left: auto` 等がある場合はレイアウトが崩れないよう実装時に調整。）

- [ ] **Step 5: テストが通ることを確認**

Run: `cd lifeplan && npx vitest run src/components/auth src/components/layout/Header.test.tsx`
Expected: PASS（新規 9 ＋ Header 追加 2）

- [ ] **Step 6: 全ゲート確認（memory モードのパススルー = 既存テスト・e2e 不変が背骨）**

Run: `cd lifeplan && npm test && npm run typecheck && npm run lint && npm run build && npm run build:fb && npm run test:e2e`
Expected: すべて green（`App.integration.test` と e2e 3本は無改変で通る＝memory パススルーの証明。`build:fb` はコンパイルが通ることの確認）

- [ ] **Step 7: Commit**

```bash
cd lifeplan && git add src/components/auth/ src/App.tsx src/components/layout/
git commit -m "feat(plan7): ログイン画面/AccessDenied/AuthGate と App・Header 配線（§8.4、memoryモードはパススルー）"
```

---

### Task 6: CI にエミュレータジョブを追加

`test:emu`（rules ＋ adapter のエミュレータテスト）を CI で回す。Java 21 が必要。

**Files:**
- Modify: `.github/workflows/ci.yml`（リポジトリ root。ジョブ追加のみ、既存ジョブ無改変）

**Interfaces:**
- Consumes: `npm run test:emu`（Task 2）
- Produces: CI ジョブ `firestore-emulator`

- [ ] **Step 1: ジョブを追加**

`.github/workflows/ci.yml` の `jobs:` に追加（既存ジョブと同じ並び・`defaults.run.working-directory: lifeplan` が効く）:

```yaml
  firestore-emulator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: lifeplan/package-lock.json
      - uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: 21
      - run: npm ci
      - run: npm run test:emu
```

- [ ] **Step 2: ローカルで最終確認**

Run: `cd lifeplan && npm run test:emu && npm test && npm run typecheck && npm run lint`
Expected: すべて green

- [ ] **Step 3: Commit・push・PR 作成（CI green を確認）**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(plan7): Firestore エミュレータテストジョブを追加（rules + adapter）"
git push -u origin feat/plan7-firebase
gh pr create --title "feat: Plan 7 — ログイン画面＋Firebase実配線（Auth/Firestoreアダプタ/rules/IaC）" --body "設計書 §12.3②③・§8.4。詳細は docs/superpowers/plans/2026-07-07-lifeplan-firebase.md"
```

Run: `gh pr checks --watch`
Expected: 全ジョブ（既存 + firestore-emulator）green

---

### Task 7: 手動配線 — UID 取得・許可リスト登録・デプロイ・目視確認

ここは環境依存の手動タスク（ユーザーの Google アカウント操作を含む）。Google OAuth の e2e 自動化はしない方針（§13 申し送り）。**Playwright MCP ＋ 認証済みブラウザのファジー確認**で代替する。

- [ ] **Step 1: 初回サインインで 2 人の UID を取得**

1. `cd lifeplan && npm run dev:fb` で起動し、ブラウザで開く（この時点では `VITE_FIREBASE_ALLOWED_UIDS` 未設定 → 誰でも denied）。
2. 夫・妻それぞれの Google アカウントで「Googleでログイン」→ **AccessDenied 画面に表示される UID を控える**（または Firebase コンソール Authentication > Users で確認）。

- [ ] **Step 2: 許可リストを 2 箇所に登録**

1. `lifeplan/firestore.rules` の `PLACEHOLDER_UID_A` / `PLACEHOLDER_UID_B` を実 UID に置換（コミット対象。リポジトリ PRIVATE 確認済み）。
2. `lifeplan/.env.local` に追記（gitignore 済み）: `VITE_FIREBASE_ALLOWED_UIDS=<uidA>,<uidB>`

- [ ] **Step 3: ルールテストが実 UID のまま green なことを確認**

Run: `cd lifeplan && npm run test:emu`
Expected: PASS（テストは rules から UID を抽出するため無改変で通る）

- [ ] **Step 4: ルールをデプロイ**

Run: `cd lifeplan && npm run deploy:rules`
Expected: `firestore.rules`／`firestore.indexes.json` が `YOUR_FIREBASE_PROJECT_ID` に反映（コンソールの closed rules を置き換える）

- [ ] **Step 5: ローカルで実 Firestore との疎通を確認**

`npm run dev:fb` → 許可アカウントでログイン → ダッシュボード表示（初回は `createDefaultDoc` が保存される）→ 入力画面で値を変更して保存 → リロードして値が残る → Firebase コンソールで `households/primary` ドキュメントを確認。

- [ ] **Step 6: Hosting にデプロイして本番確認**

Run: `cd lifeplan && npm run deploy:hosting`
Expected: `https://YOUR_FIREBASE_PROJECT_ID.web.app` で配信。同 URL でログイン→ダッシュボード表示（`*.web.app` は Auth の authorized domains に既定で含まれる）。許可外アカウントで「アクセス権がありません」も確認。

- [ ] **Step 7: Playwright MCP でファジー確認**

認証済みブラウザで: ログイン画面の表示（デスクトップ幅・モバイル幅）／ログイン→ダッシュボード→入力→保存→リロード永続→シナリオ複製・切替→2つ目のブラウザ（もう一人のアカウント）で同時に開き `onSnapshot` の反映を目視。
※Recharts は fullPage スクリーンショットで空白に写るため**ビューポート撮影**で行うこと（既知の教訓）。

- [ ] **Step 8: ドキュメント更新とマージ**

1. ルート `CLAUDE.md` の「現在のステータス」に Plan 7 完了を追記し、「次のタスク」の Plan 7 項目を `- [x]` に更新。
2. Commit:

```bash
git add lifeplan/firestore.rules CLAUDE.md
git commit -m "feat(plan7): 許可UID登録・rules/Hostingデプロイ完了・ステータス更新"
git push
```

3. PR の CI green を確認して squash merge。

---

## Self-Review（作成時に実施済み）

- **§12.3② 網羅**: firestoreRepository（Task 3）・Firebase 初期化（Task 1）・Auth ガード（Task 4/5）✓
- **§12.3③ 網羅**: firestore.rules 2人ホワイトリスト（Task 2/7）・IaC 最小形 4 ファイル（Task 2）✓。Terraform は仕様どおり将来課題のまま。
- **§8.4 網羅**: Google ログインボタンのみ・許可外「アクセス権がありません」（Task 5）✓（UID 表示は文書化済みの追加、設計判断 3）
- **§8.1 ヘッダーのユーザーアイコン**: Task 5 ✓
- **§12.4 のアダプタ関連テスト**: save 確定 doc 返却（H3）・subscribe 初期発火/null/onError（H4）・未来版 fail-closed（C1）を Task 3 でエミュレータ検証 ✓
- **型整合**: `AuthPort`/`AuthUser`（Task 4 定義 → Task 5 消費）、`FirestoreHouseholdRepository(db: Firestore)`（Task 3 定義 → Task 5 消費）、`persistenceMode`/`allowedUids`（Task 1 定義 → Task 5 消費）、`FakeAuthPort.emit/signInCalls/signOutCalls/failSignIn`（Task 4 定義 → Task 5 消費）— 一致確認済み。
- **既知の残課題（GO を阻害しない）**: compare-and-set save（§12.6 のまま）／Terraform IaC／`masterDataVersion` 来歴。
