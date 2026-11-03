// 症状×条件の一覧ページ（/sagasu/）のデータと判定
// - data/medicines.json を読み、成分データだけで判定する（医療判断はしない）
// - 「眠気の注意がある成分」は成分名リストと drowsy フラグのどちらかで判定（どちらかに当たれば除く＝安全側）
// - id 1,000,000 以上は 2026-08-15 取り込み分で成分が別の製品とずれている例が多いため、修正まで一覧から外す
import fs from 'fs'
import path from 'path'

export type Med = {
  id: number
  cat: string
  name: string
  maker: string
  risk: number | null
  drowsy: boolean
  symptoms: string[]
  ings: string[]
  itype?: string | null
}

type Raw = { updated_at?: string; medicines?: Med[] } | Med[]

let cache: { meds: Med[]; updatedAt: string } | null = null

function load() {
  if (cache) return cache
  const raw = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'medicines.json'), 'utf8'),
  ) as Raw
  const meds = Array.isArray(raw) ? raw : raw.medicines ?? []
  const updatedAt = Array.isArray(raw) ? '' : raw.updated_at ?? ''
  cache = { meds, updatedAt }
  return cache
}

// 薬ページのURL（形が違う場合はここだけ直す）
export function medicineHref(m: Med) {
  return `/medicines/${m.id}`
}

const ingName = (s: string) => s.replace(/[(（[［].*$/, '').trim()
const names = (m: Med) => m.ings.map(ingName)
const hasAny = (m: Med, keys: string[]) =>
  names(m).some((n) => keys.some((k) => n.includes(k)))
const sym = (m: Med, ...s: string[]) => s.some((x) => m.symptoms.includes(x))

export const SEDATING = [
  'クロルフェニラミン', 'ジフェンヒドラミン', 'カルビノキサミン', 'クレマスチン',
  'ジフェニルピラリン', 'プロメタジン', 'メキタジン', 'トリプロリジン', 'シプロヘプタジン',
  'アリメマジン', 'イソチペンジル', 'ケトチフェン', 'エピナスチン', 'セチリジン', 'エバスチン',
  'アゼラスチン', 'ベポタスチン', 'ジメンヒドリナート', 'メクリジン', 'スコポラミン',
  'ジヒドロコデイン', 'コデイン', 'ブロモバレリル尿素', 'ブロムワレリル尿素',
  'アリルイソプロピルアセチル尿素',
]
export const CAFFEINE = ['カフェイン']
export const STEROID = [
  'ヒドロコルチゾン', 'プレドニゾロン', 'デキサメタゾン', 'ベタメタゾン', 'コルチゾン',
  'フルオシノロン', 'クロベタゾン', 'ベクロメタゾン', 'モメタゾン', 'フルチカゾン', 'トリアムシノロン',
]
const ANALGESIC = [
  'アセトアミノフェン', 'イブプロフェン', 'ロキソプロフェン', 'アセチルサリチル酸', 'アスピリン',
  'エテンザミド', 'イソプロピルアンチピリン', 'ナプロキセン', 'サザピリン', 'サリチルアミド',
]
const EYE_ALLERGY = ['クロモグリク', 'クロルフェニラミン', 'ケトチフェン', 'ペミロラスト', 'トラニラスト', 'アシタザノラスト', 'ジフェンヒドラミン']
const NOSE = ['鼻水', '鼻づまり', 'くしゃみ', '花粉症']
const KIDS = /小児|こども|子ども|子供|キッズ|ジュニア|幼児|ベビー/
const ORAL_FORM = /内服|シロップ|ドリンク|錠|カプセル|顆粒|細粒|丸|散/

export const isDrowsy = (m: Med) => m.drowsy === true || hasAny(m, SEDATING)
const isSogo = (m: Med) => m.cat === 'cold' && sym(m, ...NOSE) && sym(m, '発熱', 'せき', 'のど痛')

type SymptomDef = { label: string; noun: string; test: (m: Med) => boolean }
export const SYMPTOMS: Record<string, SymptomDef> = {
  kaze: { label: '風邪薬（総合かぜ薬）', noun: '風邪薬', test: isSogo },
  bien: {
    label: '鼻炎薬・花粉症の薬',
    noun: '鼻炎薬',
    test: (m) => m.cat === 'nose' || m.cat === 'allergy' || (m.cat === 'cold' && sym(m, ...NOSE) && !isSogo(m)),
  },
  seki: { label: '咳止め・たんの薬', noun: '咳止め', test: (m) => m.cat === 'cough' },
  zutsu: {
    label: '頭痛薬・解熱鎮痛薬',
    noun: '頭痛薬',
    test: (m) => m.cat === 'cold' && hasAny(m, ANALGESIC) && !sym(m, ...NOSE, 'せき'),
  },
  'me-kayumi': {
    label: '目のかゆみの目薬',
    noun: 'かゆみ目薬',
    test: (m) => m.cat === 'eye' && hasAny(m, EYE_ALLERGY) && !ORAL_FORM.test(m.name),
  },
  shisshin: {
    label: '湿疹・かゆみの塗り薬',
    noun: 'かゆみ止め塗り薬',
    test: (m) => m.cat === 'ext_skin' && sym(m, 'かゆみ', '湿疹・かぶれ', '湿疹') && !ORAL_FORM.test(m.name),
  },
}

type CondDef = { label: string; test: (m: Med) => boolean; how: string }
export const CONDS: Record<string, CondDef> = {
  'nemuke-nashi': {
    label: '眠気の注意がある成分を含まない',
    test: (m) => !isDrowsy(m),
    how: `次の成分のどれかを含む製品を除きました：${SEDATING.join('、')}。眠気の注意が出やすい抗ヒスタミン成分・せき止め成分・鎮静成分です。`,
  },
  'caffeine-nashi': {
    label: 'カフェインを含まない',
    test: (m) => !hasAny(m, CAFFEINE),
    how: '無水カフェイン・カフェイン水和物・安息香酸ナトリウムカフェインなど、名前に「カフェイン」が入る成分を含む製品を除きました。',
  },
  kodomo: {
    label: '子ども向け',
    test: (m) => KIDS.test(m.name),
    how: '商品名に「小児用」「こども」「キッズ」「ジュニア」「ベビー」などが入っている製品だけを集めました。何歳から使えるかは製品ごとに違います。',
  },
  tanzai: {
    label: '成分が1つだけ',
    test: (m) => m.ings.length === 1,
    how: '有効成分が1つだけの製品を集めました。漢方薬は1つのエキスとして数えています。',
  },
  'steroid-nashi': {
    label: 'ステロイドを含まない',
    test: (m) => !hasAny(m, STEROID),
    how: `次のステロイド成分を含む製品を除きました：${STEROID.join('、')}。`,
  },
}

export const PAGES: [string, string][] = [
  ['kaze', 'nemuke-nashi'], ['kaze', 'caffeine-nashi'], ['kaze', 'kodomo'],
  ['bien', 'nemuke-nashi'], ['bien', 'caffeine-nashi'], ['bien', 'kodomo'], ['bien', 'tanzai'],
  ['seki', 'nemuke-nashi'], ['seki', 'caffeine-nashi'],
  ['zutsu', 'nemuke-nashi'], ['zutsu', 'caffeine-nashi'], ['zutsu', 'kodomo'], ['zutsu', 'tanzai'],
  ['me-kayumi', 'kodomo'],
  ['shisshin', 'steroid-nashi'],
]
export const MIN_ITEMS = 5

export const isPage = (s: string, c: string) => PAGES.some(([a, b]) => a === s && b === c)

const usable = (m: Med) =>
  m.id < 1000000 && (m.itype === 'otc' || m.itype == null) && m.ings.length > 0

export function getPageData(s: string, c: string) {
  const { meds, updatedAt } = load()
  const S = SYMPTOMS[s]
  const C = CONDS[c]
  const base = meds.filter((m) => usable(m) && S.test(m))
  const seen = new Set<string>()
  const items = base
    .filter(C.test)
    .filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  const baseNames = new Set(base.map((m) => m.name)).size
  const kampo = items.filter((m) => /湯|散|丸/.test(m.name) || m.ings.every((i) => i.includes('エキス'))).length
  return { S, C, items, baseCount: baseNames, kampo, updatedAt }
}

export function pageTitle(s: string, c: string, n: number) {
  const noun = SYMPTOMS[s].noun
  switch (c) {
    case 'nemuke-nashi':
      return `眠くならない${noun}はある？眠気の注意がある成分を含まない${n}品`
    case 'caffeine-nashi':
      return `カフェインなしの${noun}｜カフェインを含まない${n}品の一覧`
    case 'kodomo':
      return `子ども用の${noun}｜商品名に「小児用・こども」とある${n}品`
    case 'tanzai':
      return `成分が1つだけの${noun}｜${n}品の一覧`
    case 'steroid-nashi':
      return `ステロイドなしの${noun}｜${n}品の一覧`
    default:
      return `${CONDS[c].label}${noun}｜${n}品`
  }
}

export const RISK_GROUPS: { key: string; label: string; test: (r: number | null) => boolean }[] = [
  { key: '1', label: '第1類医薬品', test: (r) => r === 1 },
  { key: '2.5', label: '指定第2類医薬品', test: (r) => r === 2.5 },
  { key: '2', label: '第2類医薬品', test: (r) => r === 2 },
  { key: '3', label: '第3類医薬品', test: (r) => r === 3 },
  { key: '0', label: '区分は製品で確認', test: (r) => r == null || ![1, 2, 2.5, 3].includes(r) },
]

export function shortIngs(m: Med, max = 3) {
  const list = m.ings.map(ingName).filter(Boolean)
  return list.length > max ? `${list.slice(0, max).join('、')} ほか${list.length - max}成分` : list.join('、')
}

export function dataDate() {
  const d = load().updatedAt
  return d ? d.slice(0, 10) : ''
}
