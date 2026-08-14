# WebMCP サンプルアプリケーション

WebMCP（Web ページが AI エージェントにツールを公開するブラウザ API）のチュートリアル用サンプルです。

**「画面でやると地獄、エージェントに頼むと一瞬」** を体験するためのデモアプリを 2 本収録しています。

| ルート | アプリ | 何のデモか |
| --- | --- | --- |
| `/` | **WebMCP サンプル SaaS 管理コンソール** | ごく普通の SaaS 管理画面。ユーザーは 1 件ずつしか追加できず、通知設定はユーザーごとに手で入れる必要がある。そこに **MiiTel MCP** を定義して一括処理できるようにする。 |
| `/keihi` | スーパーややこしいシステム v.1.0.0 | 1998 年から動いている社内経費精算システム。7 ステップのウィザードと 14 項目の規程チェックを、ツール 1 回の呼び出しで片付ける。 |

- フロントエンドのみで完結します。サーバもデータベースもありません（永続化は `localStorage`）。
- Next.js の静的エクスポート（`output: 'export'`）で、GCP の Cloud Storage にそのまま置けます。
- エージェントは **Claude** を想定しています（接続手順は [§5](#5-claude-から接続する)）。

デプロイ手順は [Deploy.md](./Deploy.md) を参照してください。

> **「MiiTel MCP」について**
> ここでいう MiiTel MCP は、**このページ自身が WebMCP で公開しているツール群**（`miitel_*` の 13 本）を指します。
> 外部の MCP サーバーに接続しているわけではありません。静的フロントエンドの中で完結します。

---

## 1. メインデモ: WebMCP サンプル SaaS 管理コンソール（`/`）

### ストーリー

あなたは情報システム部の担当者です。4 月に **12 名**が入社しました。
全員をこの SaaS に登録し、部署ごとに決まっている通知設定を入れる必要があります。

管理画面の仕様はこうです。

- ユーザー追加は **「＋ ユーザーを追加」ダイアログから 1 回につき 1 名**。
  CSV 一括インポートのボタンはあるが、Business プランでは押せない（Enterprise 限定）。
- 追加したユーザーは **通知が 6 項目すべて OFF、通知先メールアドレスも未設定**。
  つまり **作っただけでは何も届かない**。
- 設定はユーザー詳細を開いて、通知 6 項目・通知先メール・送信時刻・タイムゾーン・言語・
  Slack チャンネル・二要素認証・データ保持期間の **12 項目**を入力して保存する。**保存はユーザー単位**。
- 部署ごとの推奨設定は決まっているが、画面には**参照用の表があるだけ**。
  適用ボタンはないので、値を目で読んでフォームに写す。
- 一覧に**複数選択のチェックボックスはない**。

12 名 ×（ダイアログ 5 項目 ＋ 設定 12 項目 ＋ 画面往復）で、およそ **220 回の操作**。
しかも既存ユーザーにも設定漏れが残っています。

### そこで MiiTel MCP

同じことを、Claude にこう頼みます。

```
4月入社の12名を追加してください。部署ごとの推奨設定も一緒に適用してください。

営業部: b1@example.co.jp 新人1 / b2@example.co.jp 新人2 / b3@example.co.jp 新人3
サポート部: b4@example.co.jp 新人4 / b5@example.co.jp 新人5
CS部: b6@example.co.jp 新人6 / b7@example.co.jp 新人7
開発部: b8@example.co.jp 新人8 / b9@example.co.jp 新人9 / b10@example.co.jp 新人10
コーポレート部: b11@example.co.jp 新人11 / b12@example.co.jp 新人12

全員 member ロールでお願いします。
```

`miitel_create_users` を `applyDepartmentTemplate: true` で 1 回呼ぶだけで終わります。
営業部には `#sales-alerts` と 09:00 の日次サマリ、サポート部には 08:30 と障害通知、
開発部には二要素認証必須と保持期間 365 日 —— 部署ごとに違う設定が、それぞれ正しく入ります。
通知先メールには各人のログインメールが個別に入ります。

> **重要**
> ツール側が検証を甘くしているわけではありません。
> メール重複・許可ドメイン・席数上限・管理者上限・設定値の妥当性は、
> 画面もツールも **まったく同じ検証関数**（`src/lib/saas/rules.ts`）を通ります。
> 違うのは「1 件ずつか、まとめてか」だけです。

### チュートリアル

#### 第 1 幕: まず、手でやってみる（所要 5 分）

`/` を開いて、**1 名だけ**登録してみてください。

1. 「＋ ユーザーを追加」→ メール `test@example.co.jp` / 氏名「テスト 太郎」/ ロール member / 部署 営業部
2. 作成後に開くユーザー詳細で、**通知が全部 OFF・通知先メールが空**であることを確認する
3. 画面下の「参考: 営業部の推奨設定」の表を見ながら、上のフォームに値を写す
   - 日次サマリ ON、週次レポート ON、メンション（メール）ON、メンション（プッシュ）ON、担当割り当て ON
   - 送信時刻 09:00 / Slack `#sales-alerts` / 保持期間 90 日 / 二要素認証 OFF
   - 通知先メールに `test@example.co.jp`
4. 「このユーザーの設定を保存」

……これを **あと 11 回**。左メニューの「設定の点検」を開くと、既存ユーザーにも設定漏れが残っているのが分かります。

#### 第 2 幕: Claude に頼む（所要 30 秒）

上のプロンプトをそのまま貼ります。アプリ内の「MiiTel MCP」画面にも、コピーできる形で置いてあります。

Claude は概ねこう動きます。

1. `miitel_get_admin_guide` — プラン制約・設定項目・部署別推奨設定を読む
2. `miitel_create_users` — 12 名を一括作成（推奨設定も同時適用）
3. `miitel_audit_settings` — 設定漏れが残っていないか確認

右レールの「ツール呼び出しログ」に、呼び出しが 1 行ずつ流れるのが見えます。
中央の画面も一緒に動きます（`miitel_navigate_ui` で Claude が画面を切り替えるため）。

#### 第 3 幕: 人間には面倒すぎる仕事を頼む

**(a) 既存ユーザーの設定漏れをまとめて直す**

```
推奨設定から外れているユーザーを洗い出して、何がどうズレているか教えてください。
問題なければ、そのまま全員に推奨設定を適用してください。
```

`miitel_audit_settings` で差分を提示させてから、`miitel_apply_settings_template` に
`onlyNonCompliant: true` を渡す流れになります。**確認してから適用**できるのがポイントです。

**(b) 部署全体の設定を変える**

```
開発部の全員について、日次サマリを 10:30 に変更して、
週次レポートのメール通知を ON にしてください。ほかの設定は変えないでください。
```

`miitel_update_user_settings` に `departmentId: "dev"` を渡すだけ。
**指定しなかった項目は現在値のまま残ります**。この一括更新に対応する画面は存在しません。

**(c) 席数の制約にぶつからせる**

```
営業部に10名追加してください。
```

ライセンス席数（25 席）を超えると、**1 件も作らずに**エラーを返します。
「停止中のユーザーは席を消費しない」という制約も返るので、Claude は
`miitel_set_user_status` で席を空ける提案をしてきます。

### 公開しているツール（MiiTel MCP）

| ツール名 | 種別 | 内容 |
| --- | --- | --- |
| `miitel_get_admin_guide` | 読取 | プラン制約・ロール・設定項目・部署別推奨設定 |
| `miitel_list_departments` | 読取 | 部署一覧と要設定人数 |
| `miitel_list_users` | 読取 | ユーザー一覧（部署・ロール・状態・キーワード・設定漏れで絞込） |
| `miitel_get_user` | 読取 | ユーザー 1 名の全項目 ＋ 推奨設定との差分 |
| `miitel_audit_settings` | 読取 | 設定漏れの監査。状態は変更しない |
| `miitel_create_user` | 更新 | 1 名だけ作成（画面のダイアログと同じ挙動） |
| `miitel_create_users` | 更新 | **一括作成**。全件検証してから作る。推奨設定の同時適用も可 |
| `miitel_update_user_settings` | 更新 | **条件指定の一括設定更新**。指定した項目だけ変更 |
| `miitel_apply_settings_template` | 更新 | **部署の推奨設定を一括適用** |
| `miitel_update_user_profile` | 更新 | 氏名・ロール・部署の変更 |
| `miitel_set_user_status` | 破壊 | invited / active / suspended の変更（一括可） |
| `miitel_navigate_ui` | 更新 | 画面表示の切り替え（人間に作業を見せるため） |
| `miitel_reset_demo_data` | 破壊 | デモデータの初期化 |

---

## 2. サブデモ: スーパーややこしいシステム v.1.0.0（`/keihi`）

1998 年から動き続けている社内経費精算システムという設定の、極限までややこしい UI です。

- 入力は **7 ステップのウィザード**
- 部門コードは **事業部-部-課** の 3 段ドロップダウン（課コードは連番ではなく欠番あり）
- 費目は **大分類 → 中分類 → 小分類** の 3 段カスケード
- 外貨は**別表2 の社内レートを目で探して手入力**、円換算額も**電卓で計算して手入力**
- 消費税は**内税方式で逆算して手入力**
- 承認者 3 人は**別表3 と社員マスタを突き合わせて自分で特定**
- 合計 5 万円超で**別タブの付表B**が必須、保存に**確認モーダル 3 回**
- 提出時に**社内規程 R01〜R14 の 14 項目チェック**

明細 1 件あたり約 25 回の入力操作。WebMCP なら `create_request` 1 回です。
公開ツールは 13 本（`src/lib/keihi/tools.ts`）。

こちらも画面とツールで同じ検証関数（`src/lib/keihi/rules.ts`）を通ります。

---

## 3. WebMCP とは

WebMCP（Web Model Context Protocol）は、**Web ページ自身が AI エージェント向けのツールを登録できる**
ブラウザ API です。W3C の Web Machine Learning コミュニティで仕様策定が進んでいます。

```js
document.modelContext.registerTool({
  name: 'miitel_create_users',
  description: 'ユーザーをまとめて作成する',
  inputSchema: { type: 'object', properties: { /* ... */ }, required: ['users'] },
  execute: async (args) => ({
    content: [{ type: 'text', text: '12 名を作成しました' }],
  }),
});
```

ポイントは、**ツールの中身がそのページの JavaScript としてページのコンテキストで動く**ことです。
ログイン済みのセッション、画面の状態、クライアント側のロジックをそのまま使えます。
エージェントは DOM を推測してクリックする必要がなく、ページが用意した意味のある操作を呼ぶだけになります。

### このサンプルが前提にしている仕様の状態（2026-08 時点）

| 項目 | 内容 |
| --- | --- |
| 正式な設置場所 | `document.modelContext` |
| 非推奨エイリアス | `navigator.modelContext`（Chrome 150 で deprecate。互換のため残っている） |
| ツール登録 | `registerTool(descriptor)` |
| ツール解除 | 登録時に渡した `AbortSignal` を `abort()` する（`unregisterTool()` は仕様にない） |
| 一括登録 | `provideContext()` / `clearContext()` は **2026-03-05 にドラフトから削除済み**。使わないこと |
| 実行要件 | セキュアコンテキスト（HTTPS または `localhost`）でのみ利用可能 |

実装ごとの差異は `src/lib/webmcp/registry.ts` で吸収しています。
仕様が動いてもここだけ直せば済むようにしてあります。

---

## 4. 動かす

```bash
npm install
npm run dev
# http://localhost:3000        → WebMCP サンプル SaaS
# http://localhost:3000/keihi  → スーパーややこしいシステム
```

`localhost` はセキュアコンテキスト扱いなので、開発中は HTTPS なしで WebMCP が使えます。

静的ビルドを確認する場合:

```bash
npm run build      # out/ に静的ファイルが出力される
npm run preview    # 任意の静的サーバでよい
```

### ブラウザに WebMCP 実装がない場合

このアプリは、`document.modelContext` が見つからなければ **ページ内蔵の最小フォールバック実装**を自分で入れます
（`src/lib/webmcp/polyfill.ts`。既存の実装があれば何もしない非破壊動作です）。

そのため、**拡張機能を入れていなくても**、右レールの
「ツールを手動で試す」パネルから全ツールを実行して挙動を確認できます。
ただし内蔵フォールバックは**外部のエージェントからは見えません**。
Claude から実際に呼ばせるには次章の接続が必要です。

---

## 5. Claude から接続する

WebMCP のページに外部のエージェントを繋ぐには、**ブラウザ拡張機能（ブリッジ）** と
**ローカル MCP サーバ** を経由します。構成はこうです。

```
Claude (Desktop / Code)
   │  MCP (streamable-http)
   ▼
ローカル MCP サーバ  ← ここまでが Claude 側
   │  ネイティブメッセージング
   ▼
WebMCP ブリッジ拡張機能
   │  document.modelContext
   ▼
このページ（WebMCP サンプル SaaS / スーパーややこしいシステム）
```

### 手順

**① WebMCP ブリッジ拡張機能をブラウザに入れる**

Chrome / Edge に WebMCP のブリッジ拡張機能をインストールします。
拡張機能は `document.modelContext` をページに注入し、登録されたツールをローカル MCP サーバへ中継します。

**② ローカル MCP サーバを起動する**

```bash
npm install -g @mcp-b/native-server
mcp-b-native-server      # 既定で 127.0.0.1:12306 を待ち受ける
```

**③ Claude に MCP サーバを登録する**

Claude Code の場合:

```bash
claude mcp add --transport http webmcp http://127.0.0.1:12306/mcp
```

Claude Desktop の場合は `設定 → 開発者 → 設定を編集` から `claude_desktop_config.json` に追記します。

```json
{
  "mcpServers": {
    "webmcp": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

**④ このアプリをブラウザで開いたまま、Claude に話しかける**

ヘッダのバッジが `MiiTel MCP 接続可` になっていれば、拡張機能側の実装が検出されています。
`内蔵のみ` のままなら拡張機能が効いていないので、①②を見直してください。

> **注意**
> - ツールは**ページを開いているタブにしか存在しません**。タブを閉じるとツールも消えます。
> - `/` と `/keihi` は別々のアプリです。**開いているタブのツールだけ**がエージェントから見えます。
>   両方同時に使いたい場合は、それぞれのタブを開いてください。
> - WebMCP はセキュアコンテキスト必須です。`localhost` か HTTPS で開いてください（[Deploy.md](./Deploy.md) 参照）。
> - WebMCP のブリッジ実装（拡張機能・ローカルサーバ）は仕様と並行して活発に動いています。
>   パッケージ名やポートが変わっている場合は、各実装の最新の README に従ってください。
>   接続できない間も、画面右の手動実行パネルでチュートリアルは最後まで進められます。

---

## 6. ツール設計で意識したこと

このサンプルは「WebMCP を使ってみた」以上に、**エージェントに使わせるツールの設計例**を意図しています。

- **画面の操作ではなく、業務の単位でツールを切る。**
  `click_add_user_button` のようなツールは作らない。`miitel_create_users` は 12 名分をまとめて受け取る。
- **UI にない操作でも、ドメイン上正しいなら公開する。**
  一括更新の画面は存在しないが、ドメイン上は自然な操作なのでツールとしては提供する。
  逆に検証ロジックは画面と完全に共有し、ツール側にだけ緩い経路を作らない。
- **エラーは「直し方」まで返す。**
  「席数超過」ではなく「上限 25 席 / 使用中 24 席 / 追加 10 名。停止中のユーザーは席を消費しません」と返す。往復が減る。
- **破壊的な一括操作には安全装置を付ける。**
  対象を指定せずに一括更新ツールを呼ぶとエラーになり、全ユーザー対象には `allUsers: true` の明示が要る。
- **一括作成は「全件検証してから作る」。**
  1 件でも不正なら何も作らず、全エラーをまとめて返す。中途半端に作られた状態を残さない。
- **読取専用ツールを用意して、推測させない。**
  推奨設定も部署コードも `miitel_get_admin_guide` / `miitel_list_departments` で引ける。
- **`annotations.readOnlyHint` / `destructiveHint` を正しく付ける。**
  エージェント側が慎重に扱うべき操作を区別できる。

---

## 7. コードの構成

```
src/
├── app/
│   ├── layout.tsx / globals.css      ルート共通（リセットのみ）
│   ├── page.tsx / saas.css           / → SaaS 管理コンソール
│   ├── not-found.tsx
│   └── keihi/
│       ├── layout.tsx / keihi.css    /keihi → 1998年風スタイル（このセグメントのみ）
│       └── page.tsx
├── components/
│   ├── saas/
│   │   ├── SaasApp.tsx               シェル（ヘッダ・ナビ・席数メーター）
│   │   ├── UsersView.tsx             一覧。複数選択は「ない」
│   │   ├── AddUserDialog.tsx         1回1名だけの追加ダイアログ
│   │   ├── UserDetailView.tsx        ユーザーごとの設定フォーム（本デモの主役）
│   │   ├── AuditView.tsx             設定漏れの点検（直す手段は1人ずつ）
│   │   ├── McpView.tsx               ストーリーと試せるプロンプト
│   │   ├── McpPanel.tsx              右レール: 状態 / 手動実行 / 呼び出しログ
│   │   └── Dialog.tsx
│   └── keihi/                        経費システムの画面一式
└── lib/
    ├── saas/
    │   ├── masters.ts                部署・プラン制約・部署別推奨設定
    │   ├── rules.ts                  検証と推奨設定との差分（UI とツールの共有点）
    │   ├── store.ts                  localStorage 永続の Observable ストア
    │   ├── tools.ts                  MiiTel MCP ツール 13 本
    │   ├── hooks.ts / types.ts
    ├── keihi/                        経費システムのドメインとツール 13 本
    └── webmcp/                       2アプリ共用
        ├── types.ts                  document.modelContext の型定義
        ├── polyfill.ts               非破壊の内蔵フォールバック
        ├── registry.ts               登録ラッパ（実装差異の吸収 + 呼び出しログ + ミラー）
        └── useWebMCP.ts              React フック（AbortSignal で解除）
```

### 登録のしかた（実装の核心）

```ts
// src/lib/webmcp/useWebMCP.ts
useEffect(() => {
  initWebMCP();                                   // document.modelContext を確保
  const controller = new AbortController();
  registerTools(tools, controller.signal);        // まとめて登録
  return () => controller.abort();                // 解除は abort（仕様どおり）
}, [tools]);
```

呼び出し側は、そのページのツール一覧を渡すだけです。

```tsx
// SaaS 管理コンソール
const webmcp = useWebMCPRegistration(MIITEL_TOOLS);
// 経費システム
const webmcp = useWebMCPRegistration(ALL_TOOLS);
```

---

## 8. 制約・既知の注意点

- **サーバはありません。** データはブラウザの `localStorage` にのみ保存されます
  （SaaS は `wmsaas.v1`、経費システムは `syys.v1`）。別のブラウザ・別の端末とは共有されません。
- SaaS のプラン制約はデモ用の固定値です（席数 25 / 管理者 3 名 / 許可ドメイン `example.co.jp`）。
  変更は `src/lib/saas/masters.ts` の `PLAN` から。
- 経費システムの**システム基準日は `2026-08-20` に固定**しています。
  実時刻を使うと未来日チェックの結果が日によって変わり、チュートリアルが再現しなくなるためです。
- **WebMCP はセキュアコンテキスト必須**です。HTTP で配信すると `document.modelContext` は使えません。
- 内蔵フォールバック実装は、あくまで画面内で挙動を確認するためのものです。
  外部エージェントとの接続にはブリッジ拡張機能が必要です。
- npm の WebMCP パッケージ（`@mcp-b/webmcp-polyfill` 等）には**あえて依存していません**。
  仕様の変化を `src/lib/webmcp/` の 4 ファイルに閉じ込めるためです。
  公式パッケージを使いたい場合は `polyfill.ts` を差し替えてください。

---

## ライセンス

[LICENSE](./LICENSE) を参照してください。
