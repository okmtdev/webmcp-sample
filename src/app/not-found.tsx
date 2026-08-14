import Link from 'next/link';
import './saas.css';

export default function NotFound() {
  return (
    <div className="s-root" style={{ padding: 40 }}>
      <div className="s-card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <div className="s-card-head">
          <span className="s-card-title">404 — ページが見つかりません</span>
        </div>
        <div className="s-card-body s-stack">
          <p className="s-muted" style={{ margin: 0 }}>
            指定された URL のページは存在しません。
          </p>
          <div className="s-stack">
            <Link className="s-link" href="/">
              → WebMCP サンプル SaaS 管理コンソール
            </Link>
            <Link className="s-link" href="/keihi/">
              → スーパーややこしいシステム v.1.0.0（経費精算デモ）
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
