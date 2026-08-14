/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Storage は静的ファイルしか配信できないため、完全静的書き出しにする。
  output: 'export',

  // GCS の MainPageSuffix(index.html) と相性が良いディレクトリ形式で出力する。
  // 例: /about -> out/about/index.html
  trailingSlash: true,

  // next/image の最適化サーバは静的ホスティングでは動かせない。
  images: { unoptimized: true },

  // バケット直下ではなくサブパス配信する場合のみ指定する。
  // 例: NEXT_PUBLIC_BASE_PATH=/webmcp-sample npm run build
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
