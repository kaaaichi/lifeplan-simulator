/**
 * 元利均等返済方式における月次返済額を計算する。
 *
 * **注**: この関数はエンジン内部では使用されません（意図的な設計）。
 * `/lifeplan-simulate` スラッシュコマンド経由で、ユーザーがヒアリングしたローン条件から
 * `FinancialEvent.annualAmount` を算出する際に、この計算式をClaude自身が再現する際に
 * 参照するドキュメンテーション目的で存在します。
 *
 * @param principal - 借入元本（円）
 * @param annualRatePercent - 年利（パーセンテージ、例: 1.5は1.5%）
 * @param years - 返済年数
 * @returns 月次返済額（円）
 */
export function monthlyLoanPayment(
  principal: number,
  annualRatePercent: number,
  years: number
): number {
  // 金利が0%の場合は単純な均等割り（ゼロ除算を回避）
  if (annualRatePercent === 0) {
    return principal / (years * 12)
  }

  // 正の金利での元利均等返済計算
  // PMT = P × r × (1+r)^n / ((1+r)^n - 1)
  // where:
  //   r = annualRatePercent / 100 / 12 (月利)
  //   n = years * 12 (返済回数)

  const r = annualRatePercent / 100 / 12 // 月利
  const n = years * 12 // 返済回数
  const factor = Math.pow(1 + r, n) // (1+r)^n

  return (principal * r * factor) / (factor - 1)
}
