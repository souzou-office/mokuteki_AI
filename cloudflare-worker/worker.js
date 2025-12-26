/**
 * Cloudflare Worker - Claude API Proxy
 *
 * このWorkerはClaude APIへのリクエストをプロキシし、
 * APIキーを安全にサーバーサイドで管理します。
 *
 * 環境変数:
 * - ANTHROPIC_API_KEY: AnthropicのAPIキー
 * - ALLOWED_ORIGINS: 許可するオリジン（カンマ区切り、例: "https://example.com,https://example2.com"）
 */

export default {
  async fetch(request, env, ctx) {
    // CORSプリフライトリクエストの処理
    if (request.method === "OPTIONS") {
      return handleCORS(request, env);
    }

    // POSTリクエストのみ許可
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: getCORSHeaders(request, env),
      });
    }

    // オリジンチェック
    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(origin, env)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: getCORSHeaders(request, env),
      });
    }

    try {
      // リクエストボディを取得
      const body = await request.json();

      // Claude APIにリクエストを転送
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      // レスポンスを取得
      const data = await response.json();

      // クライアントにレスポンスを返す
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          ...getCORSHeaders(request, env),
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Internal server error", details: error.message }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...getCORSHeaders(request, env),
          },
        }
      );
    }
  },
};

/**
 * 許可されたオリジンかチェック
 */
function isAllowedOrigin(origin, env) {
  if (!origin) return false;

  // 開発環境用: localhostを許可
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return true;
  }

  // GitHub Pages用: github.ioを許可
  if (origin.includes("github.io")) {
    return true;
  }

  // 環境変数で指定されたオリジンをチェック
  if (env.ALLOWED_ORIGINS) {
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map(o => o.trim());
    return allowedOrigins.includes(origin);
  }

  return false;
}

/**
 * CORSヘッダーを取得
 */
function getCORSHeaders(request, env) {
  const origin = request.headers.get("Origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * CORSプリフライトリクエストを処理
 */
function handleCORS(request, env) {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(request, env),
  });
}
