## 1. householdStore の購読エラー伝播

- [x] 1.1 受け入れ試験（Red）: 購読エラー発火時にstatusがerrorになることを検証する失敗するテストを書く
- [x] 1.2 実装（Green）: `load` が `repository.subscribe` にonErrorコールバックを渡すようにする

## 2. FirebaseAuthGate の repositoryReady リセット

- [x] 2.1 受け入れ試験（Red）: サインアウト後の再サインインでrepositoryが再差し替えされることを検証する失敗するテストを書く
- [x] 2.2 実装（Green）: `status` が `'allowed'` から外れたら `repositoryReady` をfalseに戻すeffectを追加する

## 3. 回帰確認・アーカイブ

- [x] 3.1 既存の全テストスイート（unit/integration/e2e）・typecheck・lint・buildがgreenであることを確認する
- [x] 3.2 `openspec archive fix-plan7-minor-issues` でアーカイブし、
      `openspec/specs/firebase-session-reliability/spec.md` に統合されたことを確認する
