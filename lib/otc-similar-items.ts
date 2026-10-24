import raw from '@/data/otc-similar-items.json';
import { OTC_SIMILAR_77 } from './otc-similar-77';

// 配置先: lib/otc-similar-items.ts
// data/otc-similar-items.json（scraper/build_otc_similar_items.py が薬価基準リストから生成）を読む。

export type OtcSimilarItem = {
  no: number; // 対象77成分の番号
  code: string; // 薬価基準収載医薬品コード
  name: string; // 品名（例: ロキソニン錠60mg）
  maker: string;
  ingredient: string; // 薬価リスト上の成分名
  spec: string; // 規格（例: 60mg1錠）
  route: '内用薬' | '外用薬' | '歯科用薬剤' | string;
  price: number; // 薬価（円、規格単位あたり）
  surcharge: number; // 上乗せ額（薬価の1/4、規格単位あたり）
  kind: '先発' | '後発' | 'その他' | string;
  expiry: string; // 経過措置期限（あれば）
};

type Dataset = {
  generated_at: string;
  source_files: string[];
  note: string;
  total: number;
  items: OtcSimilarItem[];
};

const DATA = raw as Dataset;

/** 薬価データの基準日ラベル（ファイル名 tpYYYYMMDD-… から取る） */
export function getYakkaDateLabel(): string {
  const m = DATA.source_files.map((f) => f.match(/tp(\d{4})(\d{2})(\d{2})/)).filter(Boolean)
    .sort((a, b) => (b![0] > a![0] ? 1 : -1))[0];
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : '';
}

export function getItemsByNo(no: number): OtcSimilarItem[] {
  return DATA.items.filter((i) => i.no === no);
}

/** 先発品を優先して上位 n 件（表示用） */
export function getRepresentativeItems(no: number, n = 3): OtcSimilarItem[] {
  const items = getItemsByNo(no);
  const brand = items.filter((i) => i.kind === '先発');
  const rest = items.filter((i) => i.kind !== '先発');
  return [...brand, ...rest].slice(0, n);
}

/** 品名の前方一致で1件探す（例: 'ロキソニン錠60mg'） */
export function findItemByName(prefix: string): OtcSimilarItem | null {
  return DATA.items.find((i) => i.name.startsWith(prefix)) || null;
}

/**
 * 規格文字列から「薬価がいくつ分の値段か」を取り出す。
 *   '60mg1錠'      → { n: 1,  unit: '錠' }   薬価は1錠あたり
 *   '0.3%1g'       → { n: 1,  unit: 'g' }    薬価は1gあたり
 *   '10g' / '10mL' → { n: 10, unit: 'g' / 'mL' }  薬価は10g・10mLあたり（プロペト、アンモニア水など216品目）
 *   '0.05%8mL1瓶'  → { n: 1,  unit: '瓶' }
 * 2026-10-24: 以前は n を無視して「10gの薬価」を「1gの薬価」として表示・計算しており、
 * 規格が 10g / 10mL の薬で金額が10倍になっていた。
 */
export function unitInfo(spec: string): { n: number; unit: string } {
  const m = spec.match(/(\d+(?:\.\d+)?)?(錠|カプセル|包|g|mL|枚|管|瓶|個|本|袋)$/);
  if (!m) return { n: 1, unit: '単位' };
  const n = m[1] ? Number(m[1]) : 1;
  return { n: n > 0 ? n : 1, unit: m[2] };
}

/** 規格単位の呼び名（「1錠」「1g」「1枚」など）。規格文字列の末尾から取る */
export function unitLabel(spec: string): string {
  const { unit } = unitInfo(spec);
  return `1${unit}`;
}

/** 1単位（1錠・1g・1mL・1枚…）あたりの薬価。規格が 10g なら薬価÷10 */
export function unitPrice(item: Pick<OtcSimilarItem, 'price' | 'spec'>): number {
  return item.price / unitInfo(item.spec).n;
}

/** 1単位あたりの上乗せ額（薬価の4分の1） */
export function unitSurcharge(item: Pick<OtcSimilarItem, 'price' | 'spec'>): number {
  return unitPrice(item) / 4;
}

/**
 * 薬価の表示。薬価基準の数字をそのまま見せ、規格が複数単位ならカッコで1単位あたりも添える。
 *   '60mg1錠' 20.9円 → 「薬価20.9円／1錠」
 *   '10g' 31.6円     → 「薬価31.6円／10g（1gあたり3.2円）」
 */
export function priceLabel(item: Pick<OtcSimilarItem, 'price' | 'spec'>): string {
  const { n, unit } = unitInfo(item.spec);
  if (n === 1) return `薬価${yen(item.price)}／1${unit}`;
  return `薬価${yen(item.price)}／${n}${unit}（1${unit}あたり${yen(unitPrice(item))}）`;
}

export function yen(n: number): string {
  // 100円未満で端数があるものは小数1桁（薬価10.8円など）、それ以外は整数（表示用）
  if (n < 100 && Math.abs(n - Math.round(n)) >= 0.05) return `${(Math.round(n * 10) / 10).toFixed(1)}円`;
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

/** 数量をかけたときの「これまで」「これから」（定率負担 rate = 0.1 / 0.2 / 0.3） */
/** qty は「単位」の数（錠・g・mL・枚…）。薬価が10gあたりの薬でも qty は g で渡す */
export function estimate(item: Pick<OtcSimilarItem, 'price' | 'spec'>, qty: number, rate: number) {
  const drugCost = unitPrice(item) * qty;
  const before = drugCost * rate;
  const surcharge = drugCost / 4;
  const after = surcharge + (drugCost - surcharge) * rate;
  return { drugCost, before, surcharge, after, diff: after - before };
}

export const OTC_SIMILAR_ITEMS_META = {
  total: DATA.total,
  generatedAt: DATA.generated_at,
  note: DATA.note,
};

/** シミュレーター（クライアント側）に渡す軽量版 */
export type SlimItem = {
  code: string;
  name: string;
  spec: string;
  price: number;
  kind: string;
  route: string;
  ingredient: string;
  no: number;
  group: string;
};

export function getSlimItems(): SlimItem[] {
  const groupOf = new Map(OTC_SIMILAR_77.map((i) => [i.no, i.group as string]));
  return DATA.items.map((i) => ({
    code: i.code,
    name: i.name,
    spec: i.spec,
    price: i.price,
    kind: i.kind,
    route: i.route,
    ingredient: i.ingredient,
    no: i.no,
    group: groupOf.get(i.no) ?? 'other',
  }));
}

export function getItemByCode(code: string): OtcSimilarItem | null {
  return DATA.items.find((i) => i.code === code) || null;
}

export function getAllItemCodes(): string[] {
  return DATA.items.map((i) => i.code);
}

/** 規格の単位（錠・枚・g…）に応じた「よくある処方量」の目安 */
export function quantityPresets(spec: string): number[] {
  const u = unitLabel(spec).replace(/^1/, '');
  if (u === '枚') return [7, 14, 28, 35, 70];
  if (u === 'g' || u === 'mL') return [10, 25, 50, 100];
  if (u === '包') return [14, 21, 42, 84];
  if (u === '本' || u === '個' || u === '管' || u === '瓶') return [1, 2, 3, 5];
  return [7, 14, 28, 30, 60, 90];
}
