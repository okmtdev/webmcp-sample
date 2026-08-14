// MiiTel MCP — WebMCP サンプル SaaS 管理コンソールが公開するツール群
//
// 管理画面は「ユーザーは1件ずつ追加」「設定は1人ずつ保存」しかできない。
// ここで公開するツールは、同じドメインロジックの上に
//   - 一括作成
//   - 条件を指定した一括設定
//   - 部署別推奨設定の一括適用
//   - 設定漏れの監査
// を載せる。UI に画面がない操作でも、ドメイン上自然なら公開できるのが WebMCP の利点。

import {
  ALLOWED_EMAIL_DOMAIN,
  DEPARTMENTS,
  LANGUAGE_LABELS,
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  PLAN,
  RETENTION_OPTIONS,
  ROLE_LABELS,
  SETTINGS_TEMPLATES,
  STATUS_LABELS,
  TIMEZONES,
  findDepartment,
  findTemplate,
} from './masters';
import { ROLES, auditUsers, diffAgainstTemplate, isCompliant } from './rules';
import type { SettingsPatch } from './rules';
import {
  bulkApplyTemplate,
  bulkPatchSettings,
  createUsers,
  getState,
  resetDemoData,
  resolveUser,
  seatUsage,
  setUserStatus,
  updateUi,
  updateUserProfile,
} from './store';
import type { ViewName } from './store';
import type { User, UserStatus } from './types';
import { errorResult, textResult } from '../webmcp/registry';
import type { ToolDescriptor } from '../webmcp/types';

// ---- 共通ヘルパー -----------------------------------------------------------

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function deptName(id: string): string {
  return findDepartment(id)?.name ?? id;
}

function userLine(u: User): string {
  const flag = isCompliant(u) ? '✔ 推奨どおり' : '✗ 要設定';
  return `  ${u.id}  ${u.email}  ${u.name}  ${ROLE_LABELS[u.role]}  ${deptName(u.departmentId)}  ${STATUS_LABELS[u.status]}  ${flag}`;
}

function settingsBlock(u: User): string {
  const n = u.settings.notifications;
  const notif = NOTIFICATION_KEYS.map((k) => `    ${NOTIFICATION_LABELS[k]}: ${n[k] ? 'ON' : 'OFF'}`).join('\n');
  return [
    `    通知先メール: ${u.settings.notifyEmail || '（未設定 ※このままでは通知が届きません）'}`,
    notif,
    `    日次サマリ送信時刻: ${u.settings.dailySummaryTime}`,
    `    タイムゾーン: ${u.settings.timezone}`,
    `    表示言語: ${LANGUAGE_LABELS[u.settings.language]}`,
    `    Slack 連携: ${u.settings.slackChannel || '（未連携）'}`,
    `    二要素認証の必須化: ${u.settings.twoFactorRequired ? 'ON' : 'OFF'}`,
    `    データ保持期間: ${u.settings.dataRetentionDays} 日`,
  ].join('\n');
}

// ---- 対象ユーザーの絞り込み -------------------------------------------------

const TARGET_SCHEMA_PROPS = {
  userIds: {
    type: 'array',
    description: 'ユーザーID（U-0001 形式）またはメールアドレスの配列。個別に指定する場合。',
    items: { type: 'string' },
  },
  departmentId: { type: 'string', description: '部署IDで絞り込む（sales / support / cs / corp / dev）。' },
  role: { type: 'string', enum: ['admin', 'manager', 'member', 'viewer'], description: 'ロールで絞り込む。' },
  status: { type: 'string', enum: ['invited', 'active', 'suspended'], description: '状態で絞り込む。' },
  onlyNonCompliant: {
    type: 'boolean',
    description: 'true にすると、所属部署の推奨設定と差分があるユーザーだけに絞り込む。',
  },
  allUsers: {
    type: 'boolean',
    description: '全ユーザーを対象にする場合は明示的に true を指定する。誤って全件更新しないための安全装置。',
  },
} as const;

/** miitel_set_user_status では `status` を「変更後の状態」に使うため、絞り込み側は filterStatus にする。 */
const { status: _unusedTargetStatus, ...TARGET_SCHEMA_PROPS_WITHOUT_STATUS } = TARGET_SCHEMA_PROPS;

interface TargetResolution {
  users: User[];
  description: string;
  error?: string;
}

function resolveTargets(args: Record<string, unknown>): TargetResolution {
  const all = getState().users;
  const criteria: string[] = [];

  const rawIds = Array.isArray(args.userIds) ? (args.userIds as unknown[]).map((x) => String(x)) : [];
  const departmentId = asString(args.departmentId);
  const role = asString(args.role);
  const status = asString(args.status);
  const onlyNonCompliant = args.onlyNonCompliant === true;
  const allUsers = args.allUsers === true;

  if (rawIds.length === 0 && !departmentId && !role && !status && !onlyNonCompliant && !allUsers) {
    return {
      users: [],
      description: '',
      error:
        '対象が指定されていません。userIds / departmentId / role / status / onlyNonCompliant のいずれかを指定するか、全ユーザーを対象にするなら allUsers=true を明示してください。',
    };
  }

  let users: User[];
  if (rawIds.length > 0) {
    const missing: string[] = [];
    users = [];
    for (const key of rawIds) {
      const u = resolveUser(key);
      if (u) users.push(u);
      else missing.push(key);
    }
    if (missing.length > 0) {
      return { users: [], description: '', error: `次のユーザーが見つかりません: ${missing.join(', ')}` };
    }
    criteria.push(`指定 ${rawIds.length} 件`);
  } else {
    users = all;
  }

  if (departmentId) {
    if (!findDepartment(departmentId)) {
      return { users: [], description: '', error: `部署ID「${departmentId}」は存在しません。` };
    }
    users = users.filter((u) => u.departmentId === departmentId);
    criteria.push(`部署=${deptName(departmentId)}`);
  }
  if (role) {
    users = users.filter((u) => u.role === role);
    criteria.push(`ロール=${ROLE_LABELS[role as User['role']] ?? role}`);
  }
  if (status) {
    users = users.filter((u) => u.status === status);
    criteria.push(`状態=${STATUS_LABELS[status as UserStatus] ?? status}`);
  }
  if (onlyNonCompliant) {
    users = users.filter((u) => !isCompliant(u));
    criteria.push('推奨設定と差分あり');
  }
  if (allUsers && criteria.length === 0) {
    criteria.push('全ユーザー');
  }

  return { users, description: criteria.join(' / ') || '全ユーザー' };
}

// ---- ツール定義 -------------------------------------------------------------

const getAdminGuide: ToolDescriptor = {
  name: 'miitel_get_admin_guide',
  description:
    'この管理コンソールの仕様をまとめて返す。ロール、ユーザーの状態、設定項目の一覧、部署別の推奨設定テンプレート、プランの制約（席数・管理者数・許可ドメイン）が含まれる。他のツールを使う前に最初に読むこと。',
  annotations: { title: '管理コンソールの仕様を取得', readOnlyHint: true },
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const seats = seatUsage();
    const templates = SETTINGS_TEMPLATES.map((t) => {
      const on = NOTIFICATION_KEYS.filter((k) => t.settings.notifications[k]).map((k) => NOTIFICATION_LABELS[k]);
      return [
        `  ● ${t.label}（departmentId=${t.departmentId}）`,
        `     ${t.note}`,
        `     ONにする通知: ${on.length ? on.join(' / ') : 'なし'}`,
        `     日次サマリ送信時刻: ${t.settings.dailySummaryTime} / Slack: ${t.settings.slackChannel || '未連携'}`,
        `     二要素認証: ${t.settings.twoFactorRequired ? '必須' : '任意'} / データ保持: ${t.settings.dataRetentionDays} 日`,
      ].join('\n');
    }).join('\n\n');

    const text = `# WebMCP サンプル SaaS 管理コンソール 仕様

## プラン制約（${PLAN.name} プラン）
  ライセンス席数: ${seats.used} / ${PLAN.seatLimit} 席（状態 suspended のユーザーは席を消費しない）
  管理者(admin)の上限: ${seats.admins} / ${PLAN.adminLimit} 名
  招待可能なメールドメイン: @${ALLOWED_EMAIL_DOMAIN} のみ
  CSV 一括インポート: ${PLAN.bulkImportAvailable ? '利用可' : '利用不可（Enterprise プラン限定）'}

## ロール
${ROLES.map((r) => `  ${r}: ${ROLE_LABELS[r]}`).join('\n')}

## ユーザーの状態
  invited: 招待メール送信済み・未ログイン
  active: 有効
  suspended: 停止中（席を消費しない）

## 部署
${DEPARTMENTS.map((d) => `  ${d.id}: ${d.name}`).join('\n')}

## ユーザーごとの設定項目
  通知（6項目・すべて既定 OFF）
${NOTIFICATION_KEYS.map((k) => `    ${k}: ${NOTIFICATION_LABELS[k]}`).join('\n')}
  notifyEmail: 通知先メールアドレス。既定は空。通知を1つでも ON にするなら必須。
  dailySummaryTime: 日次サマリ送信時刻。00:00〜23:30 の 30 分刻み。
  timezone: ${TIMEZONES.join(' / ')}
  language: ja / en
  slackChannel: 連携先チャンネル。# から始まる小文字の名前。空なら未連携。
  twoFactorRequired: 二要素認証の必須化。
  dataRetentionDays: ${RETENTION_OPTIONS.join(' / ')} のいずれか。

## 重要: 新規ユーザーの初期状態
  ユーザーを作成しただけでは、通知は全て OFF・通知先メールも未設定です。
  つまり「作っただけでは何も届かない」状態になります。
  管理画面ではこれをユーザーごとに1人ずつ開いて設定・保存する必要があります。

## 部署別 推奨設定テンプレート（運用ルール）
${templates}

## 使い方の目安
  1. miitel_list_users で現状を把握する
  2. miitel_create_users でユーザーをまとめて作成する
     （applyDepartmentTemplate=true にすると作成と同時に推奨設定が入る）
  3. 既存ユーザーは miitel_audit_settings で設定漏れを洗い出す
  4. miitel_apply_settings_template で推奨設定を一括適用する
  5. 個別の例外は miitel_update_user_settings で調整する
`;
    return textResult(text, {
      plan: PLAN,
      seats,
      departments: DEPARTMENTS,
      roles: ROLES,
      templates: SETTINGS_TEMPLATES,
      allowedEmailDomain: ALLOWED_EMAIL_DOMAIN,
    });
  },
};

const listDepartments: ToolDescriptor = {
  name: 'miitel_list_departments',
  description: '部署の一覧と、それぞれの推奨設定テンプレートの概要、所属人数を返す。',
  annotations: { title: '部署一覧を取得', readOnlyHint: true },
  inputSchema: { type: 'object', properties: {} },
  execute: () => {
    const users = getState().users;
    const rows = DEPARTMENTS.map((d) => {
      const members = users.filter((u) => u.departmentId === d.id);
      const nonCompliant = members.filter((u) => u.status !== 'suspended' && !isCompliant(u)).length;
      const t = findTemplate(d.id);
      return `  ${d.id}  ${d.name}  所属 ${members.length} 名（要設定 ${nonCompliant} 名）  推奨テンプレート: ${t ? t.label : 'なし'}`;
    }).join('\n');
    return textResult(`部署一覧\n${rows}`, { departments: DEPARTMENTS, templates: SETTINGS_TEMPLATES });
  },
};

const listUsers: ToolDescriptor = {
  name: 'miitel_list_users',
  description:
    'ユーザーの一覧を取得する。部署・ロール・状態・キーワードで絞り込める。onlyNonCompliant=true にすると推奨設定と差分のあるユーザーだけを返す。',
  annotations: { title: 'ユーザー一覧を取得', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      departmentId: { type: 'string', description: '部署IDで絞り込む。' },
      role: { type: 'string', enum: ['admin', 'manager', 'member', 'viewer'], description: 'ロールで絞り込む。' },
      status: { type: 'string', enum: ['invited', 'active', 'suspended'], description: '状態で絞り込む。' },
      query: { type: 'string', description: '氏名・メールアドレスの部分一致で絞り込む。' },
      onlyNonCompliant: { type: 'boolean', description: '推奨設定と差分のあるユーザーだけに絞り込む。' },
      includeSettings: { type: 'boolean', description: 'true にすると各ユーザーの設定内容も本文に含める。' },
    },
  },
  execute: (args) => {
    let users = getState().users;
    const departmentId = asString(args.departmentId);
    const role = asString(args.role);
    const status = asString(args.status);
    const query = asString(args.query).toLowerCase();

    if (departmentId) users = users.filter((u) => u.departmentId === departmentId);
    if (role) users = users.filter((u) => u.role === role);
    if (status) users = users.filter((u) => u.status === status);
    if (query) {
      users = users.filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));
    }
    if (args.onlyNonCompliant === true) users = users.filter((u) => !isCompliant(u));

    if (users.length === 0) return textResult('条件に一致するユーザーはいません。', { users: [] });

    const body = users
      .map((u) => (args.includeSettings === true ? `${userLine(u)}\n${settingsBlock(u)}` : userLine(u)))
      .join('\n');
    const seats = seatUsage();
    return textResult(
      `${users.length} 名ヒットしました（席数 ${seats.used}/${seats.limit}）。\n${body}`,
      { users, seats },
    );
  },
};

const getUser: ToolDescriptor = {
  name: 'miitel_get_user',
  description: 'ユーザー1名の全項目と、所属部署の推奨設定との差分を返す。ユーザーIDでもメールアドレスでも引ける。',
  annotations: { title: 'ユーザーを取得', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: { user: { type: 'string', description: 'ユーザーID（U-0001）またはメールアドレス。' } },
    required: ['user'],
  },
  execute: (args) => {
    const u = resolveUser(asString(args.user));
    if (!u) return errorResult(`ユーザー ${asString(args.user)} が見つかりません。`);
    const diffs = diffAgainstTemplate(u);
    const diffText =
      diffs.length === 0
        ? '  推奨設定との差分はありません。'
        : diffs.map((d) => `  - ${d.label}: 現在「${d.current}」→ 推奨「${d.recommended}」`).join('\n');
    return textResult(
      `${userLine(u)}\n  設定:\n${settingsBlock(u)}\n  推奨設定との差分（${diffs.length} 件）:\n${diffText}`,
      { user: u, diffs },
    );
  },
};

const auditSettings: ToolDescriptor = {
  name: 'miitel_audit_settings',
  description:
    '全ユーザーの設定を所属部署の推奨設定と突き合わせ、差分のあるユーザーと項目を一覧で返す。状態を一切変更しないので、一括適用の前に必ず確認できる。',
  annotations: { title: '設定漏れを監査', readOnlyHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      departmentId: { type: 'string', description: '特定の部署だけを監査する場合に指定。' },
    },
  },
  execute: (args) => {
    const departmentId = asString(args.departmentId);
    let users = getState().users;
    if (departmentId) {
      if (!findDepartment(departmentId)) return errorResult(`部署ID「${departmentId}」は存在しません。`);
      users = users.filter((u) => u.departmentId === departmentId);
    }

    const findings = auditUsers(users);
    const checked = users.filter((u) => u.status !== 'suspended').length;

    if (findings.length === 0) {
      return textResult(`対象 ${checked} 名を確認しました。推奨設定から外れているユーザーはいません。`, {
        checked,
        findings: [],
      });
    }

    const body = findings
      .map(
        (f) =>
          `  ${f.userId} ${f.name}（${deptName(f.departmentId)}） 差分 ${f.diffs.length} 件\n` +
          f.diffs.map((d) => `      - ${d.label}: 現在「${d.current}」→ 推奨「${d.recommended}」`).join('\n'),
      )
      .join('\n');
    const totalDiffs = findings.reduce((s, f) => s + f.diffs.length, 0);

    return textResult(
      `対象 ${checked} 名のうち ${findings.length} 名が推奨設定から外れています（差分 合計 ${totalDiffs} 項目）。\n${body}\n\n` +
        `miitel_apply_settings_template に onlyNonCompliant=true を指定すると、この ${findings.length} 名にまとめて適用できます。`,
      { checked, findings, totalDiffs },
    );
  },
};

const createUserTool: ToolDescriptor = {
  name: 'miitel_create_user',
  description:
    'ユーザーを1名だけ作成する。画面の「ユーザーを追加」ダイアログとまったく同じ動作。複数名を追加するなら miitel_create_users を使うこと。',
  annotations: { title: 'ユーザーを1名作成', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      email: { type: 'string', description: `メールアドレス。@${ALLOWED_EMAIL_DOMAIN} のみ許可。` },
      name: { type: 'string', description: '氏名（表示名）。' },
      role: { type: 'string', enum: ['admin', 'manager', 'member', 'viewer'], description: 'ロール。' },
      departmentId: { type: 'string', description: '部署ID（sales / support / cs / corp / dev）。' },
      applyDepartmentTemplate: {
        type: 'boolean',
        description: 'true にすると作成と同時に所属部署の推奨設定を適用する。既定 false（画面と同じく通知は全 OFF）。',
      },
      status: { type: 'string', enum: ['invited', 'active'], description: '作成時の状態。既定は invited。' },
    },
    required: ['email', 'name', 'role', 'departmentId'],
  },
  execute: (args) => {
    const result = createUsers(
      [
        {
          email: asString(args.email),
          name: asString(args.name),
          role: asString(args.role),
          departmentId: asString(args.departmentId),
        },
      ],
      {
        applyDepartmentTemplate: args.applyDepartmentTemplate === true,
        status: (asString(args.status) as UserStatus) || undefined,
      },
    );

    if (!result.ok) {
      const msg = result.errors
        .flatMap((e) => e.errors.map((x) => `  [${x.field}] ${x.message}\n     → 対処: ${x.hint}`))
        .join('\n');
      return errorResult(`ユーザーを作成できませんでした。\n${msg}`);
    }

    const u = result.users[0];
    updateUi({ view: 'user', selectedUserId: u.id });
    const hint =
      args.applyDepartmentTemplate === true
        ? '所属部署の推奨設定を適用済みです。'
        : '通知は全て OFF・通知先メールも未設定です。miitel_apply_settings_template で推奨設定を適用してください。';
    return textResult(`${u.id} を作成しました。\n${userLine(u)}\n  ${hint}`, { user: u });
  },
};

const createUsersTool: ToolDescriptor = {
  name: 'miitel_create_users',
  description:
    'ユーザーをまとめて作成する。画面には CSV 一括インポートがない（Enterprise プラン限定）ため、複数名の追加はこのツールが唯一の手段。' +
    '全件をまず検証し、1件でも不正なら何も作成せずに全エラーを返す（中途半端に作られた状態を残さないため）。' +
    'applyDepartmentTemplate=true にすると、作成と同時に各人の所属部署の推奨設定を適用する。',
  annotations: { title: 'ユーザーを一括作成', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      users: {
        type: 'array',
        description: '作成するユーザーの配列。',
        items: {
          type: 'object',
          properties: {
            email: { type: 'string', description: `メールアドレス。@${ALLOWED_EMAIL_DOMAIN} のみ許可。` },
            name: { type: 'string', description: '氏名（表示名）。' },
            role: { type: 'string', enum: ['admin', 'manager', 'member', 'viewer'], description: 'ロール。' },
            departmentId: { type: 'string', description: '部署ID。' },
          },
          required: ['email', 'name', 'role', 'departmentId'],
        },
      },
      applyDepartmentTemplate: {
        type: 'boolean',
        description: 'true にすると作成と同時に所属部署の推奨設定を適用する。強く推奨。',
      },
      status: { type: 'string', enum: ['invited', 'active'], description: '作成時の状態。既定は invited。' },
    },
    required: ['users'],
  },
  execute: (args) => {
    const raw = Array.isArray(args.users) ? (args.users as Array<Record<string, unknown>>) : [];
    if (raw.length === 0) return errorResult('users を 1 件以上指定してください。');

    const inputs = raw.map((r) => ({
      email: asString(r.email),
      name: asString(r.name),
      role: asString(r.role),
      departmentId: asString(r.departmentId),
    }));

    const result = createUsers(inputs, {
      applyDepartmentTemplate: args.applyDepartmentTemplate === true,
      status: (asString(args.status) as UserStatus) || undefined,
    });

    if (!result.ok) {
      const msg = result.errors
        .map((e) => {
          const head = e.index >= 0 ? `  ${e.index + 1} 件目（${e.email || '(メール未入力)'}）` : '  バッチ全体';
          return `${head}\n${e.errors.map((x) => `    [${x.field}] ${x.message}\n       → 対処: ${x.hint}`).join('\n')}`;
        })
        .join('\n');
      return errorResult(
        `${inputs.length} 件のうち検証に失敗したものがあるため、1件も作成していません。\n${msg}`,
      );
    }

    updateUi({ view: 'users', page: 1 });
    const seats = seatUsage();
    const lines = result.users.map((u) => userLine(u)).join('\n');
    const hint =
      args.applyDepartmentTemplate === true
        ? '各ユーザーに所属部署の推奨設定を適用済みです。'
        : '⚠ 通知は全 OFF・通知先メール未設定のままです。miitel_apply_settings_template で推奨設定を適用してください。';

    return textResult(
      `${result.users.length} 名を作成しました（席数 ${seats.used}/${seats.limit}）。\n${lines}\n  ${hint}`,
      { users: result.users, seats },
    );
  },
};

const updateUserSettingsTool: ToolDescriptor = {
  name: 'miitel_update_user_settings',
  description:
    'ユーザーの設定を更新する。userIds で個別指定するほか、departmentId / role / status / onlyNonCompliant で対象をまとめて指定できる。' +
    '指定した項目だけが変更され、指定しなかった項目は現在値のまま残る。' +
    '管理画面には一括更新の機能がないため、複数人に同じ設定を入れたい場合はこのツールを使う。',
  annotations: { title: '設定を更新（一括対応）', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      ...TARGET_SCHEMA_PROPS,
      notifications: {
        type: 'object',
        description: '通知設定。指定したキーだけが変更される。',
        properties: {
          emailDailySummary: { type: 'boolean', description: NOTIFICATION_LABELS.emailDailySummary },
          emailWeeklyReport: { type: 'boolean', description: NOTIFICATION_LABELS.emailWeeklyReport },
          emailMention: { type: 'boolean', description: NOTIFICATION_LABELS.emailMention },
          emailSystemAlert: { type: 'boolean', description: NOTIFICATION_LABELS.emailSystemAlert },
          pushMention: { type: 'boolean', description: NOTIFICATION_LABELS.pushMention },
          pushAssignment: { type: 'boolean', description: NOTIFICATION_LABELS.pushAssignment },
        },
      },
      notifyEmail: { type: 'string', description: '通知先メールアドレス。全員に同じ宛先を入れたい場合に指定する。' },
      useOwnEmailAsNotifyEmail: {
        type: 'boolean',
        description:
          'true にすると、対象ユーザーそれぞれのログインメールアドレスを通知先に設定する。一括更新ではこちらを使うのが普通。',
      },
      dailySummaryTime: { type: 'string', description: '日次サマリ送信時刻 HH:MM（30分刻み）。' },
      timezone: { type: 'string', enum: [...TIMEZONES], description: 'タイムゾーン。' },
      language: { type: 'string', enum: ['ja', 'en'], description: '表示言語。' },
      slackChannel: { type: 'string', description: 'Slack 連携チャンネル（#から始まる）。空文字で連携解除。' },
      twoFactorRequired: { type: 'boolean', description: '二要素認証の必須化。' },
      dataRetentionDays: { type: 'number', enum: [...RETENTION_OPTIONS], description: 'データ保持期間（日）。' },
    },
  },
  execute: (args) => {
    const target = resolveTargets(args);
    if (target.error) return errorResult(target.error);
    if (target.users.length === 0) return textResult(`対象（${target.description}）に該当するユーザーがいません。`);

    const patch: SettingsPatch = {};
    if (args.notifications && typeof args.notifications === 'object') {
      patch.notifications = args.notifications as SettingsPatch['notifications'];
    }
    if (typeof args.notifyEmail === 'string') patch.notifyEmail = args.notifyEmail;
    if (typeof args.dailySummaryTime === 'string') patch.dailySummaryTime = args.dailySummaryTime;
    if (typeof args.timezone === 'string') patch.timezone = args.timezone;
    if (typeof args.language === 'string') patch.language = args.language;
    if (typeof args.slackChannel === 'string') patch.slackChannel = args.slackChannel;
    const twoFactor = asBool(args.twoFactorRequired);
    if (twoFactor !== undefined) patch.twoFactorRequired = twoFactor;
    if (typeof args.dataRetentionDays === 'number') patch.dataRetentionDays = args.dataRetentionDays;

    const useOwn = args.useOwnEmailAsNotifyEmail === true;
    if (Object.keys(patch).length === 0 && !useOwn) {
      return errorResult('変更する項目が 1 つも指定されていません。');
    }

    // 通知先を各ユーザー本人のメールにする場合は、1人ずつ違う値になるので個別に適用する。
    const outcomes = useOwn
      ? target.users.flatMap((u) => bulkPatchSettings([u.id], { ...patch, notifyEmail: u.email }))
      : bulkPatchSettings(
          target.users.map((u) => u.id),
          patch,
        );

    const ok = outcomes.filter((o) => o.ok);
    const ng = outcomes.filter((o) => !o.ok);
    const changed = ok.reduce((s, o) => s + o.changed, 0);

    updateUi({ view: 'users' });

    const body = outcomes.map((o) => `  ${o.ok ? '✔' : '✗'} ${o.userId} ${o.email} ${o.message}`).join('\n');
    const head = `対象（${target.description}）${target.users.length} 名のうち ${ok.length} 名を更新しました（変更 合計 ${changed} 項目）。${
      ng.length ? ` ${ng.length} 名は失敗しています。` : ''
    }`;
    return textResult(`${head}\n${body}`, { outcomes });
  },
};

const applyTemplateTool: ToolDescriptor = {
  name: 'miitel_apply_settings_template',
  description:
    '対象ユーザーに、それぞれの所属部署の推奨設定テンプレートを適用する。通知先メールが未設定の人には本人のログインメールが入る。' +
    'onlyNonCompliant=true と組み合わせると、推奨設定から外れている人だけをまとめて直せる。' +
    '管理画面にはこの一括適用機能が存在しない（1人ずつ手で写す必要がある）。',
  annotations: { title: '部署の推奨設定を一括適用', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: TARGET_SCHEMA_PROPS,
  },
  execute: (args) => {
    const target = resolveTargets(args);
    if (target.error) return errorResult(target.error);
    if (target.users.length === 0) return textResult(`対象（${target.description}）に該当するユーザーがいません。`);

    const outcomes = bulkApplyTemplate(target.users.map((u) => u.id));
    const ok = outcomes.filter((o) => o.ok);
    const changed = ok.reduce((s, o) => s + o.changed, 0);

    updateUi({ view: 'audit' });

    const body = outcomes.map((o) => `  ${o.ok ? '✔' : '✗'} ${o.userId} ${o.email} ${o.message}`).join('\n');
    return textResult(
      `対象（${target.description}）${target.users.length} 名に推奨設定を適用しました。` +
        `成功 ${ok.length} 名 / 変更 合計 ${changed} 項目。\n${body}`,
      { outcomes },
    );
  },
};

const updateProfileTool: ToolDescriptor = {
  name: 'miitel_update_user_profile',
  description: 'ユーザーの氏名・ロール・所属部署を変更する。部署を変えても設定は自動では変わらないので、必要なら推奨設定を適用し直すこと。',
  annotations: { title: 'プロフィールを変更', readOnlyHint: false, destructiveHint: false },
  inputSchema: {
    type: 'object',
    properties: {
      user: { type: 'string', description: 'ユーザーIDまたはメールアドレス。' },
      name: { type: 'string', description: '新しい氏名。' },
      role: { type: 'string', enum: ['admin', 'manager', 'member', 'viewer'], description: '新しいロール。' },
      departmentId: { type: 'string', description: '新しい部署ID。' },
    },
    required: ['user'],
  },
  execute: (args) => {
    const key = asString(args.user);
    const result = updateUserProfile(key, {
      name: typeof args.name === 'string' ? args.name : undefined,
      role: typeof args.role === 'string' ? args.role : undefined,
      departmentId: typeof args.departmentId === 'string' ? args.departmentId : undefined,
    });
    if (!result.ok) {
      const detail = (result.errors ?? []).map((e) => `  [${e.field}] ${e.message}\n     → 対処: ${e.hint}`).join('\n');
      return errorResult(`${result.message}${detail ? `\n${detail}` : ''}`);
    }
    return textResult(`${result.message}\n${userLine(result.user!)}`, { user: result.user });
  },
};

const setStatusTool: ToolDescriptor = {
  name: 'miitel_set_user_status',
  description:
    'ユーザーの状態を変更する（invited / active / suspended）。対象は userIds のほか部署・ロールなどでまとめて指定できる。' +
    'suspended にすると席を解放するので、席数が足りないときに使う。',
  annotations: { title: 'ユーザーの状態を変更', readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      ...TARGET_SCHEMA_PROPS_WITHOUT_STATUS,
      filterStatus: {
        type: 'string',
        enum: ['invited', 'active', 'suspended'],
        description: '現在の状態で対象を絞り込む場合に指定する（変更後の状態ではない）。',
      },
      status: { type: 'string', enum: ['invited', 'active', 'suspended'], description: '変更後の状態。' },
    },
    required: ['status'],
  },
  execute: (args) => {
    const status = asString(args.status) as UserStatus;
    if (!['invited', 'active', 'suspended'].includes(status)) {
      return errorResult('status は invited / active / suspended のいずれかを指定してください。');
    }
    // 絞り込み条件としての status と、変更後の status を取り違えないよう filterStatus を使う。
    const target = resolveTargets({ ...args, status: asString(args.filterStatus) });
    if (target.error) return errorResult(target.error);
    if (target.users.length === 0) return textResult(`対象（${target.description}）に該当するユーザーがいません。`);

    const lines: string[] = [];
    let ok = 0;
    for (const u of target.users) {
      const r = setUserStatus(u.id, status);
      if (r.ok) ok++;
      lines.push(`  ${r.ok ? '✔' : '✗'} ${u.id} ${u.email} ${r.message}`);
    }
    updateUi({ view: 'users' });
    const seats = seatUsage();
    return textResult(
      `対象（${target.description}）${target.users.length} 名のうち ${ok} 名の状態を「${STATUS_LABELS[status]}」にしました（席数 ${seats.used}/${seats.limit}）。\n${lines.join('\n')}`,
      { seats },
    );
  },
};

const navigateUi: ToolDescriptor = {
  name: 'miitel_navigate_ui',
  description: '管理画面の表示を切り替える。処理内容は変わらないが、いま何をしているかを人間の画面上で見せるために使う。',
  annotations: { title: '画面を移動', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  inputSchema: {
    type: 'object',
    properties: {
      view: { type: 'string', enum: ['users', 'user', 'audit', 'mcp'], description: '表示する画面。' },
      user: { type: 'string', description: 'view=user のとき表示するユーザーIDまたはメールアドレス。' },
    },
  },
  execute: (args) => {
    const view = asString(args.view) as ViewName | '';
    const userKey = asString(args.user);
    let selectedUserId: string | undefined;
    if (userKey) {
      const u = resolveUser(userKey);
      if (!u) return errorResult(`ユーザー ${userKey} が見つかりません。`);
      selectedUserId = u.id;
    }
    updateUi({
      ...(view ? { view: view as ViewName } : {}),
      ...(selectedUserId ? { selectedUserId } : {}),
    });
    return textResult(`画面を切り替えました（view=${view || '変更なし'}${selectedUserId ? `, user=${selectedUserId}` : ''}）。`);
  },
};

const resetDemoDataTool: ToolDescriptor = {
  name: 'miitel_reset_demo_data',
  description: 'デモデータを初期状態に戻す。mode="empty" で全ユーザー削除、mode="seed" で初期サンプルを再投入する。',
  annotations: { title: 'デモデータをリセット', readOnlyHint: false, destructiveHint: true },
  inputSchema: {
    type: 'object',
    properties: { mode: { type: 'string', enum: ['seed', 'empty'], description: '既定は seed。' } },
  },
  execute: (args) => {
    const mode = asString(args.mode, 'seed') === 'empty' ? 'empty' : 'seed';
    resetDemoData(mode);
    updateUi({ view: 'users', selectedUserId: null, page: 1 });
    return textResult(mode === 'empty' ? '全ユーザーを削除しました。' : '初期サンプルデータを再投入しました。');
  },
};

export const MIITEL_TOOLS: ToolDescriptor[] = [
  getAdminGuide,
  listDepartments,
  listUsers,
  getUser,
  auditSettings,
  createUserTool,
  createUsersTool,
  updateUserSettingsTool,
  applyTemplateTool,
  updateProfileTool,
  setStatusTool,
  navigateUi,
  resetDemoDataTool,
];
