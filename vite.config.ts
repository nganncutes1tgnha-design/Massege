import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_SUPABASE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const url = env.VITE_SUPABASE_URL?.trim();
  if (key || url) {
    let publicKey = Boolean(key?.startsWith("sb_publishable_"));
    try {
      const claims = JSON.parse(
        atob((key ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      publicKey ||= claims.role === "anon";
    } catch {
      /* Publishable keys are not JWTs. */
    }
    if (!publicKey)
      throw new Error(
        "VITE_SUPABASE_PUBLISHABLE_KEY must be a public publishable/anon key. Never use a secret or service_role key.",
      );
    if (!url)
      throw new Error(
        "VITE_SUPABASE_URL is required when a Supabase key is configured.",
      );
    const parsed = new URL(url);
    if (
      parsed.username ||
      parsed.password ||
      !(
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname))
      )
    )
      throw new Error("Invalid VITE_SUPABASE_URL.");
  }
  return { server: { host: "0.0.0.0", port: 5173, strictPort: true } };
});
