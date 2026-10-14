import { createClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function validPublicKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const payload = key.split(".")[1];
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return claims.role === "anon";
  } catch {
    return false;
  }
}

function validProjectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname)))
    );
  } catch {
    return false;
  }
}

export const backendStatus =
  !projectUrl && !publicKey
    ? "demo"
    : projectUrl &&
        publicKey &&
        validProjectUrl(projectUrl) &&
        validPublicKey(publicKey)
      ? "configured"
      : "invalid";

export const supabase =
  backendStatus === "configured"
    ? createClient(projectUrl!, publicKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function readableError(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code;
  if (code === "invalid_credentials") return "Email hoặc mật khẩu chưa đúng.";
  if (code === "email_not_confirmed")
    return "Bạn hãy xác nhận email trước khi đăng nhập nhé.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "Bạn đã thử nhiều lần. Vui lòng chờ một chút rồi thử lại.";
  if (code === "weak_password")
    return "Mật khẩu chưa đủ mạnh. Hãy chọn mật khẩu dài và khó đoán hơn.";
  if (code === "user_already_exists")
    return "Tài khoản đã tồn tại. Hãy đăng nhập hoặc đặt lại mật khẩu.";
  return fallback;
}
