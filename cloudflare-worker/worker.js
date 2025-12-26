/**
 * Cloudflare Worker - Claude API Proxy
 *
 * このWorkerはClaude APIへのリクエストをプロキシし、
 * APIキーを安全にサーバーサイドで管理します。
 *
 * 環境変数:
 * - ANTHROPIC_API_KEY: AnthropicのAPIキー
 * - ALLOWED_ORIGINS: 許可するオリジン（カンマ区切り）
 *
 * レート制限:
 * - 1IPあたり1日50回まで
 */

// レート制限の設定
const RATE_LIMIT = 50;           // 1IPあたりの最大リクエスト数
const RATE_LIMIT_WINDOW = 86400; // 制限期間（秒）= 24時間

// 管理者用シークレットキー（URLパラメータで指定すると制限解除）
const ADMIN_SECRET = "souzou2024mokuteki";

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

    // 管理者キーのチェック（URLパラメータまたは環境変数）
    const url = new URL(request.url);
    const adminKey = url.searchParams.get("admin_key");
    const isAdmin = adminKey === ADMIN_SECRET || adminKey === env.ADMIN_SECRET;

    // クライアントIPを取得
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    // レート制限チェック（KVが設定されていて、管理者でない場合）
    if (env.RATE_LIMIT_KV && !isAdmin) {
      const rateLimitResult = await checkRateLimit(env.RATE_LIMIT_KV, clientIP);

      if (!rateLimitResult.allowed) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded",
            message: `1日あたりのリクエスト上限（${RATE_LIMIT}回）に達しました。明日また利用してください。`,
            remaining: 0,
            resetAt: rateLimitResult.resetAt
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-RateLimit-Limit": String(RATE_LIMIT),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(rateLimitResult.resetAt),
              ...getCORSHeaders(request, env),
            },
          }
        );
      }
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
 * レート制限をチェック・更新
 */
async function checkRateLimit(kv, clientIP) {
  const key = `rate:${clientIP}`;
  const now = Math.floor(Date.now() / 1000);

  // 現在のカウントを取得
  const data = await kv.get(key, { type: "json" });

  if (!data) {
    // 初回アクセス
    const resetAt = now + RATE_LIMIT_WINDOW;
    await kv.put(key, JSON.stringify({ count: 1, resetAt }), {
      expirationTtl: RATE_LIMIT_WINDOW
    });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }

  // 期限切れチェック
  if (now >= data.resetAt) {
    // リセット
    const resetAt = now + RATE_LIMIT_WINDOW;
    await kv.put(key, JSON.stringify({ count: 1, resetAt }), {
      expirationTtl: RATE_LIMIT_WINDOW
    });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
  }

  // 制限チェック
  if (data.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: data.resetAt };
  }

  // カウント増加
  const newCount = data.count + 1;
  await kv.put(key, JSON.stringify({ count: newCount, resetAt: data.resetAt }), {
    expirationTtl: data.resetAt - now
  });

  return { allowed: true, remaining: RATE_LIMIT - newCount, resetAt: data.resetAt };
}

/**
 * 許可されたオリジンかチェック
 */
function isAllowedOrigin(origin, env) {
  if (!origin) return false;

  // 開発環境用: localhostを許可
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return true;
  }

  // GitHub Pages用: souzou-officeのみ許可
  if (origin === "https://souzou-office.github.io") {
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
