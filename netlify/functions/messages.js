// netlify/functions/messages.js
import {
  json,
  bad,
  method,
  rateLimit,
  bodyJSON,
  handleOptions,
} from "./_shared/utils.js";
import { supabaseFromRequest, sbAdmin } from "./_shared/supabase.js";

/*
  Presupuneri flexibile de schemă (se încearcă în această ordine):
  - chats_participants(chat_id uuid, user_id uuid)
  - chats(id uuid, user_a_id uuid, user_b_id uuid)
  - messages(id, chat_id, sender_id, text, created_at)
  - providers(id, owner_user_id uuid)  // alternativ: user_id
  RLS recomandat: utilizatorii văd doar chat-urile la care participă și doar mesajele acelor chat-uri.
*/

const TABLE_MSG = "messages";
const TABLE_CHAT = "chats";
const TABLE_PART = "chats_participants";
const TABLE_PROV = "providers";

function sanitizeText(s = "", max = 2000) {
  return String(s || "")
    .replace(/[<>]/g, "")       // anti-HTML injection simplu
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function assertMembership(db, chatId, userId) {
  // 1) Încearcă prin chats_participants
  try {
    const { data: part, error } = await db
      .from(TABLE_PART)
      .select("user_id")
      .eq("chat_id", chatId);

    if (!error && Array.isArray(part)) {
      return part.some((r) => r.user_id === userId);
    }
  } catch (_) {}

  // 2) Fallback: chats(user_a_id, user_b_id)
  try {
    const { data: chat, error } = await db
      .from(TABLE_CHAT)
      .select("user_a_id, user_b_id")
      .eq("id", chatId)
      .maybeSingle();
    if (!error && chat) {
      return chat.user_a_id === userId || chat.user_b_id === userId;
    }
  } catch (_) {}

  return false;
}

async function findOrCreateChat(dbUserScope, dbAdminScope, me, providerId) {
  // Află proprietarul provider-ului
  const { data: prov, error: pErr } = await (dbAdminScope || dbUserScope)
    .from(TABLE_PROV)
    .select("id, owner_user_id, user_id")
    .eq("id", providerId)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!prov) throw new Error("Provider inexistent.");

  const other =
    prov.owner_user_id || prov.user_id || null;
  if (!other) throw new Error("Provider fără proprietar asociat.");

  if (other === me) {
    // utilizatorul trimite către el însuși – permite, dar nu creăm chat duplicat
    // continuăm ca mai jos (căutăm/creăm chat)
  }

  // 1) Încearcă să găsești un chat existent
  // 1a) prin chats_participants: găsim un chat cu ambii participanți
  try {
    const { data: mine } = await (dbAdminScope || dbUserScope)
      .from(TABLE_PART)
      .select("chat_id")
      .eq("user_id", me);

    const { data: his } = await (dbAdminScope || dbUserScope)
      .from(TABLE_PART)
      .select("chat_id")
      .eq("user_id", other);

    if (Array.isArray(mine) && Array.isArray(his)) {
      const mineSet = new Set(mine.map((r) => r.chat_id));
      const common = his.find((r) => mineSet.has(r.chat_id));
      if (common?.chat_id) return common.chat_id;
    }
  } catch (_) {}

  // 1b) fallback: chats(user_a_id,user_b_id)
  try {
    const { data: chatA } = await (dbAdminScope || dbUserScope)
      .from(TABLE_CHAT)
      .select("id")
      .eq("user_a_id", me)
      .eq("user_b_id", other)
      .maybeSingle();
    if (chatA?.id) return chatA.id;

    const { data: chatB } = await (dbAdminScope || dbUserScope)
      .from(TABLE_CHAT)
      .select("id")
      .eq("user_a_id", other)
      .eq("user_b_id", me)
      .maybeSingle();
    if (chatB?.id) return chatB.id;
  } catch (_) {}

  // 2) Creează chat nou
  //    Preferăm să-l creăm cu service-role (sbAdmin) dacă există, ca să nu depindă de RLS strict.
  const writer = dbAdminScope || dbUserScope;

  // 2a) încerci întâi schema cu chats + chats_participants
  try {
    const { data: chat, error: cErr } = await writer
      .from(TABLE_CHAT)
      .insert({})
      .select("id")
      .single();
    if (cErr) throw cErr;

    const chatId = chat.id;

    // adaugă participanții (încearcă, dar nu e fatal dacă tabela nu există)
    try {
      const { error: pErr2 } = await writer
        .from(TABLE_PART)
        .insert([{ chat_id: chatId, user_id: me }, { chat_id: chatId, user_id: other }]);
      if (pErr2) {
        // dacă tabela nu există, ignorăm — poate folosim schema 1b
      }
    } catch (_) {}

    // fallback: setează user_a/b dacă există coloanele
    try {
      await writer
        .from(TABLE_CHAT)
        .update({ user_a_id: me, user_b_id: other })
        .eq("id", chatId);
    } catch (_) {}

    return chatId;
  } catch (e) {
    // 2b) fallback: creează direct cu user_a_id/user_b_id (dacă schema e din a doua variantă)
    const { data: chat2, error: cErr2 } = await writer
      .from(TABLE_CHAT)
      .insert({ user_a_id: me, user_b_id: other })
      .select("id")
      .single();
    if (cErr2) throw cErr2;
    return chat2.id;
  }
}

export default async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const m = method(req, ["GET", "POST"]);
  if (m === "METHOD_NOT_ALLOWED") return bad("Method Not Allowed", 405);

  // client cu tokenul utilizatorului
  const supa = supabaseFromRequest(req);

  // cine e user-ul?
  const { data: { user }, error: uerr } = await supa.auth.getUser();
  if (uerr || !user) return bad("Necesită autentificare", 401);

  // ============ GET: listare mesaje ============ //
  if (m === "GET") {
    const url = new URL(req.url);
    const chatId = url.searchParams.get("chat_id");
    const from = Math.max(0, parseInt(url.searchParams.get("from") || "0", 10));
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)), 100);
    if (!chatId) return bad("chat_id obligatoriu", 400);

    // verifică membru
    const allowed = await assertMembership(supa, chatId, user.id);
    if (!allowed) return bad("Nu ai acces la acest chat", 403);

    const { data, error } = await supa
      .from(TABLE_MSG)
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true }) // cronologic
      .range(from, from + limit - 1);

    if (error) return bad(error.message || "Eroare la listare", 500);
    return json(
      { ok: true, items: data, from, limit },
      200,
      { "Cache-Control": "no-store" }
    );
  }

  // ============ POST: trimite mesaj ============ //
  if (!rateLimit(req, { windowSec: 10, max: 8 })) {
    return bad("Prea des", 429);
  }

  const body = await bodyJSON(req);
  const rawText = body?.text;
  const text = sanitizeText(rawText);
  if (!text) return bad("Text invalid", 400);

  let chatId = body?.chat_id || null;

  // dacă vine cu to_provider_id, găsește sau creează chatul cu proprietarul provider-ului
  if (!chatId && body?.to_provider_id) {
    try {
      chatId = await findOrCreateChat(
        supa,
        sbAdmin || null,
        user.id,
        body.to_provider_id
      );
    } catch (e) {
      return bad(e?.message || "Nu pot inițializa conversația", 400);
    }
  }

  if (!chatId) return bad("chat_id sau to_provider_id obligatoriu", 400);

  // verifică membru pentru chat-ul țintă
  const allowed = await assertMembership(supa, chatId, user.id);
  if (!allowed) return bad("Nu ai acces la acest chat", 403);

  // scrie mesajul (preferăm service-role dacă există; altfel user-scope cu RLS)
  const writer = sbAdmin || supa;

  const { data, error } = await writer
    .from(TABLE_MSG)
    .insert([{ chat_id: chatId, sender_id: user.id, text }])
    .select()
    .single();

  if (error) return bad(error.message || "Eroare la trimitere", 500);

  return json(
    { ok: true, chat_id: chatId, message: data },
    201,
    { "Cache-Control": "no-store" }
  );
};