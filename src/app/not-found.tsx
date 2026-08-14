import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: 24 }}>
      <div className="bevel-out" style={{ maxWidth: 520 }}>
        <div className="titlebar">
          <span>エラー E-404</span>
        </div>
        <div style={{ padding: 12 }}>
          <p style={{ marginTop: 0 }}>
            <b className="blink">要求された画面は存在しません。</b>
          </p>
          <p className="note">
            画面コードが正しいかご確認のうえ、メニューツリーから操作をやり直してください。
            解決しない場合は情報システム部（内線 4413）までご連絡ください。
          </p>
          <p>
            <Link href="/">▶ トップメニューへ戻る</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
