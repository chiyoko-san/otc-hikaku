// 配置先: lib/ingredient-next.ts
//
// 成分ページ（/ingredients/<slug>/）の「次に見る」に出す3つを決める。
//
// 2026-11-21: 成分ページは検索から来た人が読んで終わりになっていた。
//   行き先が多いと人は選べないので、必ず3つまで。来た人の目的ごとに1枠ずつ:
//     1. 選びたい人        … この成分だけの薬 ／ 無ければ いちばん多い症状のページ
//     2. 病院でもらっている人 … 同じ成分の処方薬の切替ページ ／ 上乗せ料金の計算 ／ 無ければ 質問に答えて選ぶ
//     3. もっと知りたい人   … この成分を扱ったコラム ／ 無ければ 一緒に配合されることが多い成分
//   どの枠も、出せる中身が無いときは次の候補に下がる。同じ行き先は2回出さない。
//
// クリックは GA4 の next_click（slot / kind / page）で数える（components/ingredient/NextSteps.tsx）。

import type { Ingredient, Medicine } from '@/types';
import type { Summary } from './ingredient-summary';
import type { ColumnLite } from './related-columns';
import { columnHref } from './related-columns';
import { getAllSymptoms } from './medicines';
import { normalizeIngredientName } from './slug';
import { isIndexableMedicine } from './indexable';
import { getAllSwitchDrugs } from './switch-data';
import { findOtcSimilarForIngredients } from './otc-similar-77';

export type NextStep = {
  /** 1〜3。どの目的の枠か */
  slot: 1 | 2 | 3;
  /** 計測用の種類 */
  kind: 'single' | 'symptom' | 'switch' | 'fee' | 'akinator' | 'column' | 'partner';
  /** 誰向けか（小さく出す） */
  who: string;
  /** 押す文言 */
  label: string;
  /** 補足1行 */
  note?: string;
  href: string;
};

/** この成分だけが入った薬（検索に出している製品に限る） */
function singleIngredientMeds(ing: Ingredient, meds: Medicine[]): Medicine[] {
  return meds.filter((m) => {
    if (m.itype === 'functional' || !isIndexableMedicine(m)) return false;
    const norm = Array.from(
      new Set((m.ings || []).map((i) => normalizeIngredientName(i)).filter(Boolean))
    );
    return norm.length === 1 && norm[0] === ing.name;
  });
}

export function getNextSteps(
  ing: Ingredient,
  sum: Summary,
  column: ColumnLite | null
): NextStep[] {
  const steps: NextStep[] = [];
  const used = new Set<string>();
  const push = (s: NextStep) => {
    if (used.has(s.href)) return false;
    used.add(s.href);
    steps.push(s);
    return true;
  };

  const symSlug = new Map(getAllSymptoms().map((s) => [s.name, s.slug]));
  const symptomStep = (name: string, slot: 1 | 2 | 3, who: string): NextStep | null => {
    const slug = symSlug.get(name);
    if (!slug) return null;
    return {
      slot,
      kind: 'symptom',
      who,
      label: `「${name}」の市販薬をまとめて見る`,
      note: 'ほかの成分の薬とも比べられます',
      href: `/symptoms/${slug}/`,
    };
  };

  /* ---- 1. 選びたい人 ---- */
  const singles = singleIngredientMeds(ing, sum.meds);
  let done = false;
  if (singles.length > 0) {
    const first = singles[0];
    done = push({
      slot: 1,
      kind: 'single',
      who: '薬を選びたい方',
      label: `${ing.name}だけが入った薬を見る`,
      note:
        singles.length > 1
          ? `${first.name} ほか${singles.length - 1}品。まず1品の成分量と注意点を確認`
          : `${first.name}。成分量と注意点を確認`,
      href: `/medicines/${first.slug}/`,
    });
  }
  if (!done && sum.medicineCount > 0) {
    for (const name of sum.topSymptoms) {
      const s = symptomStep(name, 1, '薬を選びたい方');
      if (s && push(s)) break;
    }
  }

  /* ---- 2. 病院でもらっている人 ---- */
  done = false;
  const singleIds = new Set(singles.map((m) => m.id));
  const switchDrugs = getAllSwitchDrugs().filter((d) => {
    if (d.index === false || !d.answer) return false;
    if (d.source === 'generated') {
      return (d.answer.otcIds || []).some((id) => singleIds.has(id));
    }
    return (d.ingredientKeys || []).some((key) => key && ing.name.includes(key));
  });
  if (switchDrugs.length > 0) {
    const d = switchDrugs[0];
    done = push({
      slot: 2,
      kind: 'switch',
      who: '病院でもらっている方',
      label: `処方薬「${d.rxName}」と同じ成分の市販薬を見る`,
      note: '処方薬との違いと、ネットで買えるかがわかります',
      href: `/switch/${d.slug}/`,
    });
  }
  if (!done) {
    const fee = findOtcSimilarForIngredients([ing.name]);
    if (fee.length > 0) {
      done = push({
        slot: 2,
        kind: 'fee',
        who: '病院でもらっている方',
        label: '2027年3月から、いくら増えるか計算する',
        note: `${fee[0].name}は処方薬だと上乗せ料金の対象(厚生労働省案)`,
        href: '/otc-similar/simulator/',
      });
    }
  }
  if (!done) {
    push({
      slot: 2,
      kind: 'akinator',
      who: 'どれを選べばいいか迷う方',
      label: '質問に答えて、合う薬をしぼる',
      note: '症状や体質を選ぶだけ。1分ほどで終わります',
      href: '/akinator/',
    });
  }

  /* ---- 3. もっと知りたい人 ---- */
  done = false;
  if (column && column.title) {
    done = push({
      slot: 3,
      kind: 'column',
      who: 'もっと知りたい方',
      label: column.title,
      note: '解説記事を読む',
      href: columnHref(column),
    });
  }
  if (!done) {
    for (const p of sum.partners) {
      if (
        push({
          slot: 3,
          kind: 'partner',
          who: 'もっと知りたい方',
          label: `よく一緒に入っている「${p.name}」を調べる`,
          note: `${p.count}品でこの成分と一緒に配合`,
          href: `/ingredients/${p.slug}/`,
        })
      ) {
        done = true;
        break;
      }
    }
  }
  if (!done && sum.medicineCount > 0) {
    // コラムも相方の成分も無いとき: まだ出していない症状のページ
    for (const name of sum.topSymptoms) {
      const s = symptomStep(name, 3, 'もっと知りたい方');
      if (s && push(s)) break;
    }
  }

  return steps.sort((a, b) => a.slot - b.slot);
}
