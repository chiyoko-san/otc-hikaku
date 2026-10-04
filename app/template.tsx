import { NoticeBar, FloatingTools, BottomNav } from '@/components/AssistBar';

// 配置先: app/template.tsx
// layout.tsx の children を包む形で全ページに適用される。既存の layout・ヘッダーは変更不要。
// 先頭の script は、保存された文字サイズをページ描画前に反映する（ちらつき防止）。

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var s=localStorage.getItem('kc-font');if(s){document.documentElement.style.fontSize=s}}catch(e){}",
        }}
      />
      <NoticeBar />
      {children}
      <BottomNav />
      <FloatingTools />
    </>
  );
}
