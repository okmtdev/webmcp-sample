# デプロイ手順（GCP Cloud Storage）

WebMCP サンプルアプリケーションを GCP の Cloud Storage に静的ホスティングする手順です。

このアプリはサーバを一切必要としません（`output: 'export'` による完全静的書き出し、永続化は `localStorage`）。
バケットにファイルを置くだけで動きます。

## ビルド成果物のルート構成

`npm run build` は `out/` に次のファイルを出力します。

| ルート | 出力ファイル | アプリ |
| --- | --- | --- |
| `/` | `out/index.html` | WebMCP サンプル SaaS 管理コンソール（MiiTel MCP） |
| `/keihi` | `out/keihi/index.html` | スーパーややこしいシステム v.1.0.0 |
| 404 | `out/404.html` | 共通のエラーページ |

`next.config.mjs` で `trailingSlash: true` を指定しているため、
ディレクトリ形式（`out/keihi/index.html`）で出力されます。
この形が Cloud Storage の `MainPageSuffix` と相性が良いためです。

---

## ⚠️ 最初に読んでください: WebMCP は HTTPS 必須です

WebMCP（`document.modelContext`）は **セキュアコンテキストでしか利用できません**。
`http://` で配信すると `document.modelContext` が使えず、このアプリの主役であるツール連携が動きません。

Cloud Storage には配信エンドポイントが 2 つあり、**HTTPS が使えるかどうかが違います**。

| 配信方法 | URL | HTTPS | ディレクトリ index の自動解決 |
| --- | --- | --- | --- |
| 直接エンドポイント | `https://storage.googleapis.com/BUCKET/index.html` | ✅ あり | ❌ なし（`index.html` を明示） |
| ウェブサイト設定エンドポイント | `http://c.storage.googleapis.com/...` | ❌ **なし** | ✅ あり |
| Cloud Load Balancing 経由 | `https://your-domain/` | ✅ あり | ✅ あり |

そのため、選択肢は次の 2 つです。

- **方法A（最速・5分）**: 直接エンドポイントの HTTPS URL を使う。独自ドメイン不要。
- **方法B（推奨・本番向け）**: Cloud Load Balancing + Google マネージド証明書。ルート URL で配信できる。

---

## 0. 事前準備

```bash
# gcloud CLI の認証とプロジェクト設定
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 以下で使う変数
export PROJECT_ID=your-project-id
export BUCKET=super-yayakoshii-system     # グローバルで一意な名前にすること
export REGION=asia-northeast1
```

Node.js 20 以上が必要です（Next.js 15 の要件）。

---

## 方法A: 直接エンドポイントで最短公開

独自ドメインなしで、5 分で HTTPS 配信できます。デモ・検証用途にはこれで十分です。

この方法ではアプリが `https://storage.googleapis.com/BUCKET/` 配下に置かれるため、
**バケット名をベースパスとしてビルドする必要があります**。

### A-1. ビルド

```bash
npm ci
NEXT_PUBLIC_BASE_PATH="/${BUCKET}" npm run build
# → out/ に静的ファイルが生成される
```

`next.config.mjs` が `NEXT_PUBLIC_BASE_PATH` を読んで `basePath` と `assetPrefix` に設定します。
これを忘れると CSS と JS が 404 になります。

### A-2. バケットを作って公開する

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --location="${REGION}" \
  --uniform-bucket-level-access

# 全体公開（読み取りのみ）
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer
```

> 組織ポリシー `constraints/storage.publicAccessPrevention` が有効だと、この IAM 付与は拒否されます。
> その場合は方法B（Load Balancing）を使うか、管理者にポリシーの例外を依頼してください。

### A-3. アップロード

```bash
gcloud storage rsync out "gs://${BUCKET}" \
  --recursive \
  --delete-unmatched-destination-objects
```

### A-4. キャッシュ制御を設定する

Next.js のハッシュ付きアセットは永久キャッシュ、HTML は毎回検証させます。
**これをやらないと、再デプロイしても古い画面が表示され続けます。**

```bash
# ハッシュ付き静的アセット: 1年 + immutable
gcloud storage objects update "gs://${BUCKET}/_next/static/**" \
  --cache-control="public, max-age=31536000, immutable"

# HTML: キャッシュさせない
gcloud storage objects update "gs://${BUCKET}/**/*.html" \
  --cache-control="no-cache, max-age=0, must-revalidate"
```

### A-5. アクセスする

```
# WebMCP サンプル SaaS 管理コンソール
https://storage.googleapis.com/YOUR_BUCKET_NAME/index.html

# スーパーややこしいシステム
https://storage.googleapis.com/YOUR_BUCKET_NAME/keihi/index.html
```

**`index.html` まで明示してください。** 直接エンドポイントは `MainPageSuffix` を解決しないため、
`.../YOUR_BUCKET_NAME/keihi/` のようにディレクトリで止めると 404 になります。
アプリ内のリンク（ヘッダの「別デモへ」など）もディレクトリ形式のため、
この方法ではリンク遷移が 404 になります。リンクを機能させたい場合は方法B を使ってください。

---

## 方法B: Cloud Load Balancing でルート配信（推奨）

独自ドメインの HTTPS ルート URL（`https://example.com/`）で配信します。
`basePath` が不要になり、ディレクトリ index も 404 ページも自動で解決されます。

### B-1. ビルド（basePath なし）

```bash
npm ci
npm run build
```

### B-2. バケットの作成とウェブサイト設定

```bash
gcloud storage buckets create "gs://${BUCKET}" \
  --location="${REGION}" \
  --uniform-bucket-level-access

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member=allUsers \
  --role=roles/storage.objectViewer

# ディレクトリアクセス時の index と 404 ページ
gcloud storage buckets update "gs://${BUCKET}" \
  --web-main-page-suffix=index.html \
  --web-error-page=404.html

gcloud storage rsync out "gs://${BUCKET}" \
  --recursive \
  --delete-unmatched-destination-objects
```

キャッシュ制御は A-4 と同じコマンドを実行してください。

### B-3. ロードバランサを構成する

```bash
export LB_NAME=syys-lb
export DOMAIN=demo.example.com          # 所有しているドメイン

# 1) バックエンドバケット（Cloud CDN 有効化）
gcloud compute backend-buckets create "${LB_NAME}-backend" \
  --gcs-bucket-name="${BUCKET}" \
  --enable-cdn

# 2) URL マップ
gcloud compute url-maps create "${LB_NAME}-urlmap" \
  --default-backend-bucket="${LB_NAME}-backend"

# 3) Google マネージド SSL 証明書
gcloud compute ssl-certificates create "${LB_NAME}-cert" \
  --domains="${DOMAIN}" \
  --global

# 4) HTTPS プロキシ
gcloud compute target-https-proxies create "${LB_NAME}-https-proxy" \
  --url-map="${LB_NAME}-urlmap" \
  --ssl-certificates="${LB_NAME}-cert"

# 5) 静的 IP
gcloud compute addresses create "${LB_NAME}-ip" --global

# 6) 転送ルール
gcloud compute forwarding-rules create "${LB_NAME}-https-rule" \
  --address="${LB_NAME}-ip" \
  --global \
  --target-https-proxy="${LB_NAME}-https-proxy" \
  --ports=443
```

### B-4. DNS を設定する

払い出された IP を確認し、ドメインの A レコードに設定します。

```bash
gcloud compute addresses describe "${LB_NAME}-ip" --global --format="value(address)"
```

DNS が伝播すると Google マネージド証明書が自動でプロビジョニングされます（通常 15〜60 分）。
状態は次で確認できます。

```bash
gcloud compute ssl-certificates describe "${LB_NAME}-cert" --global \
  --format="value(managed.status)"
# ACTIVE になれば完了
```

### B-5. （任意）HTTP を HTTPS にリダイレクトする

WebMCP は HTTPS でしか動かないので、HTTP のリダイレクトを入れておくと親切です。

```bash
cat > /tmp/redirect.yaml <<'EOF'
kind: compute#urlMap
name: syys-lb-redirect
defaultUrlRedirect:
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
  httpsRedirect: true
EOF

gcloud compute url-maps import "${LB_NAME}-redirect" \
  --source=/tmp/redirect.yaml --global

gcloud compute target-http-proxies create "${LB_NAME}-http-proxy" \
  --url-map="${LB_NAME}-redirect"

gcloud compute forwarding-rules create "${LB_NAME}-http-rule" \
  --address="${LB_NAME}-ip" \
  --global \
  --target-http-proxy="${LB_NAME}-http-proxy" \
  --ports=80
```

---

## 再デプロイ

```bash
npm run build     # 方法A の場合は NEXT_PUBLIC_BASE_PATH を付ける

gcloud storage rsync out "gs://${BUCKET}" \
  --recursive \
  --delete-unmatched-destination-objects

gcloud storage objects update "gs://${BUCKET}/**/*.html" \
  --cache-control="no-cache, max-age=0, must-revalidate"
```

方法B で Cloud CDN を有効にしている場合は、HTML のキャッシュを明示的に落とします。

```bash
gcloud compute url-maps invalidate-cdn-cache "${LB_NAME}-urlmap" \
  --path="/*" --global
```

---

## GitHub Actions で自動デプロイする（任意）

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloud Storage

on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write        # Workload Identity Federation に必要

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - uses: google-github-actions/setup-gcloud@v2

      - name: Upload
        run: |
          gcloud storage rsync out "gs://${{ secrets.GCS_BUCKET }}" \
            --recursive --delete-unmatched-destination-objects
          gcloud storage objects update "gs://${{ secrets.GCS_BUCKET }}/**/*.html" \
            --cache-control="no-cache, max-age=0, must-revalidate"
```

サービスアカウントには `roles/storage.objectAdmin`（対象バケットのみ）を付与してください。
鍵ファイルを GitHub に置くのではなく、Workload Identity Federation を使うことを推奨します。

---

## 片付け

```bash
# 方法A
gcloud storage rm --recursive "gs://${BUCKET}"

# 方法B（ロードバランサは作成と逆順に消す）
gcloud compute forwarding-rules delete "${LB_NAME}-https-rule" --global --quiet
gcloud compute target-https-proxies delete "${LB_NAME}-https-proxy" --quiet
gcloud compute ssl-certificates delete "${LB_NAME}-cert" --global --quiet
gcloud compute url-maps delete "${LB_NAME}-urlmap" --quiet
gcloud compute backend-buckets delete "${LB_NAME}-backend" --quiet
gcloud compute addresses delete "${LB_NAME}-ip" --global --quiet
gcloud storage rm --recursive "gs://${BUCKET}"
```

---

## トラブルシューティング

**画面が真っ白／CSS と JS が 404 になる**
方法A で `NEXT_PUBLIC_BASE_PATH` を付け忘れています。`/BUCKET_NAME` を指定してビルドし直してください。
逆に方法B で付けてしまった場合も同じ症状になります。

**ヘッダのバッジが「MiiTel MCP 内蔵のみ」のままになる**
1. HTTPS で開いているか確認してください（`http://` ではセキュアコンテキストになりません）。
2. WebMCP ブリッジ拡張機能が有効か確認してください（README の「5. Claude から接続する」）。
3. 拡張機能なしでも、画面右の「ツールを手動で試す」パネルからツールは実行できます。

**`/keihi` が 404 になる**
方法A（直接エンドポイント）ではディレクトリ URL が解決されません。
`.../keihi/index.html` まで指定するか、方法B のロードバランサ経由で配信してください。
方法B なら `--web-main-page-suffix=index.html` によって `/keihi/` がそのまま開けます。

**再デプロイしても内容が変わらない**
HTML に長いキャッシュが乗っています。A-4 のキャッシュ制御コマンドを実行し、
Cloud CDN を使っている場合は `invalidate-cdn-cache` も実行してください。

**`AccessDeniedException` / `allUsers` の付与が拒否される**
組織ポリシー `constraints/storage.publicAccessPrevention` が有効です。
バケットを非公開のままにし、方法B のロードバランサ経由で配信してください
（バックエンドバケット経由なら公開 IAM なしで配信できる構成も取れます）。

**403 が返る（バケットは公開したのに）**
Uniform bucket-level access を有効にしたバケットに対して、
オブジェクト単位の ACL（`gsutil acl`）を使おうとしている可能性があります。
IAM（`add-iam-policy-binding`）で付与してください。

**入力したデータが消えた**
データはブラウザの `localStorage` にのみ保存されます
（SaaS 管理コンソールは `wmsaas.v1`、経費システムは `syys.v1`）。
別のブラウザ・シークレットウィンドウ・別ドメインとは共有されません。仕様です。
