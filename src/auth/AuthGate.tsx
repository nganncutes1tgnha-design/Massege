import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  Heart,
  LockKeyhole,
  Mail,
  UsersRound,
} from "lucide-react";
import { backendStatus, readableError, supabase } from "../lib/supabase";

type Mode = "login" | "signup" | "reset";

export function AuthGate({
  children,
}: {
  children: (session: Session | null, exit: (() => void) | null) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(
    backendStatus === "configured",
  );
  const [demo, setDemo] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!live) return;
      setSession(next);
      setInitializing(false);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") {
        setRecovering(false);
        setDemo(false);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!live) return;
        if (error)
          setSessionError("Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé.");
        setSession(data.session);
        setInitializing(false);
      })
      .catch(() => {
        if (live) {
          setInitializing(false);
          setSessionError(
            "Chưa kiểm tra được tài khoản. Vui lòng thử đăng nhập lại.",
          );
        }
      });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    setSessionError("");
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) setSessionError("Chưa đăng xuất được. Vui lòng thử lại.");
  }
  if (initializing)
    return (
      <div className="data-state">
        <p role="status">Đang kiểm tra tài khoản…</p>
      </div>
    );
  if (backendStatus === "demo") return children(null, null);
  if (demo) return children(null, () => setDemo(false));
  if (recovering && session)
    return <PasswordRecovery done={() => setRecovering(false)} />;
  if (session)
    return (
      <>
        {sessionError && (
          <div className="session-error" role="alert">
            {sessionError}
          </div>
        )}
        {children(session, () => void logout())}
      </>
    );
  return (
    <AuthScreen
      available={backendStatus === "configured"}
      demo={() => setDemo(true)}
      initialError={sessionError}
    />
  );
}

function AuthScreen({
  available,
  demo,
  initialError,
}: {
  available: boolean;
  demo: () => void;
  initialError: string;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");
  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    if (mode === "signup" && !name.trim()) {
      setError("Bạn điền tên để mọi người nhận ra bạn nhé.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice(
            "Kiểm tra hộp thư và bấm liên kết xác nhận để bắt đầu nhé.",
          );
          setPassword("");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: window.location.origin },
        );
        if (error) throw error;
        setNotice(
          "Nếu email đã có tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu.",
        );
      }
    } catch (cause) {
      setError(
        readableError(
          cause,
          "Chưa kết nối được tài khoản. Bạn thử lại sau một chút nhé.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/" aria-label="Massege">
          <span className="brand-icon">m</span>massege
          <span className="brand-dot">.</span>
        </a>
        <div className="auth-story-content">
          <span className="auth-flower" aria-hidden="true">
            ✺
          </span>
          <p className="eyebrow">MỘT NƠI ĐỂ LÀ CHÍNH BẠN</p>
          <h1>
            Những kết nối nhỏ.
            <br />
            Những câu chuyện lớn.
          </h1>
          <p>
            Một người bạn cùng sở thích, một lời chào đầu tiên. Câu chuyện của
            bạn bắt đầu ở đây.
          </p>
          <div className="auth-story-chips">
            <span>
              <Heart size={15} /> Là chính mình
            </span>
            <span>
              <UsersRound size={16} /> Gặp bạn mới
            </span>
          </div>
        </div>
        <p className="auth-story-footer">made for connection, made for you.</p>
      </section>
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">CHÀO MỪNG ĐẾN VỚI MASSEGE</p>
          <h2>
            {mode === "login"
              ? "Thật vui khi gặp lại bạn"
              : mode === "signup"
                ? "Bắt đầu câu chuyện của bạn"
                : "Tìm lại tài khoản của bạn"}
            <span>.</span>
          </h2>
          <p className="auth-description">
            {mode === "login"
              ? "Đăng nhập để gặp gỡ những người bạn cùng tần số."
              : mode === "signup"
                ? "Tạo hồ sơ riêng và kết nối với những người bạn mới."
                : "Chúng tôi sẽ gửi liên kết đặt lại mật khẩu qua email."}
          </p>
          {available ? (
            <>
              <div className="auth-tabs">
                <button
                  aria-pressed={mode === "login"}
                  className={mode === "login" ? "selected" : ""}
                  onClick={() => switchMode("login")}
                  disabled={busy}
                >
                  Đăng nhập
                </button>
                <button
                  aria-pressed={mode === "signup"}
                  className={mode === "signup" ? "selected" : ""}
                  onClick={() => switchMode("signup")}
                  disabled={busy}
                >
                  Tạo tài khoản
                </button>
              </div>
              <form className="profile-form auth-form" onSubmit={submit}>
                {mode === "signup" && (
                  <label>
                    Tên của bạn
                    <input
                      autoComplete="name"
                      required
                      maxLength={50}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                      placeholder="Bạn muốn mọi người gọi mình là gì?"
                    />
                  </label>
                )}
                <label>
                  Email
                  <div className="auth-input">
                    <Mail size={17} />
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      placeholder="ban@example.com"
                    />
                  </div>
                </label>
                {mode !== "reset" && (
                  <label>
                    Mật khẩu
                    <div className="auth-input">
                      <LockKeyhole size={17} />
                      <input
                        type="password"
                        autoComplete={
                          mode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                        minLength={mode === "signup" ? 8 : 1}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        placeholder={
                          mode === "signup"
                            ? "Ít nhất 8 ký tự"
                            : "Mật khẩu của bạn"
                        }
                      />
                    </div>
                  </label>
                )}
                {mode === "login" && (
                  <button
                    className="forgot-password"
                    type="button"
                    onClick={() => switchMode("reset")}
                    disabled={busy}
                  >
                    Quên mật khẩu?
                  </button>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="auth-notice" role="status">
                    <Check size={17} />
                    {notice}
                  </p>
                )}
                <button
                  className="button primary auth-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? "Đang thực hiện…"
                    : mode === "login"
                      ? "Đăng nhập"
                      : mode === "signup"
                        ? "Tạo tài khoản"
                        : "Gửi liên kết đặt lại"}
                  <ArrowUpRight size={17} />
                </button>
              </form>
            </>
          ) : (
            <p className="auth-notice" role="status">
              Đăng nhập đang tạm thời chưa khả dụng. Bạn có thể khám phá bản mẫu
              trước nhé.
            </p>
          )}
          <div className="auth-demo">
            <span>Ghé thăm trước khi bắt đầu?</span>
            <button className="text-link" onClick={demo}>
              Khám phá bản mẫu <ArrowUpRight size={15} />
            </button>
          </div>
          <p className="auth-privacy">
            Hồ sơ bạn tạo sẽ hiển thị với những thành viên đã đăng nhập.
          </p>
        </div>
      </main>
    </div>
  );
}

function PasswordRecovery({ done }: { done: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Hai mật khẩu chưa khớp nhau.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setError(
        readableError(
          cause,
          "Chưa đổi được mật khẩu. Bạn thử mở lại liên kết trong email nhé.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="data-state">
      <div className="recovery-card">
        <h1>{saved ? "Mật khẩu đã được cập nhật" : "Chọn mật khẩu mới"}</h1>
        {saved ? (
          <>
            <p>Bạn có thể tiếp tục câu chuyện của mình rồi.</p>
            <button className="button primary" onClick={done}>
              Vào Massege <ArrowUpRight size={16} />
            </button>
          </>
        ) : (
          <form className="profile-form" onSubmit={submit}>
            <label>
              Mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Nhập lại mật khẩu
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "Đang lưu…" : "Lưu mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
