export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}
