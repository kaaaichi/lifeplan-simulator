import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      // interface契約を満たすための意図的な未使用引数は `_` 接頭辞で許容する
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // 抽出スクリプトは Node ランタイム（process/console 等）
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
