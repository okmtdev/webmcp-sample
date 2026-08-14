// WebMCP サンプル SaaS — バリデーションと推奨設定との差分検出
//
// 画面（UserDetailView）と MiiTel MCP ツールは、この同じ関数を通る。
// ツール側にだけ緩い経路を作らないための共有点。

import {
  ALLOWED_EMAIL_DOMAIN,
  NOTIFICATION_KEYS,
  NOTIFICATION_LABELS,
  PLAN,
  RETENTION_OPTIONS,
  SETTING_LABELS,
  SUMMARY_TIMES,
  TIMEZONES,
  findDepartment,
  templateSettingsOf,
} from './masters';
import type {
  AuditFinding,
  NotificationSettings,
  Role,
  SettingDiff,
  User,
  UserSettings,
  ValidationError,
} from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLACK_RE = /^#[a-z0-9][a-z0-9._-]{1,30}$/;

export const ROLES: Role[] = ['admin', 'manager', 'member', 'viewer'];

// ---- ユーザー作成 -----------------------------------------------------------

export interface NewUserInput {
  email: string;
  name: string;
  role: string;
  departmentId: string;
}

/**
 * ユーザー1件分の入力を検証する。
 * existing には「すでに登録済み ＋ 同じ一括投入で先に作られる分」を渡すこと。
 */
export function validateNewUser(input: NewUserInput, existing: User[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const push = (field: string, message: string, hint: string) => errors.push({ field, message, hint });

  const email = (input.email ?? '').trim().toLowerCase();
  if (!email) {
    push('email', 'メールアドレスが未入力です。', `${ALLOWED_EMAIL_DOMAIN} ドメインのアドレスを指定してください。`);
  } else if (!EMAIL_RE.test(email)) {
    push('email', `メールアドレス「${input.email}」の形式が不正です。`, 'user@example.co.jp の形式で入力してください。');
  } else if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    push(
      'email',
      `${email} はテナントの許可ドメイン（${ALLOWED_EMAIL_DOMAIN}）ではありません。`,
      `@${ALLOWED_EMAIL_DOMAIN} のアドレスに変更してください。`,
    );
  } else if (existing.some((u) => u.email.toLowerCase() === email)) {
    push('email', `${email} はすでに登録されています。`, '別のアドレスを指定するか、既存ユーザーを編集してください。');
  }

  if (!(input.name ?? '').trim()) {
    push('name', '氏名が未入力です。', '表示名を入力してください。');
  }

  if (!ROLES.includes(input.role as Role)) {
    push('role', `ロール「${input.role}」は不正です。`, `admin / manager / member / viewer のいずれかを指定してください。`);
  }

  if (!findDepartment(input.departmentId)) {
    push(
      'departmentId',
      `部署ID「${input.departmentId}」は存在しません。`,
      'miitel_list_departments で有効な部署IDを取得してください。',
    );
  }

  return errors;
}

/** 席数上限のチェック。追加しようとしている人数を渡す。 */
export function checkSeatLimit(existing: User[], adding: number): ValidationError | null {
  const used = existing.filter((u) => u.status !== 'suspended').length;
  if (used + adding > PLAN.seatLimit) {
    return {
      field: 'seat',
      message: `ライセンス席数の上限を超えます（上限 ${PLAN.seatLimit} 席 / 使用中 ${used} 席 / 追加 ${adding} 名）。`,
      hint: '不要なユーザーを停止（suspended）にするか、追加人数を減らしてください。停止中のユーザーは席を消費しません。',
    };
  }
  return null;
}

/** 管理者ロールの上限チェック。excludeId は「ロール変更対象の本人」を除外するため。 */
export function checkAdminLimit(existing: User[], addingAdmins: number, excludeId?: string): ValidationError | null {
  const current = existing.filter((u) => u.role === 'admin' && u.id !== excludeId).length;
  if (current + addingAdmins > PLAN.adminLimit) {
    return {
      field: 'role',
      message: `管理者は最大 ${PLAN.adminLimit} 名までです（現在 ${current} 名 / 追加 ${addingAdmins} 名）。`,
      hint: '既存の管理者を manager に変更するか、追加するユーザーのロールを下げてください。',
    };
  }
  return null;
}

// ---- 設定の検証 -------------------------------------------------------------

export function validateSettings(settings: UserSettings): ValidationError[] {
  const errors: ValidationError[] = [];
  const push = (field: string, message: string, hint: string) => errors.push({ field, message, hint });

  const anyNotification = NOTIFICATION_KEYS.some((k) => settings.notifications[k]);
  const notifyEmail = (settings.notifyEmail ?? '').trim();

  if (anyNotification && !notifyEmail) {
    push(
      'notifyEmail',
      '通知が有効なのに通知先メールアドレスが未設定です。このままでは通知が一切届きません。',
      'ユーザー本人のメールアドレスを設定してください。',
    );
  }
  if (notifyEmail && !EMAIL_RE.test(notifyEmail)) {
    push('notifyEmail', `通知先メールアドレス「${notifyEmail}」の形式が不正です。`, 'user@example.co.jp の形式で入力してください。');
  }

  if (!SUMMARY_TIMES.includes(settings.dailySummaryTime)) {
    push(
      'dailySummaryTime',
      `日次サマリ送信時刻「${settings.dailySummaryTime}」は指定できません。`,
      '00:00〜23:30 の 30 分刻み（例: 08:30）で指定してください。',
    );
  }

  if (!(TIMEZONES as readonly string[]).includes(settings.timezone)) {
    push('timezone', `タイムゾーン「${settings.timezone}」は選択肢にありません。`, `${TIMEZONES.join(' / ')} のいずれかを指定してください。`);
  }

  if (settings.language !== 'ja' && settings.language !== 'en') {
    push('language', `表示言語「${settings.language}」は不正です。`, 'ja または en を指定してください。');
  }

  const slack = (settings.slackChannel ?? '').trim();
  if (slack && !SLACK_RE.test(slack)) {
    push('slackChannel', `Slack チャンネル「${slack}」の形式が不正です。`, '#sales-alerts のように # から始まる小文字の名前で指定してください。未連携なら空にしてください。');
  }

  if (!RETENTION_OPTIONS.includes(settings.dataRetentionDays)) {
    push(
      'dataRetentionDays',
      `データ保持期間 ${settings.dataRetentionDays} 日は指定できません。`,
      `${RETENTION_OPTIONS.join(' / ')} のいずれかを指定してください。`,
    );
  }

  return errors;
}

// ---- 設定のマージ -----------------------------------------------------------

export interface SettingsPatch {
  notifications?: Partial<NotificationSettings>;
  notifyEmail?: string;
  dailySummaryTime?: string;
  timezone?: string;
  language?: string;
  slackChannel?: string;
  twoFactorRequired?: boolean;
  dataRetentionDays?: number;
}

/** 部分更新を現在の設定に重ねる。notifications は指定されたキーだけ差し替える。 */
export function mergeSettings(current: UserSettings, patch: SettingsPatch): UserSettings {
  return {
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
    notifyEmail: patch.notifyEmail ?? current.notifyEmail,
    dailySummaryTime: patch.dailySummaryTime ?? current.dailySummaryTime,
    timezone: patch.timezone ?? current.timezone,
    language: (patch.language as UserSettings['language']) ?? current.language,
    slackChannel: patch.slackChannel ?? current.slackChannel,
    twoFactorRequired: patch.twoFactorRequired ?? current.twoFactorRequired,
    dataRetentionDays: (patch.dataRetentionDays as UserSettings['dataRetentionDays']) ?? current.dataRetentionDays,
  };
}

/**
 * 部署別推奨テンプレートを適用する。
 * 通知先メールはテンプレートに含まれないので、未設定なら本人のメールで埋める。
 */
export function applyTemplateToUser(user: User): UserSettings | null {
  const template = templateSettingsOf(user.departmentId);
  if (!template) return null;
  return {
    ...template,
    notifications: { ...template.notifications },
    notifyEmail: user.settings.notifyEmail || user.email,
  };
}

// ---- 推奨設定との差分 -------------------------------------------------------

function displayValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  if (value === '' || value === undefined || value === null) return '（未設定）';
  return String(value);
}

/** ユーザー 1 人の設定を、所属部署の推奨設定と突き合わせる。 */
export function diffAgainstTemplate(user: User): SettingDiff[] {
  const template = templateSettingsOf(user.departmentId);
  const diffs: SettingDiff[] = [];
  if (!template) return diffs;

  for (const key of NOTIFICATION_KEYS) {
    const current = user.settings.notifications[key];
    const recommended = template.notifications[key];
    if (current !== recommended) {
      diffs.push({
        key: `notifications.${key}`,
        label: NOTIFICATION_LABELS[key],
        current: displayValue(key, current),
        recommended: displayValue(key, recommended),
      });
    }
  }

  const scalarKeys: Array<keyof Omit<typeof template, 'notifications'>> = [
    'dailySummaryTime',
    'timezone',
    'language',
    'slackChannel',
    'twoFactorRequired',
    'dataRetentionDays',
  ];
  for (const key of scalarKeys) {
    const current = user.settings[key];
    const recommended = template[key];
    if (current !== recommended) {
      diffs.push({
        key,
        label: SETTING_LABELS[key] ?? key,
        current: displayValue(key, current),
        recommended: displayValue(key, recommended),
      });
    }
  }

  // 通知先メール未設定は推奨設定とは別軸の問題だが、放置すると通知が届かないので併せて出す。
  if (!user.settings.notifyEmail.trim()) {
    diffs.push({
      key: 'notifyEmail',
      label: SETTING_LABELS.notifyEmail,
      current: '（未設定）',
      recommended: user.email,
    });
  }

  return diffs;
}

/** 停止中を除く全ユーザーを監査する。差分のある人だけ返す。 */
export function auditUsers(users: User[]): AuditFinding[] {
  return users
    .filter((u) => u.status !== 'suspended')
    .map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      departmentId: u.departmentId,
      diffs: diffAgainstTemplate(u),
    }))
    .filter((f) => f.diffs.length > 0);
}

/** 画面のバッジ表示用。推奨設定と完全一致していれば true。 */
export function isCompliant(user: User): boolean {
  return diffAgainstTemplate(user).length === 0;
}
