import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { supabase } from "./lib/supabase";

type Entry = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  like_count: number;
  liked: boolean;
  comment_count: number;
};

type Comment = Pick<Entry, "id" | "author_id" | "body" | "created_at"> & {
  author: { name: string };
};

const PAGE_SIZE = 20;
const dateFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

export function Feed({ userId }: { userId?: string }) {
  const [page, setPage] = useState(0);
  const [posts, setPosts] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    if (!userId || !supabase) return;
    const controller = new AbortController();
    const start = page * PAGE_SIZE;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await supabase!
          .from("feed_entries")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(start, start + PAGE_SIZE)
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setPosts(data as Entry[]);
      } catch {
        if (!controller.signal.aborted) setError("Chưa tải được bảng tin. Vui lòng thử lại.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [page, revision, userId]);

  function changePage(next: number) {
    setPosts([]);
    setPage(next);
  }

  return (
    <section className="feed" aria-labelledby="feed-heading">
      <div className="feed-card">
        <h2 id="feed-heading">Bảng tin</h2>
        {userId && supabase ? (
          <TextForm label="Bạn muốn chia sẻ điều gì?" action="Đăng bài" maxLength={2000}
            save={async (body) => {
              const { error } = await supabase!.from("feed_posts").insert({ body });
              if (error) throw error;
              if (page) changePage(0);
              refresh();
            }}
          />
        ) : <p>Đăng nhập để xem và tham gia bảng tin.</p>}
      </div>
      {userId && (
        <>
          {loading && <p role="status">Đang tải bài viết…</p>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="button secondary" onClick={refresh}>Thử lại</button>
            </div>
          )}
          {!loading && !error && !posts.length && <p>{page ? "Không còn bài viết ở trang này." : "Chưa có bài viết nào."}</p>}
          {posts.slice(0, PAGE_SIZE).map((post) => (
            <Post key={post.id} post={post} userId={userId} refresh={refresh} />
          ))}
          {(page > 0 || posts.length > PAGE_SIZE) && (
            <div className="feed-actions">
              <button className="button secondary" disabled={!page || loading} onClick={() => changePage(page - 1)}>Trang trước</button>
              <button className="button secondary" disabled={posts.length <= PAGE_SIZE || loading} onClick={() => changePage(page + 1)}>Trang sau</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Post({ post, userId, refresh }: { post: Entry; userId: string; refresh: () => void }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState("");
  const [liked, setLiked] = useState<boolean | null>(null);
  const currentLike = liked ?? post.liked;
  const count = post.like_count + Number(currentLike) - Number(post.liked);

  async function toggleLike() {
    setLikePending(true);
    setLikeError("");
    try {
      const likes = supabase!.from("feed_likes");
      const { error } = currentLike
        ? await likes.delete().eq("post_id", post.id).eq("user_id", userId)
        : await likes.upsert({ post_id: post.id }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
      setLiked(!currentLike);
      refresh();
    } catch {
      setLikeError("Chưa cập nhật được lượt thích.");
    } finally {
      setLikePending(false);
    }
  }

  return (
    <article className="feed-card">
      <Content item={post} author={post.author_name} userId={userId} kind="bài viết" refresh={refresh} />
      <div className="feed-actions">
        <button className="button secondary" aria-pressed={currentLike} disabled={likePending} onClick={() => void toggleLike()}>
          <Heart size={17} fill={currentLike ? "currentColor" : "none"} />
          {currentLike ? "Bỏ thích" : "Thích"} · {count}
        </button>
        <button className="button secondary" aria-expanded={commentsOpen} onClick={() => setCommentsOpen(!commentsOpen)}>
          <MessageCircle size={17} /> Bình luận · {post.comment_count}
        </button>
      </div>
      {likeError && <p className="form-error" role="alert">{likeError}</p>}
      {commentsOpen && <Comments postId={post.id} userId={userId} refreshFeed={refresh} />}
    </article>
  );
}

function Comments({ postId, userId, refreshFeed }: { postId: string; userId: string; refreshFeed: () => void }) {
  const [page, setPage] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const start = page * PAGE_SIZE;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data, error } = await supabase!.from("feed_comments")
          .select("id, author_id, body, created_at, author:profiles!feed_comments_author_id_fkey(name)")
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(start, start + PAGE_SIZE)
          .abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setComments(data as unknown as Comment[]);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [postId, page, revision]);

  function refresh() {
    setRevision((n) => n + 1);
    refreshFeed();
  }

  return (
    <section className="feed-comments" aria-label="Bình luận">
      <TextForm label="Viết bình luận" action="Gửi bình luận" maxLength={1000} save={async (body) => {
        const { error } = await supabase!.from("feed_comments").insert({ post_id: postId, body });
        if (error) throw error;
        setPage(0);
        refresh();
      }} />
      {loading && <p role="status">Đang tải bình luận…</p>}
      {error && <div role="alert">
        <p>Chưa tải được bình luận.</p>
        <button className="button secondary" onClick={refresh}>Thử lại</button>
      </div>}
      {!error && !loading && !comments.length && <p>{page ? "Không còn bình luận ở trang này." : "Chưa có bình luận."}</p>}
      {comments.slice(0, PAGE_SIZE).map((comment) => (
        <article key={comment.id} className="feed-comment">
          <Content item={comment} author={comment.author.name} userId={userId} kind="bình luận" refresh={refresh} />
        </article>
      ))}
      {(page > 0 || comments.length > PAGE_SIZE) && (
        <div className="feed-actions">
          <button className="button secondary" disabled={!page || loading} onClick={() => setPage(page - 1)}>Bình luận mới hơn</button>
          <button className="button secondary" disabled={comments.length <= PAGE_SIZE || loading} onClick={() => setPage(page + 1)}>Bình luận cũ hơn</button>
        </div>
      )}
    </section>
  );
}

function Content({ item, author, userId, kind, refresh }: {
  item: Pick<Entry, "id" | "author_id" | "body" | "created_at">;
  author: string;
  userId: string;
  kind: "bài viết" | "bình luận";
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const table = kind === "bài viết" ? "feed_posts" : "feed_comments";

  async function remove() {
    if (!window.confirm(kind === "bài viết"
      ? "Xóa bài viết này cùng lượt thích và bình luận?"
      : "Xóa bình luận này?")) return;
    setDeleting(true);
    setError("");
    try {
      const { error } = await supabase!.from(table).delete().eq("id", item.id).select("id").single();
      if (error) throw error;
      refresh();
    } catch {
      setError(`Chưa xóa được ${kind}. Vui lòng thử lại.`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="feed-meta">
        <strong>{author}</strong>
        <time dateTime={item.created_at}>{dateFormat.format(new Date(item.created_at))}</time>
      </div>
      {editing ? (
        <TextForm label={`Sửa ${kind}`} action="Lưu" initial={item.body}
          maxLength={kind === "bài viết" ? 2000 : 1000} cancel={() => setEditing(false)}
          save={async (body) => {
            const { error } = await supabase!.from(table).update({ body }).eq("id", item.id).select("id").single();
            if (error) throw error;
            setEditing(false);
            refresh();
          }}
        />
      ) : (
        <>
          <p className="feed-body">{item.body}</p>
          {item.author_id === userId && (
            <div className="feed-actions">
              <button className="button secondary" disabled={deleting} onClick={() => setEditing(true)}>Sửa {kind}</button>
              <button className="button secondary" disabled={deleting} onClick={() => void remove()}>Xóa {kind}</button>
            </div>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </>
  );
}

function TextForm({ label, action, initial = "", maxLength, save, cancel }: {
  label: string;
  action: string;
  initial?: string;
  maxLength: number;
  save: (body: string) => Promise<void>;
  cancel?: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !body.trim()) return;
    setPending(true);
    setError("");
    try {
      await save(body.trim());
      setBody("");
    } catch {
      setError("Chưa lưu được nội dung. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <label>
        {label}
        <textarea rows={maxLength === 2000 ? 3 : 2} maxLength={maxLength} value={body} required
          disabled={pending} onChange={(event) => setBody(event.target.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="feed-actions">
        <button className="button primary" disabled={pending || !body.trim()}>{pending ? "Đang lưu…" : action}</button>
        {cancel && <button className="button secondary" type="button" disabled={pending} onClick={cancel}>Hủy</button>}
      </div>
    </form>
  );
}
