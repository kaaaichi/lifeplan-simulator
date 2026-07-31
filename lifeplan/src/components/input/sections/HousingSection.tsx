import { useDraftStore } from '../../../store/draftStore'
import type { Housing } from '../../../types'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const HOUSING_TYPES = ['賃貸', '持ち家'] as const satisfies readonly Housing['type'][]

export function HousingSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const housing = draft.housing
  const setHousing = (patch: Partial<Housing>) => update((prev) => ({ ...prev, housing: { ...prev.housing, ...patch } }))

  return (
    <div>
      <SelectField label="住居タイプ" value={housing.type} options={HOUSING_TYPES} onCommit={(type) => setHousing({ type })} />
      {housing.type === '賃貸' && (
        <MoneyField label="家賃(月)" value={housing.rentMonthly} onCommit={(rentMonthly) => setHousing({ rentMonthly })} />
      )}
      {housing.type === '持ち家' && (
        <>
          <MoneyField label="ローン返済(月)" value={housing.loanMonthly} onCommit={(loanMonthly) => setHousing({ loanMonthly })} />
          <NumberField label="ローン残年数" value={housing.loanRemainingYears} min={0} max={50} suffix="年" onCommit={(loanRemainingYears) => setHousing({ loanRemainingYears })} />
          <MoneyField label="修繕積立(月)" value={housing.repairReserveMonthly} onCommit={(repairReserveMonthly) => setHousing({ repairReserveMonthly })} />
          <MoneyField label="固定資産税(年)" value={housing.propertyTaxAnnual} onCommit={(propertyTaxAnnual) => setHousing({ propertyTaxAnnual })} />
          <MoneyField label="火災保険(年)" value={housing.fireInsuranceAnnual} onCommit={(fireInsuranceAnnual) => setHousing({ fireInsuranceAnnual })} />
        </>
      )}
    </div>
  )
}
