import { NumberField, type NumberFieldProps } from './NumberField'

export type MoneyFieldProps = Omit<NumberFieldProps, 'suffix'>

export function MoneyField(props: MoneyFieldProps) {
  return <NumberField {...props} min={props.min ?? 0} suffix="円" />
}
