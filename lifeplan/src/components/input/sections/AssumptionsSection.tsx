import { useDraftStore } from '../../../store/draftStore'
import type { Assumptions } from '../../../types'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'
import { availableIncomeBands, educationMaster } from '../../../masterData/education'

const incomeBands = availableIncomeBands(educationMaster)

export function AssumptionsSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const a = draft.assumptions
  const setAssumptions = (patch: Partial<Assumptions>) =>
    update((prev) => ({ ...prev, assumptions: { ...prev.assumptions, ...patch } }))

  // §14.4: endAge > baseYear 時点の primary 年齢
  const primaryAgeAtBase = draft.baseYear - draft.members.primary.birthYear
  const minEndAge = primaryAgeAtBase + 1
  const endYear = draft.members.primary.birthYear + a.endAge

  // §14.4: endAge はクロスフィールド不変条件(pensionStartAge <= endAge, workUntilAge <= endAge)の上限。
  // endAge を引き下げた際、既存の pensionStartAge/workUntilAge が範囲外のまま残らないよう同一更新でclampする。
  const commitEndAge = (endAge: number) =>
    update((prev) => {
      const spouse = prev.members.spouse
      return {
        ...prev,
        assumptions: { ...prev.assumptions, endAge, pensionStartAge: Math.min(prev.assumptions.pensionStartAge, endAge) },
        members: {
          ...prev.members,
          primary: { ...prev.members.primary, workUntilAge: Math.min(prev.members.primary.workUntilAge, endAge) },
          spouse: spouse ? { ...spouse, workUntilAge: Math.min(spouse.workUntilAge, endAge) } : spouse,
        },
      }
    })

  const toggleCoastFire = (checked: boolean) => {
    update((prev) => {
      const rest = { ...prev.assumptions }
      delete rest.coastFireTargetAmount
      return {
        ...prev,
        assumptions: checked ? { ...rest, coastFireTargetAmount: 40_000_000 } : rest,
      }
    })
  }

  const toggleCoastFireTargetAge = (checked: boolean) => {
    update((prev) => {
      const rest = { ...prev.assumptions }
      delete rest.coastFireTargetAge
      return {
        ...prev,
        assumptions: checked ? { ...rest, coastFireTargetAge: 65 } : rest,
      }
    })
  }

  const toggleCoastFireReturnRate = (checked: boolean) => {
    update((prev) => {
      const rest = { ...prev.assumptions }
      delete rest.coastFireReturnRate
      return {
        ...prev,
        assumptions: checked ? { ...rest, coastFireReturnRate: 4 } : rest,
      }
    })
  }

  const oneTime = a.oneTimeInvestments ?? []
  const setOneTime = (rows: { year: number; amount: number }[]) =>
    setAssumptions({ oneTimeInvestments: rows.length > 0 ? rows : undefined })

  return (
    <div>
      <NumberField label="利回り(中央)" value={a.investmentReturnRate} min={-100} max={100} step={0.1} suffix="%" onCommit={(investmentReturnRate) => setAssumptions({ investmentReturnRate })} />
      <NumberField label="利回り(楽観)" value={a.returnRateOptimistic} min={-100} max={100} step={0.1} suffix="%" onCommit={(returnRateOptimistic) => setAssumptions({ returnRateOptimistic })} />
      <NumberField label="利回り(悲観)" value={a.returnRatePessimistic} min={-100} max={100} step={0.1} suffix="%" onCommit={(returnRatePessimistic) => setAssumptions({ returnRatePessimistic })} />
      <NumberField label="インフレ率" value={a.inflationRate} min={-100} max={100} step={0.1} suffix="%" onCommit={(inflationRate) => setAssumptions({ inflationRate })} />
      <NumberField label="終了年齢" value={a.endAge} min={minEndAge} max={120} suffix="歳" onCommit={commitEndAge} />
      <MoneyField label="年間投資額" value={a.annualInvestmentContribution} onCommit={(annualInvestmentContribution) => setAssumptions({ annualInvestmentContribution })} />
      <NumberField label="年金開始年齢" value={a.pensionStartAge} min={60} max={a.endAge} suffix="歳" onCommit={(pensionStartAge) => setAssumptions({ pensionStartAge })} />
      <MoneyField label="年金額(1人あたり年)" value={a.pensionAnnualPerPerson} onCommit={(pensionAnnualPerPerson) => setAssumptions({ pensionAnnualPerPerson })} />
      <MoneyField label="生活防衛資金" value={a.emergencyFundCash} onCommit={(emergencyFundCash) => setAssumptions({ emergencyFundCash })} />
      <MoneyField label="保育料(月・0〜2歳児クラス)" value={a.nurseryFeeMonthly} onCommit={(nurseryFeeMonthly) => setAssumptions({ nurseryFeeMonthly })} />
      <label>
        教育費の参照年収帯
        <select value={a.educationIncomeBand} onChange={(e) => setAssumptions({ educationIncomeBand: e.target.value })}>
          {incomeBands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>

      <label>
        <input type="checkbox" checked={a.coastFireTargetAmount !== undefined} onChange={(e) => toggleCoastFire(e.target.checked)} />
        コーストFIRE目標額を上書きする
      </label>
      {a.coastFireTargetAmount !== undefined && (
        <MoneyField label="コーストFIRE目標額" value={a.coastFireTargetAmount} onCommit={(coastFireTargetAmount) => setAssumptions({ coastFireTargetAmount })} />
      )}

      <label>
        <input type="checkbox" checked={a.coastFireTargetAge !== undefined} onChange={(e) => toggleCoastFireTargetAge(e.target.checked)} />
        コーストFIRE目標年齢を上書きする
      </label>
      {a.coastFireTargetAge !== undefined && (
        <NumberField label="コーストFIRE目標年齢" value={a.coastFireTargetAge} min={0} max={120} suffix="歳" onCommit={(coastFireTargetAge) => setAssumptions({ coastFireTargetAge })} />
      )}

      <label>
        <input type="checkbox" checked={a.coastFireReturnRate !== undefined} onChange={(e) => toggleCoastFireReturnRate(e.target.checked)} />
        コーストFIRE想定利回りを上書きする
      </label>
      {a.coastFireReturnRate !== undefined && (
        <NumberField label="コーストFIRE想定利回り" value={a.coastFireReturnRate} min={-100} max={100} step={0.1} suffix="%" onCommit={(coastFireReturnRate) => setAssumptions({ coastFireReturnRate })} />
      )}

      <fieldset>
        <legend>スポット投資</legend>
        {oneTime.map((row, i) => (
          <div key={i}>
            <NumberField label={`年（${i + 1}）`} value={row.year} min={draft.baseYear} max={endYear} suffix="年" onCommit={(year) => setOneTime(oneTime.map((x, j) => (j === i ? { ...x, year } : x)))} />
            <MoneyField label={`金額（${i + 1}）`} value={row.amount} onCommit={(amount) => setOneTime(oneTime.map((x, j) => (j === i ? { ...x, amount } : x)))} />
            <button type="button" onClick={() => setOneTime(oneTime.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setOneTime([...oneTime, { year: draft.baseYear, amount: 1_000_000 }])}>スポット投資を追加</button>
      </fieldset>
    </div>
  )
}
