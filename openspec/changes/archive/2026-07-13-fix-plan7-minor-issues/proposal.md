## Why

Plan7（ログイン画面＋Firebase実配線）の最終レビューで、Firebaseセッション状態のエッジケースに対する
防御的処理が2件、Minor指摘として保留されていた。放置すると権限失効時にUIが古いデータのまま止まる、
サインアウト後の再サインインで古いrepositoryを使い続けるといった実害につながるため対応する。

## What Changes

- `householdStore.load` が `repository.subscribe` に onError コールバックを渡し、購読エラー発生時に
  `status` を `'error'` に遷移させる
- `FirebaseAuthGate` が認証 `status` が `'allowed'` から外れたタイミングで `repositoryReady` を
  false にリセットし、次に `'allowed'` になったとき repository を再差し替えする

## Capabilities

### New Capabilities
- `firebase-session-reliability`: Firebaseセッション（認証状態・Firestore購読）のエッジケースにおける
  状態整合性を扱う

### Modified Capabilities

## Impact

- `lifeplan/src/store/householdStore.ts`
- `lifeplan/src/components/auth/FirebaseAuthGate.tsx`
- 新規ファイルは作らず、既存の `lifeplan/tests/store/householdStore.test.ts` /
  `lifeplan/src/components/auth/FirebaseAuthGate.test.tsx` に受け入れ試験を追加する

design.md は作成しない: 単一ファイルずつの独立した防御的修正であり、cross-cuttingな変更・新規依存・
移行・大きなあいまいさのいずれにも該当しないため（OpenSpecのdesign.md作成基準に従う判断）。
