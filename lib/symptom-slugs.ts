// 配置先: lib/symptom-slugs.ts
//
// 症状ページ（/symptoms/<slug>/）のURLを決める表。
//
// 2026-11-21: これまでは症状名をかな→ローマ字に機械変換していたが、漢字を読めないため
//   「頭痛」「発熱」「便秘」など漢字だけの症状 47件が /symptoms/unnamed-7/ のような番号URLになり、
//   「肌荒れ」→ /symptoms/re/、「冷え」→ /symptoms/e/ のように漢字だけ抜け落ちたURLも出ていた。
//   番号は薬データの並び順で決まるので、データを更新するたびに別の症状へ入れ替わるおそれもあった。
//   ここに書いた名前は固定のURLになる。古いURLは app/symptoms/[slug]/page.tsx が新しいURLへ転送する。
//
// 新しい症状名が薬データに増えたら、ここに1行足す。
// 足し忘れても symptomSlug() が名前から決まる固定のURL（s-xxxxxx）を作るので、番号URLには戻らない。

export const SYMPTOM_SLUGS: Record<string, string> = {
  // 痛み・熱
  '頭痛': 'zutsu',
  '偏頭痛': 'henzutsu',
  '片頭痛': 'henzutsu-kata',
  '歯痛': 'shitsu',
  'のど痛': 'nodo-itami',
  'のどの痛み': 'nodo-no-itami',
  '咽喉痛': 'inkotsu',
  '月経痛': 'gekkeitsu',
  '生理痛': 'seiritsu',
  '腰痛': 'yotsu',
  '関節痛': 'kansetsutsu',
  '神経痛': 'shinkeitsu',
  '筋肉痛': 'kinnikutsu',
  '打撲痛': 'dabokutsu',
  '骨折痛': 'kossetsutsu',
  '外傷痛': 'gaishotsu',
  '抜歯後の疼痛': 'basshigo-no-itami',
  '発熱': 'hatsunetsu',
  '悪寒': 'okan',
  '肩こり': 'katakori',
  '打撲・ねんざ': 'daboku-nenza',
  'ねんざ': 'nenza',

  // 鼻・目・のど
  '鼻水': 'hanamizu',
  '鼻づまり': 'hanazumari',
  'くしゃみ': 'kushami',
  '花粉症': 'kafunsho',
  'アレルギー性鼻炎': 'arerugisei-bien',
  '目のかゆみ': 'me-no-kayumi',
  '充血': 'juketsu',
  '目の疲れ': 'me-no-tsukare',
  '乾き目': 'kawakime',
  '眼精疲労': 'gansei-hiro',
  'のどの炎症': 'nodo-no-ensho',
  '声がれ': 'koegare',
  '口腔殺菌': 'koku-sakkin',

  // 咳・痰
  'せき': 'seki',
  'たん': 'tan',

  // 胃腸
  '胃痛': 'itsu',
  '胸やけ': 'muneyake',
  '胃もたれ': 'imotare',
  '食べ過ぎ': 'tabesugi',
  '飲み過ぎ': 'nomisugi',
  '吐き気': 'hakike',
  '下痢': 'geri',
  '便秘': 'benpi',
  '便通': 'bentsu',
  '腹部膨満': 'fukubu-boman',
  '整腸': 'seicho',
  '腸内環境': 'chonai-kankyo',

  // 皮膚
  '湿疹・かぶれ': 'kabure',
  '湿疹': 'shisshin',
  'かゆみ': 'kayumi',
  '虫刺され': 'mushisasare',
  '乾燥肌': 'kansohada',
  'あかぎれ': 'akagire',
  'ひび': 'hibi',
  'しもやけ': 'shimoyake',
  'にきび': 'nikibi',
  '口内炎': 'konaien',
  '水虫': 'mizumushi',
  'たむし': 'tamushi',
  '肌荒れ': 'hadaare',
  'シミ・そばかす': 'shimi-sobakasu',
  '肝斑': 'kanpan',
  '薄毛・脱毛': 'usuge-datsumo',

  // 疲労・神経・睡眠
  '肉体疲労': 'nikutai-hiro',
  '手足のしびれ': 'teashi-no-shibire',
  'しびれ': 'shibire',
  '冷え': 'hie',
  'めまい・立ちくらみ': 'memai-tachikurami',
  '動悸': 'doki',
  '不眠': 'fumin',
  '精神的ストレス': 'sutoresu',
  '認知機能': 'ninchi-kino',

  // 女性
  '更年期障害': 'konenki-shogai',
  '月経不順': 'gekkei-fujun',

  // 生活習慣（機能性表示食品が中心）
  '中性脂肪': 'chusei-shibo',
  '血糖値': 'kettochi',
  '体脂肪': 'taishibo',
  '血圧': 'ketsuatsu',
  '骨粗しょう症': 'kotsusoshosho',

  // その他
  '乗物酔い': 'norimonoyoi',
  '禁煙': 'kinen',
  '痔': 'ji',
  '消毒': 'shodoku',
  '排卵確認': 'hairan-kakunin',
  '妊娠確認': 'ninshin-kakunin',
};

/** 名前だけから決まる短い固定文字列（並び順に左右されない） */
function stableHash(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

/** 症状名 → URL用の文字列。表に無い名前は、名前から決まる固定の文字列にする */
export function symptomSlug(name: string): string {
  return SYMPTOM_SLUGS[name] ?? `s-${stableHash(name)}`;
}
