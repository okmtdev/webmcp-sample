import type { Metadata } from 'next';
import './keihi.css';

export const metadata: Metadata = {
  title: 'スーパーややこしいシステム v.1.0.0',
  description:
    '画面から手作業でやると地獄のような経費精算ワークフローを、WebMCP 経由なら1回の呼び出しで片付けられることを体験するデモ。',
};

/**
 * /keihi 配下だけに 1998 年風のスタイルを適用するためのレイアウト。
 * keihi.css はこのセグメントのバンドルにのみ含まれるため、
 * ルート直下の SaaS 管理画面には影響しない。
 */
export default function KeihiLayout({ children }: { children: React.ReactNode }) {
  return <div className="keihi-root">{children}</div>;
}
