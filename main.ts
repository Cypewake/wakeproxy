/**
 * 学习通助手 - Deno Deploy 代理层
 * 
 * 功能：
 * 1. 隐藏 Supabase 密钥（不再暴露在前端）
 * 2. 提供 API 端点代理 Supabase RPC 调用
 * 3. 添加请求验证和限流
 * 
 * 部署命令：
 * deployctl deploy --project=xuetong-proxy --env-file=.env main.ts
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ===== 配置 =====
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");
const API_SECRET = Deno.env.get("API_SECRET") || "change-me-in-production";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("错误：请设置 SUPABASE_URL 和 SUPABASE_SERVICE_KEY 环境变量");
  Deno.exit(1);
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

// ===== Supabase RPC 调用 =====
async function callSupabaseRpc(functionName: string, params: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Prefer": "return=representation",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase RPC 调用失败: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// ===== 请求处理 =====
async function handleRequest(request: Request): Promise<Response> {
  // CORS 预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 只允许 POST 请求
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "只允许 POST 请求" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 验证 API 密钥
  if (!verifyApiKey(request)) {
    return new Response(JSON.stringify({ error: "未授权" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 限流检查（使用 IP 或 API 密钥作为标识）
  const clientId = request.headers.get("X-Forwarded-For") || "unknown";
  if (!checkRateLimit(clientId)) {
    return new Response(JSON.stringify({ error: "请求过于频繁，请稍后重试" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "无效的 JSON 请求体" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 路由分发
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    let result: unknown;

    switch (path) {
      // 激活卡密
      case "/api/activate": {
        const { card_hash, card_plain, device_fingerprint, total, tier } = body as Record<string, string | number>;
        if (!card_hash || !device_fingerprint) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("activate_card", {
          p_card_hash: card_hash,
          p_card_plain: card_plain || "",
          p_device_fingerprint: device_fingerprint,
          p_total: total || 0,
          p_tier: tier || "",
        });
        break;
      }

      // 消耗答题次数
      case "/api/consume": {
        const { card_hash, device_fingerprint, count } = body as Record<string, string | number>;
        if (!card_hash || !device_fingerprint) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("consume_usage", {
          p_card_hash: card_hash,
          p_device_fingerprint: device_fingerprint,
          p_count: count || 1,
        });
        break;
      }

      // 获取剩余次数
      case "/api/get-remaining": {
        const { card_hash } = body as Record<string, string>;
        if (!card_hash) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("get_card_remaining", {
          p_card_hash: card_hash,
        });
        break;
      }

      // 兑换邀请码
      case "/api/redeem-invite": {
        const { invite_code, device_fingerprint, bonus } = body as Record<string, string | number>;
        if (!invite_code || !device_fingerprint) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("redeem_invite_code", {
          p_invite_code: invite_code,
          p_device_fingerprint: device_fingerprint,
          p_bonus: bonus || 0,
        });
        break;
      }

      // 注册邀请码
      case "/api/register-invite": {
        const { invite_code, device_fingerprint } = body as Record<string, string>;
        if (!invite_code || !device_fingerprint) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("register_invite_code", {
          p_invite_code: invite_code,
          p_device_fingerprint: device_fingerprint,
        });
        break;
      }

      // 获取设备邀请码
      case "/api/get-invite-code": {
        const { device_fingerprint } = body as Record<string, string>;
        if (!device_fingerprint) {
          return new Response(JSON.stringify({ error: "缺少必要参数" }), { status: 400 });
        }
        result = await callSupabaseRpc("get_device_invite_code", {
          p_device_fingerprint: device_fingerprint,
        });
        break;
      }

      // 未知端点
      default:
        return new Response(JSON.stringify({ error: "未知的 API 端点" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("处理请求时出错:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

// ===== 启动服务器 =====
console.log("学习通助手代理服务器启动中...");
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`API 密钥已设置`);
console.log(`限流：${RATE_LIMIT} 次/分钟`);

// Deno Deploy 会自动管理端口，不需要指定
serve(handleRequest);
