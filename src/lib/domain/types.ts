// スーパーややこしいシステム v.1.0.0 — ドメイン型定義

export type TaxCategory = 'T10' | 'T08' | 'TEX' | 'TNA';

export type EmployeeRole =
  | 'STAFF'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'EXECUTIVE'
  | 'FINANCE'
  | 'CFO';

export interface Employee {
  id: string;
  name: string;
  kana: string;
  role: EmployeeRole;
  divisionCode: string;
  deptCode: string;
  sectionCode: string;
}

export interface Division {
  code: string;
  name: string;
}

export interface Department {
  code: string;
  divisionCode: string;
  name: string;
}

export interface Section {
  code: string;
  deptCode: string;
  name: string;
}

export interface MajorCategory {
  code: string;
  name: string;
  note: string;
}

export interface MiddleCategory {
  code: string;
  majorCode: string;
  name: string;
}

export interface MinorCategory {
  code: string;
  middleCode: string;
  name: string;
  /** 既定の税区分。明細で上書き可能だが規程 R07 の制約を受ける。 */
  defaultTaxCategory: TaxCategory;
  /** 1明細あたりの金額上限（円）。null は上限なし。 */
  unitLimitJpy: number | null;
  /** プロジェクトコードの入力が必須かどうか。 */
  requiresProject: boolean;
  /** 海外区分。1件でも含まれると最終承認者が CFO に格上げされる。 */
  overseas: boolean;
}

export interface FxRate {
  period: string;
  currency: string;
  rate: number;
}

export type AmountBand = 'A' | 'B' | 'C' | 'D';

export interface ApprovalBandRule {
  band: AmountBand;
  minJpy: number;
  /** 上限（この値未満）。null は上限なし。 */
  maxJpy: number | null;
  first: EmployeeRole;
  second: EmployeeRole | null;
  final: EmployeeRole;
  requiresAttachmentB: boolean;
  requiresPreApproval: boolean;
}

export interface ExpenseLine {
  lineNo: number;
  /** YYYY-MM-DD */
  date: string;
  majorCode: string;
  middleCode: string;
  minorCode: string;
  /** JPY / USD / EUR / GBP */
  currency: string;
  amountForeign: number;
  rateUsed: number;
  amountJpy: number;
  taxCategory: TaxCategory;
  reducedRate: boolean;
  taxAmount: number;
  projectCode: string;
  note: string;
}

export interface AttachmentB {
  reason: string;
  destination: string;
  companions: string;
  /** FIN-###### 形式の事前承認番号。 */
  preApprovalNo: string;
}

export interface ApprovalRoute {
  first: string;
  second: string | null;
  final: string;
}

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'approved_1'
  | 'approved_2'
  | 'approved'
  | 'rejected'
  | 'closed';

export interface HistoryEntry {
  at: string;
  actor: string;
  action: string;
  note: string;
}

export interface ExpenseRequest {
  id: string;
  title: string;
  applicantId: string;
  divisionCode: string;
  deptCode: string;
  sectionCode: string;
  /** YYYY-MM */
  period: string;
  lines: ExpenseLine[];
  attachmentB: AttachmentB | null;
  route: ApprovalRoute;
  status: RequestStatus;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleViolation {
  /** R01〜R14 */
  rule: string;
  /** 違反した箇所（明細番号など） */
  location: string;
  message: string;
  /** 修正のヒント。エージェントが自力で直せるように具体値を入れる。 */
  hint: string;
}

export interface Totals {
  amountJpy: number;
  taxAmount: number;
  lineCount: number;
  band: AmountBand;
}
