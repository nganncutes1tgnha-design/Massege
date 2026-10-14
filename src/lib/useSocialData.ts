import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  loadData,
  storageKey,
  type Connection,
  type Person,
  type Profile,
} from "../demo";
import { supabase } from "./supabase";

export function useSocialData(session: Session | null) {
  const userId = session?.user.id;
  const [initial] = useState(() =>
    userId
      ? {
          profile: {
            name:
              typeof session?.user.user_metadata.full_name === "string"
                ? session.user.user_metadata.full_name
                : "Bạn mới",
            role: "Rất vui được làm quen với bạn",
            city: "Chưa cập nhật",
            bio: "",
            interests: [],
          } as Profile,
          people: [] as Person[],
        }
      : loadData(),
  );
  const [profile, setProfile] = useState(initial.profile);
  const [people, setPeople] = useState(initial.people);
  const [loading, setLoading] = useState(Boolean(userId));
  const [loadError, setLoadError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(new Set<string>());
  const active = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!supabase || !userId) return;
    const run = ++generation.current;
    try {
      const [own, others] = await Promise.all([
        supabase
          .from("profiles")
          .select("name,role,city,bio,interests")
          .eq("id", userId)
          .abortSignal(AbortSignal.timeout(15000))
          .single(),
        supabase.rpc("list_people").abortSignal(AbortSignal.timeout(15000)),
      ]);
      if (own.error || others.error || !own.data)
        throw new Error("load_failed");
      if (!active.current || run !== generation.current) return;
      setProfile(own.data as Profile);
      setPeople(
        (others.data ?? []).map((person: Person) => ({
          ...person,
          mutual: Number(person.mutual),
        })),
      );
      setLoadError("");
    } catch {
      if (active.current && run === generation.current)
        setLoadError(
          "Chưa kết nối được dữ liệu của bạn. Vui lòng thử lại sau một chút.",
        );
    } finally {
      if (active.current && run === generation.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    active.current = true;
    if (!userId)
      return () => {
        active.current = false;
      };
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(onVisible, 30000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active.current = false;
      ++generation.current;
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (userId) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          profile,
          connections: Object.fromEntries(
            people.map((p) => [p.id, p.connection]),
          ),
        }),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [profile, people, userId]);

  async function saveProfile(next: Profile) {
    if (userId) {
      if (!supabase)
        throw new Error("Chưa kết nối được tài khoản. Vui lòng thử lại.");
      try {
        const result = await supabase
          .from("profiles")
          .update(next)
          .eq("id", userId)
          .select("id")
          .abortSignal(AbortSignal.timeout(15000))
          .single();
        if (result.error) throw result.error;
      } catch {
        throw new Error("Chưa lưu được hồ sơ. Vui lòng thử lại.");
      }
    }
    if (active.current) setProfile(next);
  }

  async function updateConnection(person: Person, next: Connection) {
    const id = String(person.id);
    if (inFlight.current.has(id))
      throw new Error("Thao tác đang được thực hiện. Bạn chờ một chút nhé.");
    inFlight.current.add(id);
    setBusy(new Set(inFlight.current));
    try {
      if (!userId) {
        setPeople((current) =>
          current.map((p) =>
            p.id === person.id ? { ...p, connection: next } : p,
          ),
        );
        return;
      }
      if (!supabase) throw new Error("not_connected");
      const command =
        next === "pending"
          ? "send_friend_request"
          : next === "friend"
            ? "accept_friend_request"
            : next === "dismissed"
              ? "reject_friend_request"
              : "cancel_friend_request";
      const { error } = await supabase
        .rpc(command, { other_user: id })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      await refresh();
    } catch {
      throw new Error(
        "Chưa cập nhật được kết nối. Hãy tải lại danh sách rồi thử lại.",
      );
    } finally {
      inFlight.current.delete(id);
      if (active.current) setBusy(new Set(inFlight.current));
    }
  }
  return {
    profile,
    people,
    loading,
    loadError,
    storageError,
    busy,
    refresh,
    saveProfile,
    updateConnection,
  };
}
