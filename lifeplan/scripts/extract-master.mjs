// scripts/extract-master.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'  // devDependencyに追加
// (fflateが無ければ zlib+手動展開。簡便のため fflate を使う)

const xlsxPath = process.argv[2]
if (!xlsxPath) { console.error('usage: node extract-master.mjs <xlsx>'); process.exit(1) }

const zip = unzipSync(new Uint8Array(readFileSync(xlsxPath)))
const xml = (p) => strFromU8(zip[p])

// shared strings
const ss = []
{
  const s = xml('xl/sharedStrings.xml')
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1])
    ss.push(texts.join(''))
  }
}
// workbook sheet name -> file
const wbRels = xml('xl/_rels/workbook.xml.rels')
const relMap = Object.fromEntries([...wbRels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]))
const wb = xml('xl/workbook.xml')
const sheetMap = Object.fromEntries([...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)].map(m => [m[1], 'xl/' + relMap[m[2]]]))

function cells(sheetName) {
  const x = xml(sheetMap[sheetName])
  const out = {} // 'A12' -> value(number|string)
  // Use full cell-element match to handle cells with <f> before <v> (formula cells with cached values).
  // [^/>]* in attrs prevents matching self-closing tags like <c r="X1" s="5"/> which have no </c>.
  for (const c of x.matchAll(/<c r="([A-Z]+\d+)"([^/>]*)>([\s\S]*?)<\/c>/g)) {
    const [, ref, attrs, inner] = c
    const tMatch = attrs.match(/t="(\w+)"/)
    const t = tMatch ? tMatch[1] : null
    const vMatch = inner.match(/<v>([^<]*)<\/v>/)
    if (!vMatch || vMatch[1] === '') continue
    const v = vMatch[1]
    out[ref] = t === 's' ? ss[+v] : Number(v)
  }
  return out
}
const num = (v) => (typeof v === 'number' ? v : Number(String(v).replace(/[,¥]/g, '')) || 0)

// --- golden series from ライフプランニング表 ---
const lp = cells('ライフプランニング表')
// 列はB..(2025..). 西暦は行1。総資産=行156, 投資残高=行154, 単年度収支=行147
const colLetters = []
for (let i = 0; i < 90; i++) {
  // B, C, ... 単純化: 2文字対応
  let n = i + 1, s = ''
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  colLetters.push(s)
}
const years = [], totalAssets = [], investmentBalance = [], annualCashFlow = []
for (const col of colLetters) {
  const y = lp[col + '1']
  if (y == null) continue
  const yr = num(y)
  if (yr < 2025 || yr > 2110) continue
  years.push(yr)
  totalAssets.push(num(lp[col + '156']))
  investmentBalance.push(num(lp[col + '154']))
  annualCashFlow.push(num(lp[col + '147']))
}
writeFileSync(new URL('../tests/fixtures/golden.json', import.meta.url),
  JSON.stringify({ years, totalAssets, investmentBalance, annualCashFlow }, null, 2))

// --- education master ("800万～999万"帯のみ) from 基礎データ ---
//
// ⚠️ このスクリプトは現行の src/masterData/education.json と乖離している。実行しないこと。
//   - 大学費用: 現行JSONは {tuition, facilityFee, entranceFee} の3項目構成だが、ここは旧構造
//     {tuition, outside} のまま。値も見直し前の旧値(国立 818,000 等)で、コミット e6dccd3
//     「大学費用を一次資料+20%バッファの実額に見直し (#20)」を反映していない。
//   - このまま再実行すると education.json を旧構造・旧値で上書きして壊す。
// 現行データの出典と設計意図は src/masterData/education.ts の冒頭コメントを参照。
//
// L列に "800万～999万公立小1" ラベル, M列=学費, N列=学校外費 が並ぶ領域を走査
const kd = cells('基礎データ')
const edu = { '800万～999万': { 公立: {}, 私立: {} } }
for (let r = 1; r <= 400; r++) {
  const label = kd['L' + r]
  if (typeof label !== 'string') continue
  const m = label.match(/^800万～999万(公立|私立)(小[1-6]|中[1-3]|高[1-3])$/)
  if (!m) continue
  edu['800万～999万'][m[1]][m[2]] = { tuition: num(kd['M' + r]), outside: num(kd['N' + r]) }
}
// 大学: 別途固定（国立/公立/私立文/私立理）。MVPは概算の年額(学費)を定数化。
edu['800万～999万'].大学 = {
  国立: { tuition: 818000, outside: 0 },   // 入学金含む初年度概算→engine側で平準化
  公立: { tuition: 933000, outside: 0 },
  私立文: { tuition: 1100000, outside: 0 },
  私立理: { tuition: 1500000, outside: 0 },
}
writeFileSync(new URL('../src/masterData/education.json', import.meta.url), JSON.stringify(edu, null, 2))
console.log('wrote education.json grades:', Object.keys(edu['800万～999万'].公立).length, 'golden years:', years.length)
