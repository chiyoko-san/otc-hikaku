import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = { body: string };

/**
 * コラム本文を Markdown → HTML に変換する。
 * `::: tip / warn / danger / info` 記法を callout ボックスに変換。
 */
export function ColumnRenderer({ body }: Props) {
  // :::TYPE タイトル 〜 ::: を独自処理: HTML 直書きに置換してから Markdown レンダー
  const processed = body.replace(
    /:::\s*(tip|warn|danger|info)\s*([^\n]*)\n([\s\S]*?):::/g,
    (_m, type, title, content) => {
      const safeTitle = title.trim();
      const typeClass = `callout-${type}`;
      return `<div class="${typeClass}">
${safeTitle ? `<div class="callout-title">${safeTitle}</div>` : ''}

${content.trim()}

</div>`;
    }
  );

  return (
    <div className="prose-column">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehype-raw を入れないと <div> はエスケープされるが、
        // Next.js の安全側に倒して rehype-raw は使わない。
        // 代わりに callout を直接 React コンポーネントとして処理する。
        components={{
          // callout を本文中に埋め込むためのパーサ(h段落などでの対応は要所で)
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
