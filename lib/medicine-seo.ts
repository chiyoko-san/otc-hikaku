import type { Medicine } from '@/types';
import { normalizeIngredientName } from './slug';
import { getSimilarMedicinesWithReason } from './medicines';
import { normalizeDosageForm } from './dosageForm';
import seoOverridesRaw from '@/data/agent/seo-overrides.json';

// 成長エージェント（agent/growth.py）が差し替えたタイトル・説明文。キーは slug。
// 検査（scripts/validate_agent_data.py）に通ったものだけが data/agent/seo-overrides.json に入る。
type SeoOverride = { title?: string; description?: string };
const SEO_OVERRIDES = ((seoOverridesRaw as { medicines?: Record<string, SeoOverride> }).medicines ?? {}) as Record<string, SeoOverride>;

// 配置先: lib/medicine-seo.ts
//
// 薬ページ（/medicines/<slug>/）の <title> と description を、薬ごとのデータから組み立てる。
// 2026-11-01: Search Console で薬ページの多くが 7〜10位なのにクリック率ほぼ0%。
//   検索語に多い「効果」「成分」「眠くなる」「違い」に、タイトルの時点で答える形に変えた。
//   旧: 「〇〇(イブプロフェン配合)｜成分・効能・類似薬の比較」
//   新: 「〇〇の効果・成分｜眠くなる？似た薬との違い」
// 本文は変えない。タイトル末尾の「｜クスリノコンパス」は buildMetadata が付ける。

const TITLE_MAX = 34; // 「｜クスリノコンパス」を除いた目安（検索結果で切れにくい長さ）

/**
 * 眠くなる成分（飲み薬で「服用後、乗物又は機械類の運転操作をしないこと」の表示が付く代表的な成分）。
 * 2026-11-01: medicines.json の drowsy フラグは6成分しか見ておらず、鎮静成分（アリルイソプロピルアセチル尿素など）入りの
 * 頭痛薬149品が「眠気の注意表示なし」になっていた。成分名でも判定する。
 */
const DROWSY_INGREDIENTS = [
  // 第一世代抗ヒスタミン
  'クロルフェニラミン', 'ジフェンヒドラミン', 'プロメタジン', 'ジフェニルピラリン', 'カルビノキサミン', 'クレマスチン',
  'トリプロリジン', 'シプロヘプタジン', 'アリメマジン', 'ドキシラミン', 'メクリジン', 'ジメンヒドリナート', 'イソチペンジル',
  // 抗ヒスタミン（OTCで運転不可の表示があるもの）
  'ケトチフェン', 'メキタジン', 'セチリジン',
  // 鎮静成分
  'アリルイソプロピルアセチル尿素', 'ブロモバレリル尿素', 'ブロムワレリル尿素',
  // 鎮咳（麻薬性）
  'コデイン',
  // 乗り物酔い
  'スコポラミン',
];

/** 飲み薬かどうか（「眠くなる？」を出すのは飲み薬だけ） */
export function isOralMedicine(med: Medicine): boolean {
  return isOral(med);
}

/** 眠くなる成分を含む飲み薬か（drowsy フラグ＋成分名） */
export function isDrowsyMedicine(med: Medicine): boolean {
  if (med.drowsy) return true;
  if (!isOral(med)) return false;
  return (med.ings || []).some((i) => DROWSY_INGREDIENTS.some((k) => String(i).includes(k)));
}

function isOral(med: Medicine): boolean {
  const form = normalizeDosageForm(med.name, med.cat ?? null, (med as { form?: string | null }).form ?? null);
  return form === 'oral' || form === 'other';
}

function riskShort(med: Medicine): string {
  if (med.itype === 'functional') return '機能性表示食品';
  if (med.itype === 'designated_quasi') return '指定医薬部外品';
  if (med.itype === 'quasi') return '医薬部外品';
  if (med.risk === 1) return '第1類医薬品';
  if (med.risk === 2) return '第2類医薬品';
  if (med.risk === 2.5) return '指定第2類医薬品';
  if (med.risk === 3) return '第3類医薬品';
  return '';
}

/** 主な成分（量の表記を外して最大2つ） */
function mainIngredients(med: Medicine, n = 2): string[] {
  const out: string[] = [];
  for (const raw of med.ings || []) {
    const name = normalizeIngredientName(String(raw));
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= n) break;
  }
  return out;
}

/** 効能の最初の一文を短く（「次の諸症状の緩和：」のような前置きは外す） */
function shortEffect(med: Medicine, max = 42): string {
  let e = String(med.effect || '').replace(/\s+/g, '');
  e = e.replace(/^(次の諸症状の緩和|次の症状の緩和|下記の症状の緩和)[:：]?/, '');
  if (e.length > max) e = `${e.slice(0, max)}…`;
  return e;
}

export function buildMedicineTitle(med: Medicine): string {
  const o = SEO_OVERRIDES[med.slug];
  if (o?.title) return o.title;
  return buildDefaultMedicineTitle(med);
}

/** エージェントの差し替えが無いときのタイトル（差し替えを戻すとこれに戻る） */
export function buildDefaultMedicineTitle(med: Medicine): string {
  const name = med.name;
  const oral = isOral(med) && med.itype !== 'functional';
  const tail = oral ? '眠くなる？似た薬との違い' : '使い方と似た薬との違い';
  const full = `${name}の効果・成分｜${tail}`;
  if (full.length <= TITLE_MAX) return full;
  const mid = `${name}の効果・成分｜似た薬との違い`;
  if (mid.length <= TITLE_MAX) return mid;
  return `${name}の効果・成分`;
}

export function buildMedicineDescription(med: Medicine): string {
  const o = SEO_OVERRIDES[med.slug];
  if (o?.description) return o.description;
  return buildDefaultMedicineDescription(med);
}

export function buildDefaultMedicineDescription(med: Medicine): string {
  const parts: string[] = [];
  const risk = riskShort(med);
  parts.push(risk ? `${med.name}（${med.maker}）は${risk}。` : `${med.name}（${med.maker}）。`);

  const ings = mainIngredients(med);
  if (ings.length > 0) parts.push(`主な成分は${ings.join('・')}${(med.ings?.length ?? 0) > ings.length ? 'など' : ''}。`);

  if (isOral(med) && med.itype !== 'functional') {
    parts.push(isDrowsyMedicine(med) ? '眠くなる成分を含み、服用後の運転はできません。' : '眠くなる成分は含まれていません。');
  }

  const eff = shortEffect(med);
  if (eff) parts.push(`効能：${eff}`);

  const same = getSimilarMedicinesWithReason(med, 8)
    .filter((s) => s.sameIngredient)
    .slice(0, 2)
    .map((s) => s.med.name);
  parts.push(same.length > 0 ? `${same.join('・')}など同じ成分の市販薬との違いも比較。` : '似た市販薬との成分の違いも比較。');

  return parts.join('');
}
