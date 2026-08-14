import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'スーパーややこしいシステム v.1.0.0',
  description:
    'WebMCP のチュートリアル用サンプル。画面から手作業でやると地獄のような経費精算ワークフローを、エージェントからは1文で片付けられるようにする。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
