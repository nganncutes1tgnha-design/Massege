import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "./lib/supabase";

type Conversation = {
  peer_id: string;
  peer_name: string;
  last_message_id: number;
  last_sender_id: string;
  last_preview: string;
  last_sent_at: string;
  unread_count: number;
};

const pageSize = 20;
const formatTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

export function DirectInbox({ userId, openChat, showFriends }: {
  userId?: string;
  openChat: (chat: { id: string; name: string }) => void;
  showFriends: () => void;
}) {
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId || !supabase) return;
    const client = supabase;
    let request: AbortController | undefined;
    let active = true;

    async function load() {
      if (!active) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const start = page * pageSize;
      const { data, error } = await client.rpc("direct_inbox")
        .order("last_message_id", { ascending: false })
        .range(start, start + pageSize)
        .abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setError(Boolean(error));
      if (!error) setConversations(data as Conversation[]);
      setLoading(false);
    }

    setLoading(true);
    setError(false);
    void load();
    const received = {
      schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}`,
    };
    const channel = client.channel(`direct-inbox:${userId}:${page}:${revision}`)
      .on("postgres_changes", { event: "INSERT", ...received }, () => void load())
      .on("postgres_changes", { event: "UPDATE", ...received }, () => void load())
      .on("postgres_changes", {
        event: "INSERT", ...received, filter: `sender_id=eq.${userId}`,
      }, () => void load())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      active = false;
      request?.abort();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [userId, page, revision]);

  function goToPage(next: number) {
    setConversations([]);
    setLoading(true);
    setPage(next);
  }

  return (
    <section className="feed feed-card" aria-labelledby="inbox-heading">
      <div className="inbox-heading">
        <h2 id="inbox-heading">Tin nhắn</h2>
        {userId && <button className="button secondary" onClick={showFriends}>Nhắn cho bạn bè</button>}
      </div>
      {!userId && <p>Đăng nhập để xem các cuộc trò chuyện.</p>}
      {userId && loading && <p role="status">Đang tải cuộc trò chuyện…</p>}
      {userId && error && (
        <div role="alert">
          <p>Chưa tải được cuộc trò chuyện.</p>
          <button className="button secondary" onClick={() => setRevision(revision + 1)}>Thử lại</button>
        </div>
      )}
      {userId && !loading && !error && !conversations.length && (
        <p>{page ? "Không còn cuộc trò chuyện ở trang này." : "Bạn chưa có cuộc trò chuyện nào."}</p>
      )}
      {conversations.length > 0 && (
        <ul className="inbox-list">
          {conversations.slice(0, pageSize).map((conversation) => (
            <li key={conversation.peer_id}>
              <button className="inbox-row" onClick={() => openChat({
                id: conversation.peer_id, name: conversation.peer_name,
              })}>
                <span className="inbox-message">
                  <strong>{conversation.peer_name}</strong>
                  <span className="inbox-preview">
                    {conversation.last_sender_id === userId && "Bạn: "}
                    {conversation.last_preview}
                  </span>
                </span>
                <time dateTime={conversation.last_sent_at}>{formatTime.format(new Date(conversation.last_sent_at))}</time>
                {conversation.unread_count > 0 && (
                  <span className="nav-count coral" aria-label={`${conversation.unread_count} tin chưa đọc`}>
                    {conversation.unread_count}
                  </span>
                )}
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(page > 0 || conversations.length > pageSize) && (
        <div className="feed-actions">
          <button className="button secondary" disabled={page === 0 || loading} onClick={() => goToPage(page - 1)}>Trang trước</button>
          <button className="button secondary" disabled={conversations.length <= pageSize || loading} onClick={() => goToPage(page + 1)}>Trang sau</button>
        </div>
      )}
    </section>
  );
}
