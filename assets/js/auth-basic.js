<!-- /assets/js/auth-basic.js -->
<script>
/**
 * Auth minimal pe Supabase (email + parolă).
 * Expune: window.initAuthBasic({ mode: 'signup' | 'login' })
 *
 * HTML așteptat pe pagină:
 *   <form id="auth-form">
 *     <input id="email" type="email" required />
 *     <input id="password" type="password" required />
 *     <button type="submit">...</button>
 *     <div id="auth-msg"></div>
 *   </form>
 */
(function () {
  let supa = null;

  async function getSupa() {
    if (supa) return supa;

    // 1) Luăm cheile din funcția server (nu pune chei în client)
    const envRes = await fetch('/.netlify/functions/spa_env', { cache: 'no-store' });
    if (!envRes.ok) throw new Error('Nu pot încărca cheile Supabase.');
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await envRes.json();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('ENV Supabase lipsă.');

    // 2) Injectăm supabase-js dacă nu există
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Nu pot încărca supabase-js.'));
        document.head.appendChild(s);
      });
    }

    supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supa;
  }

  function setMsg(text, ok) {
    const el = document.getElementById('auth-msg');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = ok ? '#16a34a' : '#dc2626';
    el.style.fontWeight = '600';
  }

  function getNext() {
    const u = new URL(location.href);
    return u.searchParams.get('next') || '/';
  }

  async function onSignup(ev) {
    ev.preventDefault();
    const supa = await getSupa();

    const email = (document.getElementById('email').value || '').trim();
    const pass  = document.getElementById('password').value || '';

    if (!email) return setMsg('Completează emailul.');
    if (pass.length < 9) return setMsg('Parola trebuie să aibă minim 9 caractere.');

    setMsg('Se procesează...', true);

    const { error } = await supa.auth.signUp({
      email,
      password: pass,
      options: { emailRedirectTo: location.origin + '/auth-callback.html?next=' + encodeURIComponent(getNext()) }
    });

    if (error) return setMsg(error.message || 'Eroare la înregistrare.');
    setMsg('Ți-am trimis un email de confirmare. Verifică inbox-ul.', true);
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const supa = await getSupa();

    const email = (document.getElementById('email').value || '').trim();
    const pass  = document.getElementById('password').value || '';

    if (!email || !pass) return setMsg('Completează email și parolă.');

    setMsg('Autentificare...', true);

    const { data, error } = await supa.auth.signInWithPassword({ email, password: pass });
    if (error) return setMsg(error.message || 'Email sau parolă greșite.');
    if (!data?.session) return setMsg('Nu am putut crea sesiunea.');

    // redirect
    location.replace(getNext());
  }

  window.initAuthBasic = async function ({ mode = 'signup' } = {}) {
    try {
      await getSupa();
      const form = document.getElementById('auth-form');
      if (!form) return;
      form.addEventListener('submit', mode === 'login' ? onLogin : onSignup);
    } catch (e) {
      console.error(e);
      setMsg('Auth indisponibil momentan.');
    }
  };
})();
</script>