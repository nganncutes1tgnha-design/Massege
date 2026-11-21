import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

type UnreadCount = { sender_id: string; unread_count: number };

export function useDirectUnread(userId: string | undefined) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const request = useRef<AbortController | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!userId || !supabase) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { data, error } = await supabase.rpc("direct_unread_counts").abortSignal(controller.signal);
    if (!error && !controller.signal.aborted) {
      setUnread(Object.fromEntries((data as UnreadCount[]).map((row) => [row.sender_id, row.unread_count])));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase) return;
    const client = supabase;
    const filter = { schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` };
    const channel = client.channel(`direct-unread:${userId}`)
      .on("postgres_changes", { event: "INSERT", ...filter }, () => void refreshUnread())
      .on("postgres_changes", { event: "UPDATE", ...filter }, () => void refreshUnread())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshUnread();
      });
    void refreshUnread();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnread();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      request.current?.abort();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [userId, refreshUnread]);

  return { unread, refreshUnread };
}
