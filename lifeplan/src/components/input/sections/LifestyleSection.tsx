import { useDraftStore } from '../../../store/draftStore'
import type { ElectricType } from '../../../types'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const ELECTRIC_TYPES = ['オール電化', 'ガス併用'] as const satisfies readonly ElectricType[]

export function LifestyleSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  return (
    <div>
      <SelectField
        label="電気契約"
        value={draft.lifestyle.electricType}
        options={ELECTRIC_TYPES}
        onCommit={(electricType) => update((prev) => ({ ...prev, lifestyle: { ...prev.lifestyle, electricType } }))}
      />
      <MoneyField
        label="インターネット(月)"
        value={draft.lifestyle.internetMonthly}
        onCommit={(internetMonthly) => update((prev) => ({ ...prev, lifestyle: { ...prev.lifestyle, internetMonthly } }))}
      />
    </div>
  )
}
