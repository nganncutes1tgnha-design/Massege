import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

type Message = {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
};

const pageSize = 30;
const fields = "id, sender_id, body, created_at";
const formatTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

export function DirectChat({ userId, recipientId, recipientName }: {
  userId: string;
  recipientId: string;
  recipientName: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [older, setOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (before?: number) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setReadError("");
    try {
      const query = supabase!.from("direct_messages")
        .select(fields)
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${userId})`)
        .order("id", { ascending: false })
        .limit(pageSize + 1)
        .abortSignal(controller.signal);
      if (before !== undefined) query.lt("id", before);
      const { data, error } = await query;
      if (error) throw error;
      if (controller.signal.aborted) return;
      const page = data.slice(0, pageSize);
      setMessages((current) => before === undefined ? page : [...current, ...page]);
      setOlder(data.length > pageSize);
    } catch {
      if (!controller.signal.aborted) setReadError("Chưa tải được tin nhắn. Vui lòng thử lại.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [recipientId, userId]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || loading) return;
    setSending(true);
    setSendError("");
    try {
      const { error } = await supabase!.from("direct_messages")
        .insert({ recipient_id: recipientId, body });
      if (error) throw error;
      setDraft("");
      if (!request.current?.signal.aborted) await load();
    } catch {
      setSendError("Chưa gửi được tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="direct-chat">
      <div className="feed-actions">
        <button className="button secondary" disabled={loading || sending} onClick={() => void load()}>
          Làm mới tin nhắn
        </button>
        {older && (
          <button className="button secondary" disabled={loading || sending}
            onClick={() => void load(messages.at(-1)?.id)}>
            Xem tin nhắn cũ hơn
          </button>
        )}
      </div>
      {readError && <p className="form-error" role="alert">{readError}</p>}
      {loading && <p role="status">Đang tải tin nhắn…</p>}
      {!loading && !readError && !messages.length && <p>Chưa có tin nhắn.</p>}
      {messages.length > 0 && (
        <ol className="direct-message-list" aria-label="Lịch sử trò chuyện, tin mới nhất trước">
          {messages.map((message) => (
            <li key={message.id} className={message.sender_id === userId ? "direct-message own-message" : "direct-message"}>
              <div className="feed-meta">
                <strong>{message.sender_id === userId ? "Bạn" : recipientName}</strong>
                <time dateTime={message.created_at}>{formatTime.format(new Date(message.created_at))}</time>
              </div>
              <p className="feed-body">{message.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form className="profile-form" onSubmit={send}>
        <label>
          Tin nhắn
          <textarea rows={2} maxLength={2000} required value={draft} disabled={sending}
            onChange={(event) => setDraft(event.target.value)} />
        </label>
        {sendError && <p className="form-error" role="alert">{sendError}</p>}
        <div className="feed-actions">
          <button className="button primary" disabled={sending || loading || !draft.trim()}>
            {sending ? "Đang gửi…" : "Gửi tin nhắn"}
          </button>
        </div>
      </form>
    </div>
  );
}
