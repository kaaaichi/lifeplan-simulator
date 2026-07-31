import { useDraftStore } from '../../../store/draftStore'
import type { NamedBalance } from '../../../types'
import { TextField } from '../fields/TextField'
import { MoneyField } from '../fields/MoneyField'

function BalanceList({
  legend,
  items,
  newLabel,
  onChange,
}: {
  legend: string
  items: NamedBalance[]
  newLabel: string
  onChange: (items: NamedBalance[]) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {items.map((item, i) => (
        <div key={i}>
          <TextField label="名称" value={item.label} onCommit={(label) => onChange(items.map((x, j) => (j === i ? { ...x, label } : x)))} />
          <MoneyField label="残高" value={item.balance} onCommit={(balance) => onChange(items.map((x, j) => (j === i ? { ...x, balance } : x)))} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}>削除</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { label: newLabel, balance: 0 }])}>追加</button>
    </fieldset>
  )
}

export function AssetsSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  return (
    <div>
      <BalanceList
        legend="銀行口座"
        items={draft.assets.bankAccounts}
        newLabel="新しい口座"
        onChange={(bankAccounts) => update((prev) => ({ ...prev, assets: { ...prev.assets, bankAccounts } }))}
      />
      <BalanceList
        legend="投資口座"
        items={draft.assets.investments}
        newLabel="新しい投資口座"
        onChange={(investments) => update((prev) => ({ ...prev, assets: { ...prev.assets, investments } }))}
      />
    </div>
  )
}
