// assets/js/guard-offer.js
// Guard pentru accesarea /ofera-servicii.html direct (fără să fie logat)

(async () => {
  try {
    // ascunde conținutul până terminăm verificarea (evităm "flash")
    document.documentElement.dataset.guard = "checking";

    // ia cheile din funcția server (NU hardcoda!)
    const envRes = await fetch("/.netlify/functions/spa_env", { cache: "no-store" });
    const { ok, SUPABASE_URL, SUPABASE_ANON_KEY } = await envRes.json();
    if (!ok) throw new Error("Supabase env missing");

    // asigură-te că avem supabase-js încărcat (din index îl ai oricum; aici îl încărcăm sigur)
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

    const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { session } } = await supa.auth.getSession();

    // dacă NU e logat → redirecționează la pagina de înregistrare
    if (!session?.access_token) {
      // vrei modal în loc de redirect? vezi nota de mai jos
      location.replace("/inscriere.html?next=/ofera-servicii.html");
      return;
    }

    // este logat → arată conținutul
    document.documentElement.dataset.guard = "ok";
  } catch (e) {
    console.warn("offer guard:", e?.message || e);
    // ca fallback: tot redirecționează spre înscriere
    location.replace("/inscriere.html?next=/ofera-servicii.html");
  }
})();