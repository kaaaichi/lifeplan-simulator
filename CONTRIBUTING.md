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
  - 将来: Web アプリ着手時に `deliver` に Firebase Hosting デプロイを追加（`secrets.FIREBASE_TOKEN`）。

## main 保護
- branch protection: PR 必須・直 push 禁止・必須チェック（`lint`/`typecheck`/`unit`/`integration`/`e2e`）・linear history。
- （プラン制限で API 設定不可の場合は本ルールを運用で担保する。）

## ローカルでの確認（push 前）
```bash
cd lifeplan
npm ci
npm run lint && npm run typecheck && npm run test:unit && npm run test:integration && npm run build && npm run test:e2e
```
