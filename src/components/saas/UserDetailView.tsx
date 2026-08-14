'use client';

import { useState } from 'react';
import {
  DEPARTMENTS,
  LANGUAGE_LABELS,
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  RETENTION_OPTIONS,
  ROLE_LABELS,
  STATUS_LABELS,
  SUMMARY_TIMES,
  TIMEZONES,
  findDepartment,
  findTemplate,
} from '@/lib/saas/masters';
import { ROLES, diffAgainstTemplate } from '@/lib/saas/rules';
import { setUserSettings, setUserStatus, updateUi, updateUserProfile } from '@/lib/saas/store';
import { useAppState } from '@/lib/saas/hooks';
import type { NotificationSettings, RetentionDays, User, UserSettings, UserStatus, ValidationError } from '@/lib/saas/types';

export default function UserDetailView() {
  const state = useAppState();
  const user = state.users.find((u) => u.id === state.ui.selectedUserId);

  if (!user) {
    return (
      <div className="s-card">
        <div className="s-card-body">
          <p className="s-muted">ユーザーが選択されていません。</p>
          <button className="s-btn" onClick={() => updateUi({ view: 'users' })}>
            ユーザー一覧へ戻る
          </button>
        </div>
      </div>
    );
  }

  // ユーザーが切り替わったらフォームの下書きを作り直す。
  return <UserEditor key={user.id} user={user} />;
}

function UserEditor({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<string>(user.role);
  const [departmentId, setDepartmentId] = useState(user.departmentId);
  const [settings, setSettings] = useState<UserSettings>(() => ({
    ...user.settings,
    notifications: { ...user.settings.notifications },
  }));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  const template = findTemplate(user.departmentId);
  const diffs = diffAgainstTemplate(user);

  function patch(p: Partial<UserSettings>) {
    setSettings((s) => ({ ...s, ...p }));
    setSaved(null);
  }

  function toggleNotification(key: keyof NotificationSettings, value: boolean) {
    setSettings((s) => ({ ...s, notifications: { ...s.notifications, [key]: value } }));
    setSaved(null);
  }

  function saveSettings() {
    const result = setUserSettings(user.id, settings);
    if (!result.ok) {
      setErrors(result.errors ?? []);
      setSaved(null);
      return;
    }
    setErrors([]);
    setSaved(`${user.id} の設定を保存しました。`);
  }

  function saveProfile() {
    const result = updateUserProfile(user.id, { name, role, departmentId });
    if (!result.ok) {
      setErrors(result.errors ?? [{ field: 'profile', message: result.message, hint: '' }]);
      return;
    }
    setErrors([]);
    setSaved(result.message);
  }

  function changeStatus(status: UserStatus) {
    const result = setUserStatus(user.id, status);
    setSaved(result.ok ? result.message : null);
    if (!result.ok) setErrors(result.errors ?? [{ field: 'status', message: result.message, hint: '' }]);
  }

  return (
    <div className="s-stack">
      {/* ---- ヘッダ ---- */}
      <div className="s-card">
        <div className="s-card-head">
          <button className="s-btn sm" onClick={() => updateUi({ view: 'users' })}>
            ← 一覧
          </button>
          <span className="s-card-title">{user.name}</span>
          <span className="s-mono s-muted">{user.email}</span>
          <span className="s-badge">{user.id}</span>
          <span className="s-spacer" />
          {diffs.length === 0 ? (
            <span className="s-badge ok">推奨設定どおり</span>
          ) : (
            <span className="s-badge warn">推奨設定と {diffs.length} 項目の差分</span>
          )}
        </div>
        <div className="s-card-body tight s-row">
          <span className="s-muted">状態:</span>
          <span className="s-badge info">{STATUS_LABELS[user.status]}</span>
          <span className="s-spacer" />
          {user.status !== 'active' && (
            <button className="s-btn sm" onClick={() => changeStatus('active')}>
              有効にする
            </button>
          )}
          {user.status !== 'suspended' && (
            <button className="s-btn sm danger" onClick={() => changeStatus('suspended')}>
              停止する
            </button>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="s-note danger">
          <b>保存できませんでした</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {errors.map((e, i) => (
              <li key={i}>
                {e.message}
                {e.hint && (
                  <>
                    <br />
                    <span className="s-muted">→ {e.hint}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {saved && <div className="s-note ok">{saved}</div>}

      {/* ---- プロフィール ---- */}
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">プロフィール</span>
        </div>
        <div className="s-card-body s-stack">
          <div className="s-grid2">
            <div className="s-field">
              <label className="s-label" htmlFor="p-name">
                氏名
              </label>
              <input id="p-name" className="s-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="s-field">
              <label className="s-label" htmlFor="p-role">
                ロール
              </label>
              <select id="p-role" className="s-select" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="s-field">
              <label className="s-label" htmlFor="p-dept">
                部署
              </label>
              <select
                id="p-dept"
                className="s-select"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="s-row">
            <button className="s-btn" onClick={saveProfile}>
              プロフィールを保存
            </button>
            <span className="s-muted">※ 部署を変えても通知設定は自動では変わりません。</span>
          </div>
        </div>
      </div>

      {/* ---- 通知設定 ---- */}
      <div className="s-card">
        <div className="s-card-head">
          <span className="s-card-title">通知設定</span>
          <span className="s-muted">このユーザーにのみ適用されます</span>
        </div>
        <div className="s-card-body s-stack">
          <div className="s-field">
            <label className="s-label" htmlFor="s-notify-email">
              通知先メールアドレス
            </label>
            <input
              id="s-notify-email"
              className="s-input"
              style={{ maxWidth: 320 }}
              value={settings.notifyEmail}
              placeholder="未設定（通知は届きません）"
              onChange={(e) => patch({ notifyEmail: e.target.value })}
            />
          </div>

          <div>
            <div className="s-h2">受け取る通知</div>
            <div className="s-grid2">
              {NOTIFICATION_KEYS.map((key) => (
                <label className="s-check" key={key}>
                  <input
                    type="checkbox"
                    checked={settings.notifications[key]}
                    onChange={(e) => toggleNotification(key, e.target.checked)}
                  />
                  <span>{NOTIFICATION_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          <hr className="s-hr" />

          <div className="s-grid2">
            <div className="s-field">
              <label className="s-label" htmlFor="s-time">
                日次サマリ送信時刻
              </label>
              <select
                id="s-time"
                className="s-select"
                value={settings.dailySummaryTime}
                onChange={(e) => patch({ dailySummaryTime: e.target.value })}
              >
                {SUMMARY_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="s-field">
              <label className="s-label" htmlFor="s-tz">
                タイムゾーン
              </label>
              <select
                id="s-tz"
                className="s-select"
                value={settings.timezone}
                onChange={(e) => patch({ timezone: e.target.value })}
              >
                {TIMEZONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="s-field">
              <label className="s-label" htmlFor="s-lang">
                表示言語
              </label>
              <select
                id="s-lang"
                className="s-select"
                value={settings.language}
                onChange={(e) => patch({ language: e.target.value as UserSettings['language'] })}
              >
                {(Object.keys(LANGUAGE_LABELS) as Array<keyof typeof LANGUAGE_LABELS>).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>

            <div className="s-field">
              <label className="s-label" htmlFor="s-slack">
                Slack 連携チャンネル
              </label>
              <input
                id="s-slack"
                className="s-input"
                value={settings.slackChannel}
                placeholder="#channel-name"
                onChange={(e) => patch({ slackChannel: e.target.value })}
              />
            </div>

            <div className="s-field">
              <label className="s-label" htmlFor="s-retention">
                データ保持期間
              </label>
              <select
                id="s-retention"
                className="s-select"
                value={settings.dataRetentionDays}
                onChange={(e) => patch({ dataRetentionDays: Number(e.target.value) as RetentionDays })}
              >
                {RETENTION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} 日
                  </option>
                ))}
              </select>
            </div>

            <div className="s-field">
              <span className="s-label">セキュリティ</span>
              <label className="s-check">
                <input
                  type="checkbox"
                  checked={settings.twoFactorRequired}
                  onChange={(e) => patch({ twoFactorRequired: e.target.checked })}
                />
                <span>二要素認証を必須にする</span>
              </label>
            </div>
          </div>

          <div className="s-row">
            <button className="s-btn primary" onClick={saveSettings}>
              このユーザーの設定を保存
            </button>
            <span className="s-muted">保存はユーザー単位です。ほかのユーザーには反映されません。</span>
          </div>
        </div>
      </div>

      {/* ---- 部署の推奨設定（参照のみ） ---- */}
      {template && (
        <div className="s-card">
          <div className="s-card-head">
            <span className="s-card-title">
              参考: {findDepartment(user.departmentId)?.name}の推奨設定
            </span>
            <span className="s-badge">運用ルール</span>
          </div>
          <div className="s-card-body s-stack">
            <p className="s-muted" style={{ margin: 0 }}>
              {template.note}
            </p>

            <div className="s-scroll">
              <table className="s-table">
                <thead>
                  <tr>
                    <th>項目</th>
                    <th>推奨値</th>
                    <th>現在値</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIFICATION_KEYS.map((key) => {
                    const rec = template.settings.notifications[key];
                    const cur = user.settings.notifications[key];
                    return (
                      <tr key={key}>
                        <td>{NOTIFICATION_LABELS[key]}</td>
                        <td>{rec ? 'ON' : 'OFF'}</td>
                        <td>
                          {cur ? 'ON' : 'OFF'} {cur !== rec && <span className="s-badge warn">要変更</span>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>日次サマリ送信時刻</td>
                    <td>{template.settings.dailySummaryTime}</td>
                    <td>{user.settings.dailySummaryTime}</td>
                  </tr>
                  <tr>
                    <td>Slack 連携チャンネル</td>
                    <td>{template.settings.slackChannel || '（未連携）'}</td>
                    <td>{user.settings.slackChannel || '（未連携）'}</td>
                  </tr>
                  <tr>
                    <td>二要素認証の必須化</td>
                    <td>{template.settings.twoFactorRequired ? 'ON' : 'OFF'}</td>
                    <td>{user.settings.twoFactorRequired ? 'ON' : 'OFF'}</td>
                  </tr>
                  <tr>
                    <td>データ保持期間</td>
                    <td>{template.settings.dataRetentionDays} 日</td>
                    <td>{user.settings.dataRetentionDays} 日</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="s-note warn">
              この表は<b>参照用</b>です。推奨値をこの画面のフォームへ手で写して保存してください。
              一括適用ボタンはこの管理画面にはありません。
              <br />
              MiiTel MCP には <code className="s-mono">miitel_apply_settings_template</code> があり、
              条件を指定して何人にでも一度に適用できます。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
