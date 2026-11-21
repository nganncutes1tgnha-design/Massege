import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sql = await readFile(
  new URL("../supabase/migrations/202610140001_social.sql", import.meta.url),
  "utf8",
);
const feedSql = await readFile(
  new URL("../supabase/migrations/202611210001_feed.sql", import.meta.url),
  "utf8",
);
const messagesSql = await readFile(
  new URL("../supabase/migrations/202611210002_direct_messages.sql", import.meta.url),
  "utf8",
);
const realtimeSql = await readFile(
  new URL("../supabase/migrations/202611210003_direct_realtime.sql", import.meta.url),
  "utf8",
);
const inboxSql = await readFile(
  new URL("../supabase/migrations/202611210004_direct_inbox.sql", import.meta.url),
  "utf8",
);
const A = "00000000-0000-0000-0000-000000000001";
const B = "00000000-0000-0000-0000-000000000002";
const C = "00000000-0000-0000-0000-000000000003";
const D = "00000000-0000-0000-0000-000000000004";
before(async () => {
  // Stand in only for Supabase's server-owned auth schema; all application
  // policies, triggers and RPCs execute unmodified in PostgreSQL via PGlite.
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    insert into auth.users(id, raw_user_meta_data) values ('${A}', '{"full_name":"An"}');`);
  await db.exec(sql);
  await db.exec(feedSql);
  await db.exec(messagesSql);
  await db.exec("create publication supabase_realtime");
  await db.exec(realtimeSql);
  await db.exec(inboxSql);
  await db.query(
    "insert into auth.users(id, raw_user_meta_data) values ($1, $2), ($3, $4), ($5, $6)",
    [
      B,
      { full_name: "Bình" },
      C,
      { full_name: "Chi" },
      D,
      { full_name: "Dung" },
    ],
  );
});
beforeEach(async () => {
  await db.exec("reset role; truncate public.friend_requests, public.direct_messages;");
});
after(async () => {
  await db.close();
});

async function asUser(id, fn, role = "authenticated") {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    id ?? "",
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
async function rpc(actor, command, other) {
  return asUser(actor, () => db.query(`select public.${command}($1)`, [other]));
}
async function people(actor) {
  return asUser(
    actor,
    async () => (await db.query("select * from public.list_people()")).rows,
  );
}
const denied = (error) => ["42501", "22023"].includes(error.code);

test("existing and new users receive a profile without exposing auth metadata", async () => {
  const result = await db.query(
    "select id, name from public.profiles order by id",
  );
  assert.deepEqual(
    result.rows.map((p) => p.name),
    ["An", "Bình", "Chi", "Dung"],
  );
  const list = await people(A);
  assert.equal(list.length, 3);
  assert.ok(
    list.every(
      (p) =>
        p.id !== A &&
        !Object.hasOwn(p, "email") &&
        !Object.hasOwn(p, "raw_user_meta_data"),
    ),
  );
});

test("users can edit only their own profile and cannot move its identity", async () => {
  await asUser(A, async () => {
    const own = await db.query(
      "update public.profiles set bio = 'hello' where id = $1 returning id",
      [A],
    );
    assert.equal(own.rows.length, 1);
    const other = await db.query(
      "update public.profiles set bio = 'hacked' where id = $1 returning id",
      [B],
    );
    assert.equal(other.rows.length, 0);
    await assert.rejects(
      db.query("update public.profiles set id = $1 where id = $2", [C, A]),
      denied,
    );
    await assert.rejects(
      db.query("update public.profiles set created_at = now() where id = $1", [
        A,
      ]),
      denied,
    );
  });
  assert.notEqual(
    (await db.query("select bio from public.profiles where id = $1", [B]))
      .rows[0].bio,
    "hacked",
  );
});

test("anonymous and unauthenticated callers cannot read profiles or call friendship RPCs", async () => {
  await asUser(
    null,
    async () => {
      await assert.rejects(db.query("select * from public.profiles"), denied);
      await assert.rejects(
        db.query("select * from public.list_people()"),
        denied,
      );
      await assert.rejects(
        db.query("select public.send_friend_request($1)", [A]),
        denied,
      );
    },
    "anon",
  );
  await asUser(null, () =>
    assert.rejects(db.query("select * from public.list_people()"), denied),
  );
});

test("sender cannot accept their own invitation; recipient sees an incoming invitation", async () => {
  await rpc(A, "send_friend_request", B);
  assert.equal((await people(A)).find((p) => p.id === B).connection, "pending");
  assert.equal(
    (await people(B)).find((p) => p.id === A).connection,
    "incoming",
  );
  await assert.rejects(rpc(A, "accept_friend_request", B), denied);
  await assert.rejects(rpc(A, "reject_friend_request", B), denied);
});

test("a third user cannot read, accept, reject or cancel someone else's invitation", async () => {
  await rpc(A, "send_friend_request", B);
  assert.equal(
    (await asUser(C, () => db.query("select * from public.friend_requests")))
      .rows.length,
    0,
  );
  for (const command of [
    "accept_friend_request",
    "reject_friend_request",
    "cancel_friend_request",
  ])
    await assert.rejects(rpc(C, command, A), denied);
});

test("clients cannot directly forge accepted friendships or write requests", async () => {
  await rpc(A, "send_friend_request", B);
  await asUser(A, async () => {
    await assert.rejects(
      db.query(
        "insert into public.friend_requests(sender_id, recipient_id, status) values ($1, $2, 'accepted')",
        [A, C],
      ),
      denied,
    );
    await assert.rejects(
      db.query("update public.friend_requests set status = 'accepted'"),
      denied,
    );
    await assert.rejects(
      db.query("delete from public.friend_requests"),
      denied,
    );
  });
});

test("duplicate, reverse and self invitations cannot create extra relationships", async () => {
  await assert.rejects(rpc(A, "send_friend_request", A), denied);
  await rpc(A, "send_friend_request", B);
  await assert.rejects(rpc(A, "send_friend_request", B), denied);
  await assert.rejects(rpc(B, "send_friend_request", A), denied);
  assert.equal(
    (await db.query("select count(*)::int as n from public.friend_requests"))
      .rows[0].n,
    1,
  );
});

test("acceptance becomes a friendship for both users and cannot be cancelled as pending", async () => {
  await rpc(A, "send_friend_request", B);
  await rpc(B, "accept_friend_request", A);
  assert.equal((await people(A)).find((p) => p.id === B).connection, "friend");
  assert.equal((await people(B)).find((p) => p.id === A).connection, "friend");
  await assert.rejects(rpc(A, "cancel_friend_request", B), denied);
  await assert.rejects(rpc(A, "send_friend_request", B), denied);
});

test("rejected invitations can be sent again in either direction without duplicates", async () => {
  await rpc(A, "send_friend_request", B);
  await rpc(B, "reject_friend_request", A);
  assert.equal(
    (await people(A)).find((p) => p.id === B).connection,
    "suggested",
  );
  await rpc(B, "send_friend_request", A);
  assert.equal(
    (await people(A)).find((p) => p.id === B).connection,
    "incoming",
  );
  assert.equal(
    (await db.query("select count(*)::int as n from public.friend_requests"))
      .rows[0].n,
    1,
  );
});

test("only the sender can cancel a pending invitation", async () => {
  await rpc(A, "send_friend_request", B);
  await assert.rejects(rpc(B, "cancel_friend_request", A), denied);
  await rpc(A, "cancel_friend_request", B);
  assert.equal(
    (await people(A)).find((p) => p.id === B).connection,
    "suggested",
  );
  assert.equal(
    (await db.query("select count(*)::int as n from public.friend_requests"))
      .rows[0].n,
    0,
  );
});

test("mutual friends are derived from accepted relationships only", async () => {
  await rpc(A, "send_friend_request", C);
  await rpc(C, "accept_friend_request", A);
  await rpc(B, "send_friend_request", C);
  await rpc(C, "accept_friend_request", B);
  await rpc(A, "send_friend_request", D); // Pending is not a mutual friend.
  await rpc(B, "send_friend_request", D);
  await rpc(D, "accept_friend_request", B);
  assert.equal(Number((await people(A)).find((p) => p.id === B).mutual), 1);
  assert.equal(
    (
      await asUser(A, () =>
        db.query("select * from public.friend_requests where sender_id = $1", [
          B,
        ]),
      )
    ).rows.length,
    0,
  );
});

test("database constraints enforce profile field limits", async () => {
  await asUser(A, async () => {
    for (const [field, value] of [
      ["name", " "],
      ["city", "x".repeat(61)],
      ["bio", "x".repeat(241)],
      ["interests", ["a", "b", "c", "d", "e", "f"]],
      ["interests", [null]],
    ]) {
      await assert.rejects(
        db.query(`update public.profiles set ${field} = $1 where id = $2`, [
          value,
          A,
        ]),
        (e) => e.code === "23514",
      );
    }
  });
});

test("rerunning the migration preserves user edits and accepted friendships", async () => {
  await rpc(A, "send_friend_request", B);
  await rpc(B, "accept_friend_request", A);
  await asUser(A, () =>
    db.query("update public.profiles set bio = 'keep me' where id = $1", [A]),
  );
  await db.exec(sql);
  assert.equal((await people(A)).find((p) => p.id === B).connection, "friend");
  assert.equal(
    (
      await asUser(A, () =>
        db.query("select bio from public.profiles where id = $1", [A]),
      )
    ).rows[0].bio,
    "keep me",
  );
});


test("feed reads are authenticated and only authors can change posts or comments", async () => {
  const { rows: [post] } = await asUser(A, () =>
    db.query("insert into public.feed_posts(body) values ('Hello') returning id"));
  const { rows: [comment] } = await asUser(B, () =>
    db.query("insert into public.feed_comments(post_id, body) values ($1, 'Hi') returning id", [post.id]));
  await assert.rejects(asUser(null, () => db.query("select * from public.feed_entries"), "anon"), denied);
  await assert.rejects(asUser(B, () =>
    db.query("insert into public.feed_posts(author_id, body) values ($1, 'Impersonation')", [A])), denied);
  await assert.rejects(asUser(B, () =>
    db.query("update public.feed_comments set author_id = $1 where id = $2", [A, comment.id])), denied);
  const { rows } = await asUser(C, () =>
    db.query("select author_name, comment_count from public.feed_entries where id = $1", [post.id]));
  assert.deepEqual(rows, [{ author_name: "An", comment_count: 1 }]);

  for (const [table, id, owner, other] of [
    ["feed_posts", post.id, A, B],
    ["feed_comments", comment.id, B, A],
  ]) {
    const edit = () => db.query(`update public.${table} set body = 'Edited' where id = $1 returning id`, [id]);
    const remove = () => db.query(`delete from public.${table} where id = $1 returning id`, [id]);
    assert.equal((await asUser(other, edit)).rows.length, 0);
    assert.equal((await asUser(other, remove)).rows.length, 0);
    assert.equal((await asUser(owner, edit)).rows.length, 1);
  }
  assert.equal((await asUser(B, () => db.query(
    "delete from public.feed_comments where id = $1 returning id", [comment.id]))).rows.length, 1);
  await asUser(A, () => db.query("delete from public.feed_posts where id = $1", [post.id]));
});

test("feed validates text, allows one like per account, and cleans up when a post is deleted", async () => {
  await assert.rejects(asUser(A, () =>
    db.query("insert into public.feed_posts(body) values ($1)", [" \n\t"])), { code: "23514" });
  const { rows: [post] } = await asUser(A, () => db.query(
    "insert into public.feed_posts(body) values ('Another post') returning id"));
  await assert.rejects(asUser(B, () => db.query(
    "insert into public.feed_comments(post_id, body) values ($1, repeat('b', 1001))", [post.id])), { code: "23514" });
  await asUser(B, () => db.query(
    "insert into public.feed_comments(post_id, body) values ($1, 'Comment')", [post.id]));
  const like = () => db.query("insert into public.feed_likes(post_id) values ($1)", [post.id]);
  await asUser(B, like);
  await assert.rejects(asUser(B, like), { code: "23505" });
  await asUser(C, like);
  assert.equal((await asUser(A, () => db.query(
    "delete from public.feed_likes where post_id = $1 returning user_id", [post.id]))).rows.length, 0);
  await asUser(C, () => db.query(
    "delete from public.feed_likes where post_id = $1 and user_id = $2", [post.id, C]));
  const entry = () => db.query("select like_count, liked from public.feed_entries where id = $1", [post.id]);
  assert.deepEqual((await asUser(B, entry)).rows, [{ like_count: 1, liked: true }]);
  assert.deepEqual((await asUser(C, entry)).rows, [{ like_count: 1, liked: false }]);
  await asUser(A, () => db.query("delete from public.feed_posts where id = $1", [post.id]));
  for (const table of ["feed_likes", "feed_comments"]) {
    const { rows } = await db.query(`select post_id from public.${table} where post_id = $1`, [post.id]);
    assert.deepEqual(rows, []);
  }
});

test("direct messages require accepted friendship and remain visible only to their participants", async () => {
  const send = (sender, recipient, body) => asUser(sender, () => db.query(
    "insert into public.direct_messages(recipient_id, body) values ($1, $2) returning id, sender_id",
    [recipient, body],
  ));
  const read = (actor, role = "authenticated") => asUser(actor, () =>
    db.query("select sender_id, body from public.direct_messages order by id"), role);

  await assert.rejects(send(A, B, "Before friendship"), denied);
  await rpc(A, "send_friend_request", B);
  await assert.rejects(send(B, A, "Pending friendship"), denied);
  await rpc(B, "accept_friend_request", A);
  assert.equal((await send(A, B, "Hello")).rows[0].sender_id, A);
  await send(B, A, "Hi");
  await rpc(A, "send_friend_request", C);
  await rpc(C, "accept_friend_request", A);
  await send(C, A, "Other conversation");

  assert.deepEqual((await read(A)).rows.map(({ body }) => body), ["Hello", "Hi", "Other conversation"]);
  assert.deepEqual((await read(B)).rows.map(({ body }) => body), ["Hello", "Hi"]);
  assert.deepEqual((await read(C)).rows.map(({ body }) => body), ["Other conversation"]);
  assert.deepEqual((await read(D)).rows, []);
  await assert.rejects(read(null, "anon"), denied);
  await assert.rejects(send(A, A, "Self"), denied);
  await assert.rejects(send(A, B, "  \n\t"), { code: "23514" });
  await assert.rejects(send(A, B, "b".repeat(2001)), { code: "23514" });
  await assert.rejects(asUser(B, () => db.query(
    "insert into public.direct_messages(sender_id, recipient_id, body) values ($1, $2, 'Forged')",
    [A, B],
  )), denied);
});

test("unread counts are private and only the recipient can mark messages read", async () => {
  for (const friend of [B, C]) {
    await rpc(A, "send_friend_request", friend);
    await rpc(friend, "accept_friend_request", A);
  }
  const send = (actor, recipient) => asUser(actor, async () => (await db.query(
    "insert into public.direct_messages(recipient_id, body) values ($1, 'hi') returning id",
    [recipient],
  )).rows[0].id);
  const counts = (actor, role) => asUser(actor, async () => (await db.query(
    "select * from public.direct_unread_counts() order by sender_id",
  )).rows, role);
  const mark = (actor, sender, id) => asUser(actor, () => db.query(
    "select public.mark_direct_read($1, $2)", [sender, id],
  ));
  const first = await send(B, A);
  const latest = await send(B, A);
  await send(C, A);
  await send(A, B);
  await mark(C, B, latest);
  await mark(B, B, latest);
  assert.deepEqual(await counts(A), [{ sender_id: B, unread_count: 2 }, { sender_id: C, unread_count: 1 }]);
  assert.deepEqual(await counts(B), [{ sender_id: A, unread_count: 1 }]);
  assert.deepEqual(await counts(D), []);
  await assert.rejects(counts(null, "anon"), denied);
  await assert.rejects(asUser(A, () => db.query("update public.direct_messages set read_at = now()")), denied);
  await mark(A, B, first);
  assert.deepEqual(await counts(A), [{ sender_id: B, unread_count: 1 }, { sender_id: C, unread_count: 1 }]);
  const receipts = (actor) => asUser(actor, async () => (await db.query(
    "select id, read_at is not null as seen from public.direct_messages where id in ($1, $2) order by id",
    [first, latest],
  )).rows);
  assert.deepEqual(await receipts(B), [{ id: first, seen: true }, { id: latest, seen: false }]);
  assert.deepEqual(await receipts(D), []);
  await mark(A, B, latest);
  await mark(A, B, latest);
  assert.deepEqual(await counts(A), [{ sender_id: C, unread_count: 1 }]);
  const publication = await db.query(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime'",
  );
  assert.deepEqual(publication.rows, [{ tablename: "direct_messages" }]);
});

test("inbox returns one recent preview per peer and counts only unread incoming messages", async () => {
  for (const [sender, recipient] of [[A, B], [A, C], [B, D]]) {
    await rpc(sender, "send_friend_request", recipient);
    await rpc(recipient, "accept_friend_request", sender);
  }
  const send = (actor, recipient, body) => asUser(actor, async () => (await db.query(
    "insert into public.direct_messages(recipient_id, body) values ($1, $2) returning id",
    [recipient, body],
  )).rows[0].id);
  const inbox = (actor, role) => asUser(actor, async () => (await db.query(
    "select peer_id, peer_name, last_sender_id, last_preview, unread_count from public.direct_inbox()",
  )).rows, role);
  const first = await send(B, A, "Old incoming");
  await send(C, A, "Another conversation");
  await send(A, B, "x".repeat(190));
  await send(D, B, "Unrelated private message");

  assert.deepEqual(await inbox(A), [
    { peer_id: B, peer_name: "Bình", last_sender_id: A, last_preview: "x".repeat(160), unread_count: 1 },
    { peer_id: C, peer_name: "Chi", last_sender_id: C, last_preview: "Another conversation", unread_count: 1 },
  ]);
  assert.deepEqual((await inbox(D)).map(({ peer_id, unread_count }) => [peer_id, unread_count]), [[B, 0]]);
  await asUser(A, () => db.query("select public.mark_direct_read($1, $2)", [B, first]));
  assert.deepEqual((await inbox(A)).map(({ unread_count }) => unread_count), [0, 1]);
  await assert.rejects(inbox(null, "anon"), denied);
});
