// ひらがな/カタカナ → ローマ字変換(Hepburn方式 簡易版)

const KANA_MAP: Record<string, string> = {
  // 清音
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
  // 濁音・半濁音
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  // 拗音
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  // 促音
  'っ': '',  // 後続の子音重複で処理
  // 長音
  'ー': '',
  // 小文字(単独出現は基本ない想定)
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
  'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo',
};

function katakanaToHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

export function kanaToRomaji(s: string): string {
  const hira = katakanaToHiragana(s);
  let result = '';
  let i = 0;
  while (i < hira.length) {
    // 促音処理: "っ" の次の文字の子音を重複
    if (hira[i] === 'っ' && i + 1 < hira.length) {
      const next = hira.substring(i + 1, i + 3);
      const romaji = KANA_MAP[next] || KANA_MAP[hira[i + 1]] || '';
      if (romaji) {
        result += romaji[0] + romaji;
        i += next.length > 1 && KANA_MAP[next] ? 3 : 2;
        continue;
      }
    }
    // 拗音処理: 2文字で見る
    if (i + 1 < hira.length) {
      const pair = hira.substring(i, i + 2);
      if (KANA_MAP[pair]) {
        result += KANA_MAP[pair];
        i += 2;
        continue;
      }
    }
    // 1文字
    const r = KANA_MAP[hira[i]];
    if (r !== undefined) {
      result += r;
    } else if (/[a-zA-Z0-9]/.test(hira[i])) {
      result += hira[i].toLowerCase();
    }
    // 漢字や未知文字は無視
    i++;
  }
  return result;
}

// 医薬品名 → slug
export function medicineNameToSlug(name: string): string {
  let s = name;
  // 括弧内削除
  s = s.replace(/[(（][^)）]*[)）]/g, '');
  // 記号を空白に
  s = s.replace(/[「」『』【】〈〉《》〔〕、。・\s]+/g, ' ');
  s = s.replace(/[!?,.]/g, '');
  s = s.trim();

  const parts = s.split(/\s+/).map(kanaToRomaji).filter(Boolean);
  let slug = parts.join('-');
  slug = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  slug = slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return slug || 'unnamed';
}

// 成分名 → slug(用量除去 + ローマ字)
export function ingredientNameToSlug(name: string): string {
  let s = name;
  // 用量削除
  s = s.replace(/[(（][^)）]*[)）]/g, '');
  s = s.replace(/\d+(\.\d+)?\s*(mg|ml|g|μg|iu|%)/gi, '');
  s = s.trim();
  return medicineNameToSlug(s);
}

// 成分名の正規化(表記ゆれ統合)
export function normalizeIngredientName(name: string): string {
  let s = name;
  // 用量削除
  s = s.replace(/[(（][^)）]*[)）]/g, '');
  s = s.replace(/\d+(\.\d+)?\s*(mg|ml|g|μg|iu|%)/gi, '');
  // 末尾修飾子削除
  s = s.replace(/[\s]+$/, '');
  s = s.replace(/Na水和物$/i, '');
  s = s.replace(/水和物$/, '');
  s = s.replace(/無水物$/, '');
  s = s.replace(/ナトリウム$/, 'Na');
  return s.trim();
}

// 症状名 → slug
export function symptomNameToSlug(name: string): string {
  return medicineNameToSlug(name);
}

// slug重複解消: 同じslugが既に存在したら -2, -3...を付与
export function uniquifySlug(slug: string, existing: Set<string>): string {
  if (!existing.has(slug)) {
    existing.add(slug);
    return slug;
  }
  let i = 2;
  while (existing.has(`${slug}-${i}`)) i++;
  const result = `${slug}-${i}`;
  existing.add(result);
  return result;
}
