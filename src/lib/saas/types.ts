// WebMCP サンプル SaaS — ドメイン型定義

export type Role = 'admin' | 'manager' | 'member' | 'viewer';

export type UserStatus = 'invited' | 'active' | 'suspended';

export type Language = 'ja' | 'en';

export type RetentionDays = 30 | 90 | 180 | 365;

export interface NotificationSettings {
  /** 日次サマリをメールで受け取る */
  emailDailySummary: boolean;
  /** 週次レポートをメールで受け取る */
  emailWeeklyReport: boolean;
  /** メンションされたときメールで通知 */
  emailMention: boolean;
  /** 障害・メンテナンス情報をメールで通知 */
  emailSystemAlert: boolean;
  /** メンションされたときブラウザプッシュ通知 */
  pushMention: boolean;
  /** 担当割り当て変更時にブラウザプッシュ通知 */
  pushAssignment: boolean;
}

export interface UserSettings {
  notifications: NotificationSettings;
  /** 通知の宛先メール。空だと通知が一切飛ばない。 */
  notifyEmail: string;
  /** 日次サマリの送信時刻 HH:MM（30分刻み） */
  dailySummaryTime: string;
  timezone: string;
  language: Language;
  /** 連携先 Slack チャンネル。空なら未連携。 */
  slackChannel: string;
  twoFactorRequired: boolean;
  dataRetentionDays: RetentionDays;
}

/** 部署別推奨設定テンプレート。通知先メールは個人ごとに異なるので含まない。 */
export type TemplateSettings = Omit<UserSettings, 'notifyEmail'>;

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  departmentId: string;
  status: UserStatus;
  settings: UserSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface SettingsTemplate {
  departmentId: string;
  label: string;
  note: string;
  settings: TemplateSettings;
}

export interface ValidationError {
  field: string;
  message: string;
  hint: string;
}

/** 推奨設定との差分 1 件。 */
export interface SettingDiff {
  key: string;
  label: string;
  current: string;
  recommended: string;
}

export interface AuditFinding {
  userId: string;
  name: string;
  email: string;
  departmentId: string;
  diffs: SettingDiff[];
}
