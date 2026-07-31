import { useDraftStore } from '../../../store/draftStore'
import type { Appliance, Inputs } from '../../../types'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'

type HomeMaintenanceItem = Inputs['homeMaintenance'][number]

export function AppliancesSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const baseYear = draft.baseYear
  const setAppliances = (appliances: Appliance[]) => update((prev) => ({ ...prev, appliances }))
  const setHome = (homeMaintenance: HomeMaintenanceItem[]) => update((prev) => ({ ...prev, homeMaintenance }))

  return (
    <div>
      <fieldset>
        <legend>家電買い替え</legend>
        {draft.appliances.map((a, i) => (
          <div key={i}>
            <TextField label="名称" value={a.name} onCommit={(name) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, name } : x)))} />
            <MoneyField label="価格" value={a.price} onCommit={(price) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, price } : x)))} />
            <NumberField label="最終購入年" value={a.lastPurchaseYear} min={1980} max={baseYear} suffix="年" onCommit={(lastPurchaseYear) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, lastPurchaseYear } : x)))} />
            <NumberField label="寿命" value={a.lifespanYears} min={1} max={50} suffix="年" onCommit={(lifespanYears) => setAppliances(draft.appliances.map((x, j) => (j === i ? { ...x, lifespanYears } : x)))} />
            <button type="button" onClick={() => setAppliances(draft.appliances.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setAppliances([...draft.appliances, { name: '新しい家電', price: 100_000, lastPurchaseYear: baseYear, lifespanYears: 10 }])}>追加</button>
      </fieldset>
      <fieldset>
        <legend>住宅メンテナンス</legend>
        {draft.homeMaintenance.map((m, i) => (
          <div key={i}>
            <TextField label="名称" value={m.name} onCommit={(name) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, name } : x)))} />
            <MoneyField label="価格" value={m.price} onCommit={(price) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, price } : x)))} />
            <NumberField label="周期" value={m.intervalYears} min={1} max={50} suffix="年" onCommit={(intervalYears) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, intervalYears } : x)))} />
            <NumberField label="最終実施年" value={m.lastYear} min={1980} max={baseYear} suffix="年" onCommit={(lastYear) => setHome(draft.homeMaintenance.map((x, j) => (j === i ? { ...x, lastYear } : x)))} />
            <button type="button" onClick={() => setHome(draft.homeMaintenance.filter((_, j) => j !== i))}>削除</button>
          </div>
        ))}
        <button type="button" onClick={() => setHome([...draft.homeMaintenance, { name: '外壁塗装', price: 1_000_000, intervalYears: 15, lastYear: baseYear }])}>追加</button>
      </fieldset>
    </div>
  )
}
