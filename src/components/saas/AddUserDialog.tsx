'use client';

import { useState } from 'react';
import { ALLOWED_EMAIL_DOMAIN, DEPARTMENTS, ROLE_LABELS } from '@/lib/saas/masters';
import { ROLES } from '@/lib/saas/rules';
import { createUsers, updateUi } from '@/lib/saas/store';
import type { ValidationError } from '@/lib/saas/types';
import Dialog from './Dialog';

/**
 * ユーザー追加ダイアログ。
 *
 * 1 回の操作で追加できるのは 1 名だけ。これはこのデモの中心にある制約なので、
 * 「まとめて追加」の導線はあえて用意していない（プラン制約として画面上に明示している）。
 */
export default function AddUserDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('member');
  const [departmentId, setDepartmentId] = useState('sales');
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const errorFor = (field: string) => errors.find((e) => e.field === field);

  function submit() {
    const result = createUsers([{ email, name, role, departmentId }], { status: 'invited' });
    if (!result.ok) {
      setErrors(result.errors.flatMap((e) => e.errors));
      return;
    }
    const created = result.users[0];
    onClose();
    updateUi({ view: 'user', selectedUserId: created.id });
  }

  return (
    <Dialog
      title="ユーザーを追加"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="招待を送信"
      submitDisabled={!email.trim() || !name.trim()}
    >
      <div className="s-stack">
        <div className="s-note info">
          このダイアログで追加できるのは <b>1 回につき 1 名</b>です。複数名をまとめて登録するには
          CSV 一括インポート（Enterprise プラン）が必要です。
        </div>

        {errors.length > 0 && (
          <div className="s-note danger">
            <b>入力内容を確認してください</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {errors.map((e, i) => (
                <li key={i}>
                  {e.message}
                  <br />
                  <span className="s-muted">→ {e.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="s-field">
          <label className="s-label" htmlFor="add-email">
            メールアドレス
          </label>
          <input
            id="add-email"
            className="s-input"
            type="text"
            value={email}
            placeholder={`user@${ALLOWED_EMAIL_DOMAIN}`}
            aria-invalid={Boolean(errorFor('email'))}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="s-muted">@{ALLOWED_EMAIL_DOMAIN} のアドレスのみ招待できます。</span>
        </div>

        <div className="s-field">
          <label className="s-label" htmlFor="add-name">
            氏名
          </label>
          <input
            id="add-name"
            className="s-input"
            type="text"
            value={name}
            aria-invalid={Boolean(errorFor('name'))}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="s-grid2">
          <div className="s-field">
            <label className="s-label" htmlFor="add-role">
              ロール
            </label>
            <select id="add-role" className="s-select" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="s-field">
            <label className="s-label" htmlFor="add-dept">
              部署
            </label>
            <select
              id="add-dept"
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

        <div className="s-note warn">
          追加したユーザーの通知設定は<b>すべて OFF</b>、通知先メールアドレスも未設定の状態で作成されます。
          このままでは通知が一切届きません。追加後にユーザー詳細を開いて設定してください。
        </div>
      </div>
    </Dialog>
  );
}
