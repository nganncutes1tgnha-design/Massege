import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { supabase } from "./lib/supabase";
import { ChatImage, chatImageBucket, chatImageTypes, maxChatImageBytes } from "./ChatImage";

type Message = {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  image_path: string | null;
};

const pageSize = 30;
const fields = "id, sender_id, body, created_at, read_at, image_path";
const formatTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const readAt = message.read_at ?? byId.get(message.id)?.read_at ?? null;
    byId.set(message.id, { ...message, read_at: readAt });
  }
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

export function DirectChat({ userId, recipientId, recipientName, refreshUnread }: {
  userId: string;
  recipientId: string;
  recipientName: string;
  refreshUnread: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [older, setOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const picker = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const url = image ? URL.createObjectURL(image) : "";
    setPreview(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [image]);

  const load = useCallback(async (before?: number, background = false) => {
    if (background && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (!background) {
      setLoading(true);
      setReadError("");
    }
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
      setMessages((current) => mergeMessages(current, page));
      if (!background) setOlder(data.length > pageSize);
    } catch {
      if (!background && !controller.signal.aborted) setReadError("Chưa tải được tin nhắn. Vui lòng thử lại.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [recipientId, userId]);

  useEffect(() => {
    const client = supabase!;
    mounted.current = true;
    void load();
    const channel = client.channel(`direct-chat:${userId}:${recipientId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
        filter: `recipient_id=eq.${userId}`,
      }, ({ new: row }) => {
        if (row.sender_id === recipientId) {
          setMessages((current) => mergeMessages(current, [row as Message]));
        }
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "direct_messages",
        filter: `sender_id=eq.${userId}`,
      }, ({ new: row }) => {
        if (row.recipient_id === recipientId && row.read_at) {
          setMessages((current) => mergeMessages(current, [row as Message]));
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load(undefined, true);
      });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(undefined, true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [load, userId, recipientId]);

  useEffect(() => {
    const latest = messages.find((message) => message.sender_id === recipientId);
    if (!latest) return;
    const markRead = async () => {
      if (document.visibilityState !== "visible") return;
      const { error } = await supabase!.rpc("mark_direct_read", {
        other_user: recipientId, through_id: latest.id,
      });
      if (!error) await refreshUnread();
    };
    void markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [messages, recipientId, refreshUnread]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if ((!body && !image) || sending || loading) return;
    setSending(true);
    setSendError("");
    const client = supabase!;
    const images = client.storage.from(chatImageBucket);
    let imagePath: string | null = null;
    try {
      if (image) {
        imagePath = `${userId}/${recipientId}/${crypto.randomUUID()}`;
        const { error } = await images.upload(imagePath, image, { contentType: image.type });
        if (error) throw error;
      }
      const { data, error } = await client.from("direct_messages")
        .insert({ recipient_id: recipientId, body, image_path: imagePath }).select(fields).single();
      if (error) throw error;
      if (!mounted.current) return;
      setDraft("");
      setImage(null);
      setMessages((current) => mergeMessages(current, [data]));
    } catch {
      if (imagePath) void images.remove([imagePath]).catch(() => {});
      setSendError("Chưa gửi được tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  }

  function chooseImage(file?: File) {
    if (!file) return;
    if (!chatImageTypes.includes(file.type) || !file.size || file.size > maxChatImageBytes) {
      setSendError("Chọn ảnh JPG, PNG, WebP hoặc GIF có dung lượng tối đa 5 MB.");
      return;
    }
    setSendError("");
    setImage(file);
  }

  const lastSent = messages.find((message) => message.sender_id === userId);

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
              {message.image_path && <ChatImage key={message.image_path} path={message.image_path} />}
              {message.body && <p className="feed-body">{message.body}</p>}
              {message.id === lastSent?.id && (
                <span className="direct-read-state" role="status">
                  {message.read_at ? "Đã xem" : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <form className="profile-form" onSubmit={send}>
        <label>
          Tin nhắn
          <textarea rows={2} maxLength={2000} value={draft} disabled={sending}
            onChange={(event) => setDraft(event.target.value)} />
        </label>
        {image && preview && (
          <div className="direct-image-preview">
            <img className="direct-image" src={preview} alt="Ảnh sắp gửi" />
            <button type="button" className="button secondary" disabled={sending}
              onClick={() => { setImage(null); setSendError(""); }}>
              Bỏ ảnh
            </button>
          </div>
        )}
        {sendError && <p className="form-error" role="alert">{sendError}</p>}
        <div className="feed-actions">
          <input type="file" ref={picker} accept={chatImageTypes.join(",")} hidden
            onChange={(event) => {
              chooseImage(event.target.files?.[0]);
              event.target.value = "";
            }} />
          <button type="button" className="button secondary" disabled={sending} onClick={() => picker.current?.click()}>
            <ImagePlus size={17} aria-hidden="true" /> Chọn ảnh
          </button>
          <button className="button primary" disabled={sending || loading || (!draft.trim() && !image)}>
            {sending ? "Đang gửi…" : "Gửi tin nhắn"}
          </button>
        </div>
      </form>
    </div>
  );
}
