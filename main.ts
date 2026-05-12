/**
 * 学习通助手 - Deno Deploy 代理层
 *
 * 功能：
 * 1. 隐藏 Supabase 密钥（不再暴露在前端）
 * 2. 提供 API 端点代理 Supabase RPC 调用
 * 3. 添加请求验证、限流、参数类型校验
 *
 * 部署命令：
 * deployctl deploy --project=wakeproxy --env-file=.env main.ts
 */

// ===== 配置 =====
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");
const API_SECRET = Deno.env.get("API_SECRET") || "change-me-in-production";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("错误：请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量");
  Deno.exit(1);
}

// ===== 通用 CORS 响应头 =====
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// ===== 限流器 =====
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // 每分钟最多 100 次请求
const RATE_WINDOW = 60 * 1000; // 60 秒

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT) {
    return false;
  }

  record.count++;
  return true;
}

// 定期清理过期的限流记录，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000); // 5 分钟清理一次

// ===== 请求验证 =====
function verifyApiKey(request: Request): boolean {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  const [scheme, key] = authHeader.split(" ");
  if (scheme !== "Bearer" || key !== API_SECRET) {
    return false;
  }

  return true;
}

// ===== 参数类型校验工具 =====
function asString(v: unknown, defaultVal = ""): string {
  if (v === null || v === undefined) return defaultVal;
  return String(v);
}

function asInt(v: unknown, defaultVal = 0): number {
  if (v === null || v === undefined || v === "") return defaultVal;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : defaultVal;
}

function requireField(body: Record<string, unknown>, ...fields: string[]): string | null {
  for (const f of fields) {
    const v = body[f];
    if (v === null || v === undefined || v === "") {
      return `缺少必要参数: ${f}`;
    }
  }
  return null;
}

// ===== Supabase RPC 调用（带超时） =====
const SUPABASE_TIMEOUT = 10 * 1000; // 10 秒

async function callSupabaseRpc(functionName: string, params: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_SERVICE_KEY!,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase RPC 调用失败: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error("Supabase RPC 调用超时");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== 路由处理器 =====
type Handler = (body: Record<string, unknown>) => Promise<Response>;

const routes: Record<string, Handler> = {
  // 激活卡密
  "/api/activate": async (body) => {
    const err = requireField(body, "card_hash", "device_fingerprint");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("activate_card", {
      p_card_hash: asString(body.card_hash),
      p_card_plain: asString(body.card_plain),
      p_device_fingerprint: asString(body.device_fingerprint),
      p_total: asInt(body.total),
      p_tier: asInt(body.tier),
    });
    return jsonResponse({ success: true, data: result });
  },

  // 消耗答题次数
  "/api/consume": async (body) => {
    const err = requireField(body, "card_hash", "device_fingerprint");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("consume_usage", {
      p_card_hash: asString(body.card_hash),
      p_device_fingerprint: asString(body.device_fingerprint),
      p_count: asInt(body.count, 1),
    });
    return jsonResponse({ success: true, data: result });
  },

  // 获取剩余次数
  "/api/get-remaining": async (body) => {
    const err = requireField(body, "card_hash");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("get_card_remaining", {
      p_card_hash: asString(body.card_hash),
    });
    return jsonResponse({ success: true, data: result });
  },

  // 兑换邀请码
  "/api/redeem-invite": async (body) => {
    const err = requireField(body, "invite_code", "device_fingerprint");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("redeem_invite_code", {
      p_invite_code: asString(body.invite_code),
      p_device_fingerprint: asString(body.device_fingerprint),
      p_bonus: asInt(body.bonus),
    });
    return jsonResponse({ success: true, data: result });
  },

  // 注册邀请码
  "/api/register-invite": async (body) => {
    const err = requireField(body, "invite_code", "device_fingerprint");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("register_invite_code", {
      p_invite_code: asString(body.invite_code),
      p_device_fingerprint: asString(body.device_fingerprint),
    });
    return jsonResponse({ success: true, data: result });
  },

  // 获取设备邀请码
  "/api/get-invite-code": async (body) => {
    const err = requireField(body, "device_fingerprint");
    if (err) return jsonResponse({ success: false, error: err }, 400);

    const result = await callSupabaseRpc("get_device_invite_code", {
      p_device_fingerprint: asString(body.device_fingerprint),
    });
    return jsonResponse({ success: true, data: result });
  },
};

// ===== 请求处理 =====
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS 预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // 健康检查端点（无需鉴权）
  if (path === "/" || path === "/health") {
    return jsonResponse({
      success: true,
      service: "wakeproxy",
      version: "1.1.0",
      time: new Date().toISOString(),
    });
  }

  // 只允许 POST 请求
  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "只允许 POST 请求" }, 405);
  }

  // 验证 API 密钥
  if (!verifyApiKey(request)) {
    return jsonResponse({ success: false, error: "未授权" }, 401);
  }

  // 限流检查
  const clientId = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientId)) {
    return jsonResponse({ success: false, error: "请求过于频繁，请稍后重试" }, 429);
  }

  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ success: false, error: "无效的 JSON 请求体" }, 400);
  }

  // 路由分发
  const handler = routes[path];
  if (!handler) {
    return jsonResponse({ success: false, error: "未知的 API 端点" }, 404);
  }

  try {
    return await handler(body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "未知错误";
    console.error(`[${path}] 处理请求时出错:`, msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
}

// ===== 启动服务器 =====
console.log("学习通助手代理服务器启动中...");
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`API 密钥已设置`);
console.log(`限流：${RATE_LIMIT} 次/分钟`);

// 使用 Deno 内置的 serve API（兼容 Deno Deploy）
Deno.serve(handleRequest);
