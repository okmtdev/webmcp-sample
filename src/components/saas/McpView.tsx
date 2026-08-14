'use client';

import { PLAN } from '@/lib/saas/masters';
import { useRegisteredTools } from '@/lib/webmcp/useWebMCP';

const SAMPLE_PROMPTS: Array<{ title: string; body: string; note: string }> = [
  {
    title: '新入社員 12 名をオンボーディングする',
    body: `この管理画面のツールを使って、4月入社の12名を追加してください。
部署ごとの推奨設定も一緒に適用してください。

営業部: b1@example.co.jp 新人1 / b2@example.co.jp 新人2 / b3@example.co.jp 新人3
サポート部: b4@example.co.jp 新人4 / b5@example.co.jp 新人5
CS部: b6@example.co.jp 新人6 / b7@example.co.jp 新人7
開発部: b8@example.co.jp 新人8 / b9@example.co.jp 新人9 / b10@example.co.jp 新人10
コーポレート部: b11@example.co.jp 新人11 / b12@example.co.jp 新人12

全員 member ロールでお願いします。`,
    note: '画面なら 12 回のダイアログ ＋ 12 人分の設定画面。ツールなら miitel_create_users 1 回。',
  },
  {
    title: '既存ユーザーの設定漏れをまとめて直す',
    body: `推奨設定から外れているユーザーを洗い出して、
何がどうズレているか教えてください。
問題なければ、そのまま全員に推奨設定を適用してください。`,
    note: 'miitel_audit_settings で確認 → miitel_apply_settings_template に onlyNonCompliant: true。',
  },
  {
    title: '部署全体の設定を変更する',
    body: `開発部の全員について、日次サマリを 10:30 に変更して、
週次レポートのメール通知を ON にしてください。
ほかの設定は変えないでください。`,
    note: 'miitel_update_user_settings に departmentId: "dev" を渡すだけ。画面には一括更新機能がない。',
  },
  {
    title: '通知先メールの設定漏れを全員分埋める',
    body: `通知先メールアドレスが未設定のユーザーがいたら、
本人のログインメールアドレスを通知先に設定してください。`,
    note: 'useOwnEmailAsNotifyEmail: true で、1人ずつ違う値を一度に入れられる。',
  },
];

export default function McpView() {
  const tools = useRegisteredTools();

  return (
    <div className="s-stack">
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">MiiTel MCP</span>
          <span className="s-badge info">WebMCP</span>
        </div>
        <div className="s-card-body s-stack">
          <p style={{ margin: 0 }}>
            この管理コンソールは、<code className="s-mono">document.modelContext</code> を通じて
            AI エージェントに <b>{tools.length} 本のツール</b>を公開しています。
            エージェントは画面をクリックするのではなく、これらのツールを直接呼び出します。
          </p>

          <div className="s-scroll">
            <table className="s-table">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>この管理画面でやる場合</th>
                  <th>MiiTel MCP でやる場合</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="wrap">
                    ユーザー追加は <b>1 回のダイアログにつき 1 名</b>。
                    CSV 一括インポートは {PLAN.name} プランでは使えません。
                  </td>
                  <td className="wrap">
                    <code className="s-mono">miitel_create_users</code> に配列を渡すだけ。
                    全件をまず検証し、1 件でも不正なら何も作らずにエラーをまとめて返します。
                  </td>
                </tr>
                <tr>
                  <td className="wrap">
                    追加した直後のユーザーは<b>通知が全 OFF・通知先メールも未設定</b>。
                    ユーザー詳細を開いて 12 項目を設定し、保存する必要があります。
                  </td>
                  <td className="wrap">
                    <code className="s-mono">applyDepartmentTemplate: true</code> を付けるだけで、
                    作成と同時に各人の所属部署の推奨設定が入ります。
                  </td>
                </tr>
                <tr>
                  <td className="wrap">
                    部署の推奨設定は<b>参照用の表があるだけ</b>で、適用ボタンはありません。
                    値を目で読んでフォームに写す作業になります。
                  </td>
                  <td className="wrap">
                    <code className="s-mono">miitel_apply_settings_template</code> で、
                    部署・ロール・「推奨から外れている人だけ」といった条件で一括適用できます。
                  </td>
                </tr>
                <tr>
                  <td className="wrap">
                    一覧に<b>複数選択のチェックボックスがない</b>ため、
                    同じ設定を 10 人に入れるには 10 回同じ操作を繰り返します。
                  </td>
                  <td className="wrap">
                    <code className="s-mono">miitel_update_user_settings</code> は
                    userIds / departmentId / role / status で対象をまとめて指定できます。
                    指定しなかった項目は現在値のまま残ります。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="s-note info">
            <b>設計上のポイント</b>
            <br />
            一括更新の機能は<b>この管理画面には存在しません</b>が、ドメイン上は自然な操作です。
            WebMCP は「UI に画面はないが、意味としては正しい操作」をエージェントに公開できます。
            逆に、検証ロジック（メール重複・許可ドメイン・席数上限・管理者上限・設定値の妥当性）は
            画面とツールで完全に共有していて、ツール側にだけ緩い経路はありません。
          </div>

          <div className="s-note warn">
            <b>安全装置</b>
            <br />
            対象を指定せずに一括更新ツールを呼ぶと、実行されずにエラーが返ります。
            全ユーザーを対象にしたい場合は <code className="s-mono">allUsers: true</code> を明示する必要があります。
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">試してみるプロンプト</span>
          <span className="s-muted">Claude にそのまま貼れます</span>
        </div>
        <div className="s-card-body s-stack">
          {SAMPLE_PROMPTS.map((p) => (
            <div key={p.title}>
              <div className="s-h2">{p.title}</div>
              <pre className="s-console" style={{ maxHeight: 'none' }}>
                {p.body}
              </pre>
              <div className="s-muted" style={{ marginTop: 4 }}>
                → {p.note}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">公開しているツール</span>
          <span className="s-badge">{tools.length} 本</span>
        </div>
        <div className="s-card-body tight">
          <div className="s-scroll">
            <table className="s-table">
              <thead>
                <tr>
                  <th>ツール名</th>
                  <th>種別</th>
                  <th>用途</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.name}>
                    <td className="s-mono">{t.name}</td>
                    <td>
                      {t.annotations?.readOnlyHint ? (
                        <span className="s-badge ok">読取</span>
                      ) : t.annotations?.destructiveHint ? (
                        <span className="s-badge danger">破壊的</span>
                      ) : (
                        <span className="s-badge info">更新</span>
                      )}
                    </td>
                    <td className="wrap">{t.annotations?.title ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
