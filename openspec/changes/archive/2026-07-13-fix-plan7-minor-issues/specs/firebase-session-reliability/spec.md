## ADDED Requirements

### Requirement: householdStore は購読エラーを status に反映する
`householdStore.load` はリポジトリの `subscribe` 購読が初回発火後にエラーを報告した場合、`status` を
`'error'` に遷移させ、エラー内容を `error` に保持しなければならない(SHALL)。

#### Scenario: 購読エラー発火時にstatusがerrorになる
- **WHEN** `load` 完了後の購読が `onError` コールバックでエラーを報告する
- **THEN** `status` が `'error'` になり、`error` に発火したエラーが保持される

### Requirement: FirebaseAuthGate はセッション終了時に repository 差し替え状態をリセットする
`FirebaseAuthGate` は認証 `status` が `'allowed'` 以外に遷移したとき `repositoryReady` を false に
戻さなければならない(SHALL)。これにより次に `'allowed'` になったとき `repository` が再差し替えされる。

#### Scenario: サインアウト後に再サインインするとrepositoryが再差し替えされる
- **WHEN** `status` が `'allowed'` から `'signedOut'` に変わり、その後別のセッションで再び `'allowed'` になる
- **THEN** `createRepository` が再度呼ばれ、`useHouseholdStore` の `repository` が新しいインスタンスに
  差し替わる
