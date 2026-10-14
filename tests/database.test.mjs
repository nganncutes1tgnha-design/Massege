import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sql = await readFile(
  new URL("../supabase/migrations/202610140001_social.sql", import.meta.url),
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
  await db.exec("reset role; truncate public.friend_requests;");
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
