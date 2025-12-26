# Cloudflare Worker - Claude API Proxy

このWorkerはClaude APIへのリクエストをプロキシし、APIキーを安全に管理します。

## セットアップ

### 1. Wranglerのインストール

```bash
npm install -g wrangler
```

### 2. Cloudflareにログイン

```bash
npx wrangler login
```

### 3. APIキーを設定

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

プロンプトが表示されたら、AnthropicのAPIキーを入力してください。

### 4. デプロイ

```bash
npx wrangler deploy
```

デプロイ後、以下のようなURLが表示されます：
```
https://claude-api-proxy.<your-subdomain>.workers.dev
```

このURLをフロントエンドの `API_ENDPOINT` に設定してください。

## 環境変数

| 変数名 | 説明 | 必須 |
|--------|------|------|
| ANTHROPIC_API_KEY | AnthropicのAPIキー | ✅ |
| ALLOWED_ORIGINS | 許可するオリジン（カンマ区切り） | オプション |

## セキュリティ

- APIキーはCloudflareの環境変数として安全に保存されます
- CORSにより、許可されたオリジンからのみアクセス可能です
- デフォルトでlocalhost、127.0.0.1、*.github.ioからのアクセスを許可しています

## ローカル開発

```bash
npx wrangler dev
```

これにより、`http://localhost:8787` でローカルサーバーが起動します。
