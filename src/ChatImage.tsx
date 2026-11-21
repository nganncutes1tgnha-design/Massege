import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase";

export const chatImageBucket = "direct-chat-images";
export const chatImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const maxChatImageBytes = 5 * 1024 * 1024;

export function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(false);
  const placeholder = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (visible || !placeholder.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    });
    observer.observe(placeholder.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let objectUrl = "";
    setError(false);
    void supabase!.storage.from(chatImageBucket).download(path).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setError(true);
        return;
      }
      objectUrl = URL.createObjectURL(data);
      setUrl(objectUrl);
    }).catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt, visible]);

  if (error) {
    return <button className="button secondary" onClick={() => setAttempt((n) => n + 1)}>Tải lại ảnh</button>;
  }
  if (!url) return <span ref={placeholder}>Ảnh đính kèm đang tải…</span>;
  return <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Mở ảnh đính kèm">
    <img className="direct-image" src={url} alt="Ảnh đính kèm" onError={() => {
      setUrl("");
      setError(true);
    }} />
  </a>;
}
