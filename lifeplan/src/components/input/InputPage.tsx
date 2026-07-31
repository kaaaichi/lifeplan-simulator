import { useEffect, type ReactNode } from 'react'
import { useBlocker, useParams, Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/householdStore'
import { useDraftStore } from '../../store/draftStore'
import { MembersSection } from './sections/MembersSection'
import { AssetsSection } from './sections/AssetsSection'
import { HousingSection } from './sections/HousingSection'
import { LifestyleSection } from './sections/LifestyleSection'
import { AppliancesSection } from './sections/AppliancesSection'
import { AssumptionsSection } from './sections/AssumptionsSection'
import { PreviewPane } from './PreviewPane'
import { SaveBar } from './SaveBar'
import styles from './InputPage.module.css'

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary>{title}</summary>
      {children}
    </details>
  )
}

export function InputPage() {
  const doc = useHouseholdStore((s) => s.doc)
  const status = useHouseholdStore((s) => s.status)
  const draft = useDraftStore((s) => s.draft)
  const dirty = useDraftStore((s) => s.dirty)
  const draftScenarioId = useDraftStore((s) => s.scenarioId)
  const beginEdit = useDraftStore((s) => s.beginEdit)
  const discard = useDraftStore((s) => s.discard)
  const { scenarioId: paramScenarioId } = useParams()

  // 編集対象: URL パラメータ優先、無ければ activeScenarioId(§15.1)。
  // - パラメータ無し: 非 dirty のときだけ doc に追随(§14.3 step 6。dirty 中の
  //   activeScenarioId 切替でドラフトを捨てない既存契約を維持)
  // - パラメータ有り: 対象が変わったら dirty でも張り直す(遷移は useBlocker の
  //   confirm を通過済み=編集破棄をユーザーが了承済み)
  useEffect(() => {
    if (status !== 'ready' || !doc) return
    const targetId = paramScenarioId ?? doc.activeScenarioId
    const needsRebase = paramScenarioId ? draftScenarioId !== targetId || !dirty : !dirty
    if (!needsRebase) return
    const scenario = doc.scenarios.find((s) => s.id === targetId)
    if (scenario) beginEdit(scenario.id, scenario.inputs)
  }, [status, doc, dirty, draftScenarioId, beginEdit, paramScenarioId])

  // dirty 中の画面遷移ガード(router blocker)
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('未保存の変更があります。移動しますか?')) {
        // 遷移先で beginEdit が正しく張り直されるよう、進む前にドラフトを破棄する
        // (§15: confirm は編集破棄の同意。discard しないと dirty ドラフトが
        // 遷移先の URL に生き残ってしまう=Finding 2)
        discard()
        blocker.proceed()
      } else {
        blocker.reset()
      }
    }
  }, [blocker, discard])

  // dirty 中のリロード/タブ閉じガード
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (status === 'error') {
    return (
      <main className={styles.main}>
        <p role="alert">データの読み込みに失敗したため、編集できません。アプリを更新してください。</p>
      </main>
    )
  }
  if (status === 'ready' && doc && paramScenarioId && !doc.scenarios.some((s) => s.id === paramScenarioId)) {
    return (
      <main className={styles.main}>
        <p role="alert">シナリオが見つかりません。</p>
        <Link to="/scenarios">シナリオ管理へ</Link>
      </main>
    )
  }
  if (!doc || !draft) {
    return (
      <main className={styles.main}>
        <p>読み込み中...</p>
      </main>
    )
  }

  return (
    <main className={styles.main}>
      <div>
        <h2>入力</h2>
        <p className={styles.baseYear}>基準年: {doc.baseYear}年（変更不可）</p>
        <Section title="世帯メンバー" defaultOpen>
          <MembersSection />
        </Section>
        <Section title="資産">
          <AssetsSection />
        </Section>
        <Section title="住居">
          <HousingSection />
        </Section>
        <Section title="生活スタイル">
          <LifestyleSection />
        </Section>
        <Section title="家電・住宅メンテナンス">
          <AppliancesSection />
        </Section>
        <Section title="前提">
          <AssumptionsSection />
        </Section>
        <SaveBar />
      </div>
      <PreviewPane />
    </main>
  )
}
