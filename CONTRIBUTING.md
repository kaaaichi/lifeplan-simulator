# Contributing — トランクベース開発

`main` がトランク（常にリリース可能）。直接 push せず、短命ブランチ → PR → CI green → squash merge。

## フロー
1. `git switch -c <type>/<topic>`（例 `feat/...`, `fix/...`, `chore/...`）。短命（数時間〜1日）に保つ。
2. 変更を commit し push、`gh pr create --base main`。
3. CI（`lint` / `typecheck` / `unit` / `integration` / `e2e` / `deliver`）が green になるまで修正。
4. green になったら **squash merge**（マージコミット/リベースは無効）。マージ後ブランチは自動削除。

## CI/CD
- ワークフロー: `.github/workflows/ci.yml`。npm 系は `lifeplan/` で実行（Node 24 / setup-node キャッシュ）。
- テスト分類: 結合は `*.integration.test.ts`（`simulate`/`golden`）。それ以外は単体。
  - 単体: `npm run test:unit` / 結合: `npm run test:integration` / 全件: `npm test`
  - e2e（ブラウザ・スモーク）: `npm run test:e2e`（`e2e` ジョブ。ログイン画面が無いため認証不要で決定論的に実行できる）
- Lint: `npm run lint`（ESLint flat config）。型: `npm run typecheck`。
- デリバリー: `deliver` ジョブが `npm run build` → `dist/` を `web-dist` artifact 化。
  - 既知の制約: `education.json` は `dist/` にコピーされない（resolveJsonModule の制約）。成果物が実消費される段階でバンドラ/コピー対応。
- デモ公開: `pages` ジョブが `main` への push 時のみ GitHub Pages へデプロイする。
  - サブパス配信のため `--base=/lifeplan-simulator/` を付けてビルドし、`index.html` を `404.html` にコピーして SPA フォールバックを用意している（`createBrowserRouter` には `import.meta.env.BASE_URL` を `basename` として渡す）。
  - デモは既定モード（`VITE_PERSISTENCE` 未設定 = `memory`）でビルドするため、Firebase にも認証にも接続しない。

## 依存関係の更新

- 更新候補の確認: `npx npm-check-updates`（`-u` で `package.json` を書き換え）。
- マイナー/パッチはまとめて上げてよい。**メジャーは1つずつ**上げて `typecheck` / `lint` / `test` / `build` / `test:e2e` を通すこと。
- **TypeScript は 6 系に固定している（7 に上げないこと）**。`typescript-eslint` が TS 7.0 に未対応で、`npm run lint` が
  `typescript-eslint does not support TS 7.0` で異常終了する。追跡: https://github.com/typescript-eslint/typescript-eslint/issues/10940
  （TS 7 自体は `tsc --noEmit`・テスト・ビルドとも通るので、`typescript-eslint` が対応したら再挑戦する）

## main 保護
- branch protection: PR 必須・直 push 禁止・必須チェック（`lint`/`typecheck`/`unit`/`integration`/`e2e`）・linear history。
- （プラン制限で API 設定不可の場合は本ルールを運用で担保する。）

## ローカルでの確認（push 前）
```bash
cd lifeplan
npm ci
npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e
```
