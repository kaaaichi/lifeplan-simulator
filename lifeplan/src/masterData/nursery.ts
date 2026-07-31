// src/masterData/nursery.ts
// 保育料(0〜2歳児クラス)の月額そのものは自治体の「利用者負担(保育料)徴収基準表」で決まり、
// 世帯の市区町村民税所得割課税額の階層と保育必要量(保育標準時間/短時間)に依存する。
// 自治体・階層・世帯所得に固有の値であるためマスタには持たず、
// Assumptions.nurseryFeeMonthly として利用者が入力する(§types.ts)。
// このモジュールが持つのは、自治体によらず共通の多子軽減ルールのみ。
//
// 参考値の調べ方: 居住自治体が公開している「利用者負担(保育料)徴収基準表」で、
// 世帯の市区町村民税所得割課税額に対応する階層の 3歳未満児・保育標準時間の額を見る。

/** 幼児教育・保育無償化により保育料が無償となる学齢index(3〜5歳児クラス)の下限。 */
export const NURSERY_FREE_FROM_GRADE_INDEX = 3

// 未就学(学齢index 0〜5)の兄弟姉妹における出生順位(0-based, 年長い順)に応じた軽減率。
// 一番上=全額、上から2番目=半額、上から3番目以降=無料。
// 3〜5歳児クラスの子も順位カウントに含めるが、実際の課金対象は0〜2歳児クラスの子のみ
// (呼び出し側でフィルタする)。
export function nurseryDiscountRate(rankAmongPreschoolSiblings: number): number {
  if (rankAmongPreschoolSiblings === 0) return 1
  if (rankAmongPreschoolSiblings === 1) return 0.5
  return 0
}
