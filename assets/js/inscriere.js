// assets/js/inscriere.js
// Pagina /inscriere.html — signup + OAuth, propagate ?next=...

let supa = null;

// helper UI
const $ = (sel) => document.querySelector(sel);
const msg = (t, ok = false) => {
  const el = $("#msg");
  if (!el) return;
  el.textContent = t || "";
  el.className = ok ? "success" : "error";
};

function getNext() {
  const p = new URLSearchParams(location.search);
  const n = p.get("next");
  // sanity: accept doar rute interne
  if (n && n.startsWith("/") && !n.startsWith("//")) return n;
  return "/ofera-servicii.html";
}

function validPass(p) {
  return /(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{9,}/.test(p || "");
}

async function loadSupabase() {
  const envRes = await fetch("/.netlify/functions/spa_env", { cache: "no-store" });
  const env = await envRes.json();
  if (!env.ok) throw new Error("Missing Supabase envs");
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("supabase-js load failed"));
      document.head.appendChild(s);
    });
  }
  supa = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

async function startOAuth(provider) {
  try {
    await loadSupabase();
    const next = getNext();
    const { error } = await supa.auth.signInWithOAuth({
      provider,
      options: { redirectTo: location.origin + "/auth-callback.html?next=" + encodeURIComponent(next) }
    });
    if (error) throw error;
  } catch (e) {
    msg(e.message || "Nu am putut porni autentificarea.");
  }
}

async function onSubmitEmail(ev) {
  ev.preventDefault();
  try {
    await loadSupabase();

    const email = ($("#email")?.value || "").trim();
    const pass = $("#pass")?.value || "";
    const okA = $("#agree")?.checked;

    if (!email) return msg("Completează adresa de email.");
    if (!validPass(pass)) return msg("Parola nu respectă regulile.");
    if (!okA) return msg("Trebuie să accepți termenii.");

    msg("Trimit...", true);
    const next = getNext();
    const { error } = await supa.auth.signUp({
      email,
      password: pass,
      options: { emailRedirectTo: location.origin + "/auth-callback.html?next=" + encodeURIComponent(next) }
    });
    if (error) throw error;
    msg("Ți-am trimis un email de confirmare. Verifică inbox-ul.", true);
  } catch (e) {
    msg(e.message || "Eroare la creare cont.");
  }
}

// bind UI
document.addEventListener("DOMContentLoaded", () => {
  $("#btnGoogle")?.addEventListener("click", () => startOAuth("google"));
  $("#btnApple")?.addEventListener("click", () => startOAuth("apple"));
  $("#btnFb")?.addEventListener("click", () => startOAuth("facebook"));
  $("#form")?.addEventListener("submit", onSubmitEmail);
});