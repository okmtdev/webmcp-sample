'use client';

import { DEPARTMENTS, findDepartment } from '@/lib/saas/masters';
import { auditUsers } from '@/lib/saas/rules';
import { updateUi } from '@/lib/saas/store';
import { useAppState } from '@/lib/saas/hooks';

/**
 * 設定の点検画面。
 *
 * 「どこがズレているか」までは見せるが、直す手段はユーザーを 1 人ずつ開くことだけ。
 * ここで感じる面倒さが、そのまま miitel_apply_settings_template の価値になる。
 */
export default function AuditView() {
  const state = useAppState();
  const findings = auditUsers(state.users);
  const totalDiffs = findings.reduce((s, f) => s + f.diffs.length, 0);
  const checked = state.users.filter((u) => u.status !== 'suspended').length;

  const byDept = DEPARTMENTS.map((d) => ({
    dept: d,
    count: findings.filter((f) => f.departmentId === d.id).length,
  })).filter((x) => x.count > 0);

  return (
    <div className="s-stack">
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">設定の点検</span>
          <span className="s-muted">部署ごとの推奨設定と突き合わせています</span>
        </div>
        <div className="s-card-body s-stack">
          {findings.length === 0 ? (
            <div className="s-note ok">
              対象 {checked} 名を確認しました。<b>推奨設定から外れているユーザーはいません。</b>
            </div>
          ) : (
            <>
              <div className="s-note warn">
                対象 {checked} 名のうち <b>{findings.length} 名</b>が推奨設定から外れています（差分 合計{' '}
                <b>{totalDiffs} 項目</b>）。
                {byDept.length > 0 && (
                  <>
                    <br />
                    内訳: {byDept.map((x) => `${x.dept.name} ${x.count}名`).join(' / ')}
                  </>
                )}
              </div>

              <div className="s-note info">
                この画面から直す手段は<b>「ユーザーを開いて 1 人ずつ保存する」</b>だけです。
                {totalDiffs} 項目を手で直すと、画面の往復も含めておよそ{' '}
                <b>{findings.length * 3 + totalDiffs} 回</b>の操作になります。
                <br />
                MiiTel MCP なら <code className="s-mono">miitel_apply_settings_template</code> に{' '}
                <code className="s-mono">onlyNonCompliant: true</code> を渡すだけで、この {findings.length} 名すべてが片付きます。
              </div>

              {findings.map((f) => (
                <div className="s-card" key={f.userId}>
                  <div className="s-card-head">
                    <span className="s-card-title">{f.name}</span>
                    <span className="s-mono s-muted">{f.email}</span>
                    <span className="s-badge">{findDepartment(f.departmentId)?.name ?? f.departmentId}</span>
                    <span className="s-badge warn">{f.diffs.length} 項目</span>
                    <span className="s-spacer" />
                    <button
                      className="s-btn sm"
                      onClick={() => updateUi({ view: 'user', selectedUserId: f.userId })}
                    >
                      このユーザーを開く
                    </button>
                  </div>
                  <div className="s-scroll">
                    <table className="s-table">
                      <thead>
                        <tr>
                          <th>項目</th>
                          <th>現在値</th>
                          <th>推奨値</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.diffs.map((d) => (
                          <tr key={d.key}>
                            <td>{d.label}</td>
                            <td className="s-mono">{d.current}</td>
                            <td className="s-mono">{d.recommended}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
