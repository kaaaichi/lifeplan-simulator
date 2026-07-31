// src/types.ts
export type SchoolType = '公立' | '私立'
export type UniversityType = '国立' | '公立' | '私立文' | '私立理' | 'なし'
export type PhonePlan = '大手キャリアスマホ' | '格安simスマホ' | 'ガラケー'
export type ElectricType = 'オール電化' | 'ガス併用'

export interface Schooling {
  elementary: SchoolType
  junior: SchoolType
  high: SchoolType
  university: UniversityType
  remittanceMonthly: number // 大学期の仕送り(月)
}

export interface Member {
  name: string
  birthYear: number
  birthMonth: number
  takeHomeIncome: number // 手取年収(円)
  workUntilAge: number
  phonePlan: PhonePlan
}

export interface Child {
  id: string
  name: string
  birthYear: number
  birthMonth: number
  schooling: Schooling
  allowanceMonthly: number | undefined // 明示値(0を含む)は尊重。未設定(undefined)なら年齢帯デフォルトを使う(engine側=src/engine/expenses.tsで算出)
  phoneFromGrade: number // この学年(早見表index)以上で携帯代計上。小1=6
}

export interface NamedBalance { label: string; balance: number }

export interface Actual {
  year: number
  cashBalance: number
  investmentBalance: number
  note?: string
}

export interface Housing {
  type: '賃貸' | '持ち家'
  rentMonthly: number
  loanMonthly: number
  loanRemainingYears: number
  repairReserveMonthly: number
  propertyTaxAnnual: number
  fireInsuranceAnnual: number
}

export interface Appliance {
  name: string; price: number; lastPurchaseYear: number; lifespanYears: number
}

export interface Assumptions {
  investmentReturnRate: number // % 中央値
  returnRateOptimistic: number
  returnRatePessimistic: number
  inflationRate: number // %
  endAge: number // 主生計者の終了年齢
  annualInvestmentContribution: number
  pensionStartAge: number
  pensionAnnualPerPerson: number
  emergencyFundCash: number // 現金として維持する最低額(円)
  // 教育費マスタ(education.json)のどの世帯年収帯を参照するか。マスタに存在するキーを指定する。
  // 同梱マスタは '800万～999万' の1帯のみ収録(出典: 元スプレッドシート「基礎データ」)。
  // 帯を増やす場合は education.json にキーを追加する。
  educationIncomeBand: string
  // 0〜2歳児クラスの保育料(月額・円)。自治体の「利用者負担(保育料)徴収基準表」の
  // 世帯所得階層で決まるため、居住自治体と市区町村民税所得割課税額に依存する。
  // 3〜5歳児クラスは幼児教育・保育無償化により無償(engine側で対象外)。
  nurseryFeeMonthly: number
  oneTimeInvestments?: { year: number; amount: number }[]
  coastFireTargetAmount?: number // コーストFIRE目標額(円)。未指定なら4000万円
  coastFireTargetAge?: number // コーストFIRE目標年齢。未指定なら65歳
  coastFireReturnRate?: number // % コーストFIRE計算専用の想定利回り(シナリオのinvestmentReturnRateとは独立)。未指定なら4
}

// 一時的/継続的な収支調整イベント(育休による収入減、車購入+ローン返済+維持費など)。
// endYear: null は「無期限に継続する」ことを明示する値(undefinedの「未設定=デフォルト値」とは意味が異なる)。
// kind: '収入' はincomeへ、'支出' はtotalExpenseへannualAmountを加算する(annualCashFlowへの反映は共通)。
// ダッシュボード/CLIの「単年度収入」「単年度支出」列にどちらの変動かが正しく表示されるようにするための区別。
export interface FinancialEvent {
  id: string
  label: string
  kind: '収入' | '支出'
  startYear: number
  endYear: number | null
  annualAmount: number
}

export interface Inputs {
  baseYear: number
  members: { primary: Member; spouse: Member | null; children: Child[] }
  assets: { bankAccounts: NamedBalance[]; investments: NamedBalance[] }
  housing: Housing
  lifestyle: { electricType: ElectricType; internetMonthly: number }
  appliances: Appliance[]
  homeMaintenance: { name: string; price: number; intervalYears: number; lastYear: number }[]
  assumptions: Assumptions
  financialEvents?: FinancialEvent[]
}

export interface ExpenseBreakdown {
  食費: number; 日用品: number; ライフライン: number; 住宅: number
  教育費: number; 家電: number; 住宅大型: number; こづかい: number
  衣服: number; 医療: number; 外食レジャー: number; 雑費: number; 車: number
  保育料: number
}

export interface YearRow {
  year: number
  agePrimary: number
  ageSpouse: number | null
  agesChildren: number[]
  income: number
  expenses: ExpenseBreakdown
  totalExpense: number
  annualCashFlow: number
  investmentContribution: number | null
  investmentReturn: number | null
  investmentBalance: number
  cashBalance: number
  totalAssets: number
  investmentRatio: number
  coastFireNumber: number
  isActual: boolean
  /** baseYear より前の参考実績(§16.9)から合成した行かどうか(§20)。true の場合フロー系の値は不明(0)。 */
  isHistoricalReference?: boolean
}

export interface MasterData {
  education: import('./masterData/education').EducationMaster
  utilities: import('./masterData/utilities').UtilitiesMaster
  pension: import('./masterData/pension').PensionMaster
}
