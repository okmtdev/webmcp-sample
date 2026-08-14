// WebMCP サンプル SaaS — マスタ・制約・部署別推奨設定
//
// ここに定義した「部署別推奨設定」が、画面ではユーザー1人ずつ手で写す作業になり、
// MiiTel MCP からは miitel_apply_settings_template 1 回で終わる。

import type {
  Department,
  Language,
  NotificationSettings,
  RetentionDays,
  Role,
  SettingsTemplate,
  TemplateSettings,
  UserSettings,
  UserStatus,
} from './types';

/** テナントのプラン。一括インポートは Enterprise 限定という設定。 */
export const PLAN = {
  name: 'Business',
  seatLimit: 25,
  adminLimit: 3,
  bulkImportAvailable: false,
} as const;

/** 招待メールのドメイン制限（テナント設定）。 */
export const ALLOWED_EMAIL_DOMAIN = 'example.co.jp';

export const DEPARTMENTS: Department[] = [
  { id: 'sales', name: '営業部' },
  { id: 'support', name: 'カスタマーサポート部' },
  { id: 'cs', name: 'カスタマーサクセス部' },
  { id: 'corp', name: 'コーポレート部' },
  { id: 'dev', name: '開発部' },
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理者',
  manager: 'マネージャー',
  member: 'メンバー',
  viewer: '閲覧のみ',
};

export const STATUS_LABELS: Record<UserStatus, string> = {
  invited: '招待中',
  active: '有効',
  suspended: '停止中',
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
};

export const TIMEZONES = ['Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Europe/London'] as const;

export const RETENTION_OPTIONS: RetentionDays[] = [30, 90, 180, 365];

/** 日次サマリ送信時刻の選択肢（30分刻み）。 */
export const SUMMARY_TIMES: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

export const NOTIFICATION_KEYS: Array<keyof NotificationSettings> = [
  'emailDailySummary',
  'emailWeeklyReport',
  'emailMention',
  'emailSystemAlert',
  'pushMention',
  'pushAssignment',
];

export const NOTIFICATION_LABELS: Record<keyof NotificationSettings, string> = {
  emailDailySummary: '日次サマリ（メール）',
  emailWeeklyReport: '週次レポート（メール）',
  emailMention: 'メンション通知（メール）',
  emailSystemAlert: '障害・メンテナンス通知（メール）',
  pushMention: 'メンション通知（プッシュ）',
  pushAssignment: '担当割り当て変更（プッシュ）',
};

export const SETTING_LABELS: Record<string, string> = {
  ...NOTIFICATION_LABELS,
  notifyEmail: '通知先メールアドレス',
  dailySummaryTime: '日次サマリ送信時刻',
  timezone: 'タイムゾーン',
  language: '表示言語',
  slackChannel: 'Slack 連携チャンネル',
  twoFactorRequired: '二要素認証の必須化',
  dataRetentionDays: 'データ保持期間（日）',
};

function notif(on: Array<keyof NotificationSettings>): NotificationSettings {
  const base: NotificationSettings = {
    emailDailySummary: false,
    emailWeeklyReport: false,
    emailMention: false,
    emailSystemAlert: false,
    pushMention: false,
    pushAssignment: false,
  };
  for (const k of on) base[k] = true;
  return base;
}

/**
 * 新規ユーザーの初期設定。
 * 通知は全て OFF、通知先メールは未設定。つまり作っただけでは何も届かない。
 * 画面から追加した場合、この状態を 1 人ずつ手で直していくことになる。
 */
export function defaultUserSettings(): UserSettings {
  return {
    notifications: notif([]),
    notifyEmail: '',
    dailySummaryTime: '09:00',
    timezone: 'Asia/Tokyo',
    language: 'ja',
    slackChannel: '',
    twoFactorRequired: false,
    dataRetentionDays: 30,
  };
}

/** 部署別推奨設定（運用ルール）。画面には一括適用ボタンがない。 */
export const SETTINGS_TEMPLATES: SettingsTemplate[] = [
  {
    departmentId: 'sales',
    label: '営業部 標準',
    note: '商談の取りこぼしを防ぐため、メンションはメール・プッシュ両方で受け取る。',
    settings: {
      notifications: notif(['emailDailySummary', 'emailWeeklyReport', 'emailMention', 'pushMention', 'pushAssignment']),
      dailySummaryTime: '09:00',
      timezone: 'Asia/Tokyo',
      language: 'ja',
      slackChannel: '#sales-alerts',
      twoFactorRequired: false,
      dataRetentionDays: 90,
    },
  },
  {
    departmentId: 'support',
    label: 'カスタマーサポート部 標準',
    note: '始業前に当日分を確認するため、日次サマリは 08:30。障害通知は必須。',
    settings: {
      notifications: notif(['emailDailySummary', 'emailMention', 'emailSystemAlert', 'pushMention', 'pushAssignment']),
      dailySummaryTime: '08:30',
      timezone: 'Asia/Tokyo',
      language: 'ja',
      slackChannel: '#support-alerts',
      twoFactorRequired: false,
      dataRetentionDays: 180,
    },
  },
  {
    departmentId: 'cs',
    label: 'カスタマーサクセス部 標準',
    note: '日次は不要。週次レポートで推移を追う。',
    settings: {
      notifications: notif(['emailWeeklyReport', 'emailMention', 'pushMention']),
      dailySummaryTime: '09:00',
      timezone: 'Asia/Tokyo',
      language: 'ja',
      slackChannel: '#cs-notify',
      twoFactorRequired: false,
      dataRetentionDays: 180,
    },
  },
  {
    departmentId: 'corp',
    label: 'コーポレート部 標準',
    note: '監査要件により保持期間 365 日、二要素認証は必須。',
    settings: {
      notifications: notif(['emailWeeklyReport', 'emailSystemAlert']),
      dailySummaryTime: '09:00',
      timezone: 'Asia/Tokyo',
      language: 'ja',
      slackChannel: '#corp-notify',
      twoFactorRequired: true,
      dataRetentionDays: 365,
    },
  },
  {
    departmentId: 'dev',
    label: '開発部 標準',
    note: '障害通知とメンションのみ。二要素認証は必須。',
    settings: {
      notifications: notif(['emailSystemAlert', 'pushMention']),
      dailySummaryTime: '10:00',
      timezone: 'Asia/Tokyo',
      language: 'ja',
      slackChannel: '#dev-alerts',
      twoFactorRequired: true,
      dataRetentionDays: 365,
    },
  },
];

export function findDepartment(id: string): Department | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}

export function findTemplate(departmentId: string): SettingsTemplate | undefined {
  return SETTINGS_TEMPLATES.find((t) => t.departmentId === departmentId);
}

export function templateSettingsOf(departmentId: string): TemplateSettings | undefined {
  return findTemplate(departmentId)?.settings;
}
