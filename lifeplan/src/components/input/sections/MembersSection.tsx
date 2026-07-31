import { useDraftStore } from '../../../store/draftStore'
import type { Child, Member, PhonePlan, SchoolType, UniversityType } from '../../../types'
import { TextField } from '../fields/TextField'
import { NumberField } from '../fields/NumberField'
import { MoneyField } from '../fields/MoneyField'
import { SelectField } from '../fields/SelectField'

const PHONE_PLANS = ['大手キャリアスマホ', '格安simスマホ', 'ガラケー'] as const satisfies readonly PhonePlan[]
const SCHOOL_TYPES = ['公立', '私立'] as const satisfies readonly SchoolType[]
const UNIVERSITY_TYPES = ['国立', '公立', '私立文', '私立理', 'なし'] as const satisfies readonly UniversityType[]

function MemberFields({
  legend,
  member,
  baseYear,
  maxAge,
  onChange,
}: {
  legend: string
  member: Member
  baseYear: number
  maxAge: number
  onChange: (m: Member) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <TextField label="名前" value={member.name} onCommit={(name) => onChange({ ...member, name })} />
      <NumberField label="生まれ年" value={member.birthYear} min={1900} max={baseYear} suffix="年" onCommit={(birthYear) => onChange({ ...member, birthYear })} />
      <NumberField label="生まれ月" value={member.birthMonth} min={1} max={12} suffix="月" onCommit={(birthMonth) => onChange({ ...member, birthMonth })} />
      <MoneyField label="手取り年収" value={member.takeHomeIncome} onCommit={(takeHomeIncome) => onChange({ ...member, takeHomeIncome })} />
      <NumberField label="就労終了年齢" value={member.workUntilAge} min={0} max={maxAge} suffix="歳" onCommit={(workUntilAge) => onChange({ ...member, workUntilAge })} />
      <SelectField label="携帯プラン" value={member.phonePlan} options={PHONE_PLANS} onCommit={(phonePlan) => onChange({ ...member, phonePlan })} />
    </fieldset>
  )
}

function ChildFields({
  child,
  baseYear,
  onChange,
  onRemove,
}: {
  child: Child
  baseYear: number
  onChange: (c: Child) => void
  onRemove: () => void
}) {
  const schooling = child.schooling
  const setSchooling = (patch: Partial<Child['schooling']>) => onChange({ ...child, schooling: { ...schooling, ...patch } })
  return (
    <fieldset>
      <legend>{child.name}</legend>
      <TextField label="名前" value={child.name} onCommit={(name) => onChange({ ...child, name })} />
      <NumberField label="生まれ年" value={child.birthYear} min={1900} max={baseYear + 30} suffix="年" onCommit={(birthYear) => onChange({ ...child, birthYear })} />
      <NumberField label="生まれ月" value={child.birthMonth} min={1} max={12} suffix="月" onCommit={(birthMonth) => onChange({ ...child, birthMonth })} />
      <SelectField label="小学校" value={schooling.elementary} options={SCHOOL_TYPES} onCommit={(elementary) => setSchooling({ elementary })} />
      <SelectField label="中学校" value={schooling.junior} options={SCHOOL_TYPES} onCommit={(junior) => setSchooling({ junior })} />
      <SelectField label="高校" value={schooling.high} options={SCHOOL_TYPES} onCommit={(high) => setSchooling({ high })} />
      <SelectField label="大学" value={schooling.university} options={UNIVERSITY_TYPES} onCommit={(university) => setSchooling({ university })} />
      <MoneyField label="大学期の仕送り(月)" value={schooling.remittanceMonthly} onCommit={(remittanceMonthly) => setSchooling({ remittanceMonthly })} />
      <label>
        <input
          type="checkbox"
          checked={child.allowanceMonthly === undefined}
          onChange={(e) => onChange({ ...child, allowanceMonthly: e.target.checked ? undefined : 0 })}
        />
        お小遣いを年齢に応じて自動計算する
      </label>
      {child.allowanceMonthly !== undefined && (
        <MoneyField label="こづかい(月)" value={child.allowanceMonthly} onCommit={(allowanceMonthly) => onChange({ ...child, allowanceMonthly })} />
      )}
      <NumberField label="携帯開始学年(小1=6)" value={child.phoneFromGrade} min={0} max={22} onCommit={(phoneFromGrade) => onChange({ ...child, phoneFromGrade })} />
      <button type="button" onClick={onRemove}>削除</button>
    </fieldset>
  )
}

export function MembersSection() {
  const draft = useDraftStore((s) => s.draft)
  const update = useDraftStore((s) => s.update)
  if (!draft) return null

  const { primary, spouse, children } = draft.members
  const maxAge = draft.assumptions.endAge

  const setPrimary = (m: Member) => update((prev) => ({ ...prev, members: { ...prev.members, primary: m } }))
  const setSpouse = (m: Member | null) => update((prev) => ({ ...prev, members: { ...prev.members, spouse: m } }))
  const setChildren = (cs: Child[]) => update((prev) => ({ ...prev, members: { ...prev.members, children: cs } }))

  const toggleSpouse = (checked: boolean) => {
    if (checked) {
      setSpouse({ name: '配偶者', birthYear: primary.birthYear, birthMonth: 1, takeHomeIncome: 0, workUntilAge: 65, phonePlan: '格安simスマホ' })
    } else if (window.confirm('配偶者の入力内容は破棄されます。よろしいですか?')) {
      setSpouse(null)
    }
  }

  const addChild = () => {
    setChildren([
      ...children,
      {
        id: crypto.randomUUID(),
        name: `第${children.length + 1}子`,
        birthYear: draft.baseYear,
        birthMonth: 4,
        schooling: { elementary: '公立', junior: '公立', high: '公立', university: '国立', remittanceMonthly: 0 },
        allowanceMonthly: undefined,
        phoneFromGrade: 6,
      },
    ])
  }

  return (
    <div>
      <MemberFields legend="世帯主" member={primary} baseYear={draft.baseYear} maxAge={maxAge} onChange={setPrimary} />
      <label>
        <input type="checkbox" checked={spouse !== null} onChange={(e) => toggleSpouse(e.target.checked)} />
        配偶者あり
      </label>
      {spouse && <MemberFields legend="配偶者" member={spouse} baseYear={draft.baseYear} maxAge={maxAge} onChange={setSpouse} />}
      {children.map((c) => (
        <ChildFields
          key={c.id}
          child={c}
          baseYear={draft.baseYear}
          onChange={(next) => setChildren(children.map((x) => (x.id === c.id ? next : x)))}
          onRemove={() => setChildren(children.filter((x) => x.id !== c.id))}
        />
      ))}
      <button type="button" onClick={addChild}>子を追加</button>
    </div>
  )
}
