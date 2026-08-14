import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WebMCP サンプル SaaS 管理コンソール',
  description:
    '1件ずつしかユーザーを追加できない SaaS 管理画面に MiiTel MCP を定義し、ユーザーごとの設定を一括で片付けられることを体験する WebMCP のサンプル。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
