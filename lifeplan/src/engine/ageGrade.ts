export function ageAt(birthYear: number, birthMonth: number, year: number): number {
  // その年(year)の4/1時点の満年齢
  let age = year - birthYear
  if (birthMonth >= 4) age -= 1 // 4/1時点でまだ誕生日前
  return age
}

export function gradeIndexAt(birthYear: number, birthMonth: number, year: number): number {
  // 早見表index: 4/1時点の学齢。満6歳の年度=小1(index6)。
  // index = (year年4/1時点の満年齢) + (早生まれ補正)
  const ageApril = year - birthYear - (birthMonth >= 4 ? 1 : 0)
  // 学齢index = 4/1時点の満年齢(ageApril)。0歳=0 … 満6歳の年度=小1(6) … 大1=18。
  // ageApril が4/1基準の年度オフセット(早生まれ/遅生まれ)を既に内包するため追加補正は不要。
  const index = ageApril
  if (index < 0 || index > 21) return -1
  return index
}
