// scripts/simulateCli.ts が実際に `npx tsx` で起動可能であることを保証する回帰テスト。
// 既存のCLIロジックのテスト（simulateCliArgs.test.ts/simulateCliLogic.test.ts/simulateCli.emu.test.ts）は
// main()/parseArgs等をVitestプロセス内で直接importして呼び出すため、Vite環境（import.meta.glob等が使える）
// でしか検証されていなかった。実際の利用シーンである `npx tsx scripts/simulateCli.ts ...` は
// 素のNode.js ESMローダーで動くため、Vite専用APIに依存するコードがあるとモジュールロード時に
// サイレントにクラッシュしうる。このテストはサブプロセスとして実際に起動し、その経路を検証する。
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const CLI_PATH = path.resolve(__dirname, '../../scripts/simulateCli.ts')

describe('scripts/simulateCli.ts（npx tsx サブプロセス起動）', () => {
  it('引数無しで起動してもモジュールロード時にcrashしない（parseArgsのusageエラーで終了する）', () => {
    let stderr = ''
    let status = 0
    try {
      execFileSync('npx', ['tsx', CLI_PATH], { encoding: 'utf-8', stdio: 'pipe' })
    } catch (err) {
      const e = err as { status: number; stderr: string }
      status = e.status
      stderr = e.stderr
    }
    expect(stderr).not.toContain('import.meta.glob')
    expect(stderr).not.toContain('is not a function')
    expect(stderr).toContain('missing required argument')
    expect(status).toBe(1)
  })
})
