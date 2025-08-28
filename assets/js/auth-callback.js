// assets/js/auth-callback.js
// Pagina /auth-callback.html — finalizează sesiunea și redirecționează la ?next=

(async () => {
  const log = (t) => { const el = document.getElementById("state"); if (el) el.textContent = t; };

  try {
    log("Se inițializează...");
    const res = await fetch("/.netlify/functions/spa_env", { cache: "no-store" });
    const env = await res.json();
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

    const supa = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

    // Supabase gestionează fragmentul # access_token etc. în mod automat;
    // doar așteptăm sesiunea.
    const { data: s1 } = await supa.auth.getSession();

    if (!s1?.session) {
      log("Aștept confirmarea sesiunii...");
      await new Promise((resolve) => {
        const { data: sub } = supa.auth.onAuthStateChange((_event, session) => {
          if (session?.access_token) {
            sub.subscription.unsubscribe();
            resolve();
          }
        });
        // fallback hard: după 7s, oricum continuăm
        setTimeout(resolve, 7000);
      });
    }

    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    const target = (next && next.startsWith("/") && !next.startsWith("//")) ? next : "/";

    log("Te redirecționăm...");
    location.replace(target);
  } catch (e) {
    log(e.message || "Eroare la finalizarea autentificării.");
  }
})();