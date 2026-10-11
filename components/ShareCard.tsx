'use client';

import { useEffect, useState } from 'react';

// 配置先: components/ShareCard.tsx
//
// 「共有ボタン」ではなく「送る文章」を主役にしたカード。
//   - 送られる文章をLINEの吹き出しの形でそのまま見せる(何が届くか分かるので押しやすい)
//   - ボタンは LINE / X / コピー / ほかのアプリ(端末の共有シート)
//   - 文章は呼び出し側が作る。URLはこのカードが末尾に付ける
//
// 使い方:
//   <ShareCard
//     heading="この結果、家族にも送っておきませんか？"
//     lead="親の薬を代わりに調べた人へ。この文章を送れば本人もそのまま見られます。"
//     message={"【上乗せ料金の計算結果】\n…"}
//     url={絶対URL(省略時は今のページ)}
//     xText="X用の短い文章(省略時は message)"
//     hashtags={['上乗せ料金']}
//   />

type Props = {
  heading?: string;
  lead?: string;
  /** 送る本文。URLは含めない(カードが末尾に付ける) */
  message: string;
  /** 送るURL。省略時は今のページのURL */
  url?: string;
  /** X用の短い本文(140字目安)。省略時は message */
  xText?: string;
  hashtags?: string[];
  /** 記事ページなど、主役でない場所用の小さめ表示 */
  compact?: boolean;
};

const LINE_GREEN = '#06C755';

export function ShareCard({
  heading = '家族にも送っておきませんか？',
  lead = 'この文章がそのまま送れます。受け取った人は押すだけで同じページが見られます。',
  message,
  url,
  xText,
  hashtags = ['上乗せ料金'],
  compact = false,
}: Props) {
  const [href, setHref] = useState(url ?? '');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!url) setHref(window.location.href);
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, [url]);

  const full = href ? `${message}\n${href}` : message;
  const lineHref = `https://line.me/R/share?text=${encodeURIComponent(full)}`;
  const xHref =
    `https://x.com/intent/post?text=${encodeURIComponent(xText ?? message)}` +
    (href ? `&url=${encodeURIComponent(href)}` : '') +
    (hashtags.length ? `&hashtags=${encodeURIComponent(hashtags.join(','))}` : '');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボードが使えない端末では何もしない */
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ text: message, url: href || undefined });
    } catch {
      /* キャンセル時は何もしない */
    }
  };

  const btn =
    'inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 text-base font-bold';

  return (
    <section
      className={`panel ${compact ? 'mt-8' : 'mt-10'} print:hidden`}
      aria-label="この内容を人に送る"
    >
      <h2 className={compact ? 'text-base font-bold' : 'text-lg font-bold md:text-xl'}>{heading}</h2>
      <p className="mt-1 text-sm text-gray-600">{lead}</p>

      {/* 送る文章のプレビュー(吹き出し) */}
      <div className="mt-4 rounded-2xl rounded-tl-sm bg-brand-light px-4 py-3 text-sm leading-relaxed text-brand-ink md:text-base">
        <p className="whitespace-pre-wrap break-words">{message}</p>
        {href ? <p className="mt-1 break-all text-gray-600">{href}</p> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <a
          href={lineHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} text-white`}
          style={{ backgroundColor: LINE_GREEN }}
        >
          LINEで送る
        </a>
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btn} bg-black text-white`}
        >
          Xに投稿する
        </a>
        <button type="button" onClick={copy} className={`${btn} border border-gray-300 bg-white text-brand-ink`}>
          {copied ? 'コピーしました' : '文章をコピー'}
        </button>
        {canNativeShare ? (
          <button type="button" onClick={nativeShare} className={`${btn} border border-gray-300 bg-white text-brand-ink`}>
            ほかのアプリで送る
          </button>
        ) : null}
      </div>
    </section>
  );
}
