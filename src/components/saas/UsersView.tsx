'use client';

import { useState } from 'react';
import { DEPARTMENTS, PLAN, ROLE_LABELS, STATUS_LABELS, findDepartment } from '@/lib/saas/masters';
import { ROLES, diffAgainstTemplate } from '@/lib/saas/rules';
import { updateUi } from '@/lib/saas/store';
import { useAppState } from '@/lib/saas/hooks';
import type { User, UserStatus } from '@/lib/saas/types';
import AddUserDialog from './AddUserDialog';

const PAGE_SIZE = 10;

function statusBadge(status: UserStatus) {
  const cls = status === 'active' ? 's-badge ok' : status === 'invited' ? 's-badge info' : 's-badge';
  return <span className={cls}>{STATUS_LABELS[status]}</span>;
}

export default function UsersView() {
  const state = useAppState();
  const [addOpen, setAddOpen] = useState(false);

  const { query, filterDept, filterRole, filterStatus, page } = state.ui;

  let rows: User[] = state.users;
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    rows = rows.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  if (filterDept !== 'ALL') rows = rows.filter((u) => u.departmentId === filterDept);
  if (filterRole !== 'ALL') rows = rows.filter((u) => u.role === filterRole);
  if (filterStatus !== 'ALL') rows = rows.filter((u) => u.status === filterStatus);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="s-stack">
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">ユーザー</span>
          <span className="s-muted s-num">{rows.length} 件</span>
          <span className="s-spacer" />
          <button className="s-btn" disabled title={`${PLAN.name} プランでは利用できません`}>
            CSV で一括インポート
          </button>
          <span className="s-badge">Enterprise 限定</span>
          <button className="s-btn primary" onClick={() => setAddOpen(true)}>
            ＋ ユーザーを追加
          </button>
        </div>

        <div className="s-card-body tight s-stack">
          <div className="s-row">
            <input
              className="s-input"
              style={{ maxWidth: 240 }}
              type="text"
              placeholder="氏名・メールで検索"
              value={query}
              onChange={(e) => updateUi({ query: e.target.value, page: 1 })}
              aria-label="ユーザー検索"
            />
            <select
              className="s-select"
              style={{ maxWidth: 190 }}
              value={filterDept}
              onChange={(e) => updateUi({ filterDept: e.target.value, page: 1 })}
              aria-label="部署で絞り込み"
            >
              <option value="ALL">すべての部署</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="s-select"
              style={{ maxWidth: 150 }}
              value={filterRole}
              onChange={(e) => updateUi({ filterRole: e.target.value, page: 1 })}
              aria-label="ロールで絞り込み"
            >
              <option value="ALL">すべてのロール</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <select
              className="s-select"
              style={{ maxWidth: 140 }}
              value={filterStatus}
              onChange={(e) => updateUi({ filterStatus: e.target.value, page: 1 })}
              aria-label="状態で絞り込み"
            >
              <option value="ALL">すべての状態</option>
              {(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="s-scroll">
            <table className="s-table">
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>ロール</th>
                  <th>部署</th>
                  <th>状態</th>
                  <th>通知先</th>
                  <th>設定</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="s-muted wrap">
                      条件に一致するユーザーはいません。
                    </td>
                  </tr>
                )}
                {visible.map((u) => {
                  const diffs = diffAgainstTemplate(u);
                  return (
                    <tr
                      key={u.id}
                      data-selected={state.ui.selectedUserId === u.id}
                      onClick={() => updateUi({ view: 'user', selectedUserId: u.id })}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div style={{ fontWeight: 550 }}>{u.name}</div>
                        <div className="s-muted s-mono">{u.email}</div>
                      </td>
                      <td>{ROLE_LABELS[u.role]}</td>
                      <td>{findDepartment(u.departmentId)?.name ?? u.departmentId}</td>
                      <td>{statusBadge(u.status)}</td>
                      <td className="s-mono s-muted">
                        {u.settings.notifyEmail || <span className="s-badge danger">未設定</span>}
                      </td>
                      <td>
                        {diffs.length === 0 ? (
                          <span className="s-badge ok">推奨どおり</span>
                        ) : (
                          <span className="s-badge warn">要設定 {diffs.length}</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="s-btn link"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateUi({ view: 'user', selectedUserId: u.id });
                          }}
                        >
                          設定
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="s-row">
            <span className="s-muted s-num">
              {rows.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} / {rows.length}
            </span>
            <span className="s-spacer" />
            <button className="s-btn sm" disabled={current <= 1} onClick={() => updateUi({ page: current - 1 })}>
              前へ
            </button>
            <span className="s-muted s-num">
              {current} / {pageCount}
            </span>
            <button className="s-btn sm" disabled={current >= pageCount} onClick={() => updateUi({ page: current + 1 })}>
              次へ
            </button>
          </div>

          <div className="s-note info">
            この一覧に<b>複数選択のチェックボックスはありません</b>。設定はユーザーを 1 人ずつ開いて保存する必要があります。
            まとめて処理したい場合は、右の MiiTel MCP パネルにあるツールをエージェントから呼び出してください。
          </div>
        </div>
      </div>

      {addOpen && <AddUserDialog onClose={() => setAddOpen(false)} />}
    </div>
  );
}
