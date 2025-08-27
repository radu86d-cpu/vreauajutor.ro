(() => {
  // ============================================================
  //  SLIDER (hero) – simplu, cu autoplay + respectă reduce-motion
  // ============================================================
  let slideIndex = 0;
  const slides = document.getElementById('slides');
  const totalSlides = slides ? slides.children.length : 0;
  const container = document.querySelector('.slider-container');

  const showSlide = (i) => {
    if (slides) slides.style.transform = `translateX(-${i * 100}%)`;
  };

  // expune funcția pentru butoanele HTML (prev/next)
  window.moveSlide = function (direction) {
    if (!totalSlides) return;
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let autoplay = null;
  const start = () => {
    if (prefersReducedMotion.matches) return;
    if (totalSlides > 0 && !autoplay) {
      autoplay = setInterval(() => window.moveSlide(1), 5000);
    }
  };
  const stop = () => {
    if (autoplay) { clearInterval(autoplay); autoplay = null; }
  };

  const initSlider = () => {
    if (totalSlides > 0) showSlide(0);
    start();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlider);
  } else {
    initSlider();
  }

  if (typeof prefersReducedMotion.addEventListener === 'function') {
    prefersReducedMotion.addEventListener('change', e => { e.matches ? stop() : start(); });
  } else if (typeof prefersReducedMotion.addListener === 'function') {
    prefersReducedMotion.addListener(mq => { mq.matches ? stop() : start(); });
  }

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  container?.addEventListener('mouseenter', stop);
  container?.addEventListener('mouseleave', start);
  container?.addEventListener('focusin', stop);
  container?.addEventListener('focusout', start);

  // ============================================================
  //  MODAL LOGIN / REGISTER (accesibil + trap focus)
  // ============================================================
  const modal           = document.getElementById('authModal');
  const btnTabLogin     = document.getElementById('tab-login');
  const btnTabRegister  = document.getElementById('tab-register');
  const loginPanel      = document.getElementById('loginForm');
  const registerPanel   = document.getElementById('registerForm');

  function setTabState(isLogin) {
    btnTabLogin?.classList.toggle('active',  isLogin);
    btnTabRegister?.classList.toggle('active', !isLogin);
    btnTabLogin?.setAttribute('aria-selected', String(isLogin));
    btnTabRegister?.setAttribute('aria-selected', String(!isLogin));
    loginPanel?.setAttribute('aria-hidden', String(!isLogin));
    registerPanel?.setAttribute('aria-hidden', String(isLogin));
  }

  let lastFocused = null;
  let focusTrapHandler = null;

  function trapFocus(e) {
    if (e.key !== 'Tab' || !modal) return;
    const focusables = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const arr = Array.from(focusables).filter(el => !el.disabled && el.offsetParent !== null);
    if (!arr.length) return;
    const first = arr[0], last = arr[arr.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    focusTrapHandler = trapFocus;
    document.addEventListener('keydown', focusTrapHandler);
    stop(); // oprește sliderul cât timp e deschis modalul
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
    lastFocused?.focus?.();
    start(); // pornește la loc sliderul după închiderea modalului
  }

  window.openLogin = function () {
    openModal();
    if (loginPanel)    loginPanel.style.display = 'block';
    if (registerPanel) registerPanel.style.display = 'none';
    setTabState(true);
    document.getElementById('login_email')?.focus();
  };

  window.openRegister = function () {
    openModal();
    if (loginPanel)    loginPanel.style.display = 'none';
    if (registerPanel) registerPanel.style.display = 'block';
    setTabState(false);
    document.getElementById('register_email')?.focus();
  };

  window.inchideModal = closeModal;

  window.schimbaTab = function (tab) {
    if (tab === 'login') window.openLogin();
    else if (tab === 'register') window.openRegister();
  };

  // Închidere cu Escape sau click pe overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // ============================================================
  //  GARD AUTENTIFICARE pentru „Oferă servicii”
  //  - Interceptează click-ul pe orice link către ofera-servicii.html
  //  - Dacă nu e logat → deschide modal login/register
  //  - Dacă e logat → lasă navigarea normal
  // ============================================================

  // mic helper pentru ENV Supabase
  async function getSupa() {
    // Dacă index.html a inițializat deja window.supa, folosește-l
    if (window.supa && typeof window.supa.auth?.getSession === 'function') return window.supa;

    try {
      const r = await fetch('/.netlify/functions/spa_env', { cache: 'no-store' });
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = await r.json();
      const supa = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supa || null;
    } catch (e) {
      console.error('Nu pot inițializa Supabase:', e);
      return null;
    }
  }

  async function isAuthenticated() {
    try {
      const supa = await getSupa();
      if (!supa) return false;
      const { data: { session } } = await supa.auth.getSession();
      return !!session?.access_token;
    } catch {
      return false;
    }
  }

  // Interceptează toate click-urile pe <a> către ofera-servicii.html
  function interceptOfferLinks() {
    document.addEventListener('click', async (e) => {
      const a = e.target.closest('a');
      if (!a) return;

      // Only guard links that navigate to ofera-servicii.html (relative or absolute)
      const href = a.getAttribute('href') || '';
      if (!href) return;

      // Normalize check (works for "ofera-servicii.html", "/ofera-servicii.html", full URL)
      let goesToOffer = false;
      try {
        // try absolute URL resolution
        const url = new URL(href, location.href);
        goesToOffer = /\/ofera-servicii\.html(?:$|\?)/i.test(url.pathname);
      } catch {
        // fallback: string contains
        goesToOffer = href.includes('ofera-servicii.html');
      }

      if (!goesToOffer) return;

      // If already explicitly marked to skip guard (e.g., data-skip-auth="true"), let it pass
      if (a.hasAttribute('data-skip-auth')) return;

      // Check auth status
      const ok = await isAuthenticated();
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
        // Deschide modalul pe tabul REGISTER, ca pe fluxul OLX
        window.openRegister?.();
      }
      // dacă e logat -> nu intervenim, navigarea merge normal
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', interceptOfferLinks);
  } else {
    interceptOfferLinks();
  }

  // ============================================================
  //  AJUTORBOT – închidere/deschidere panou (dacă există în pagină)
  // ============================================================
  window.toggleAjb = function () {
    const w = document.getElementById('ajb-widget');
    if (!w) return;
    const header = w.querySelector('.ajb-header');
    w.classList.toggle('minimized');
    const expanded = !w.classList.contains('minimized');
    header?.setAttribute('aria-expanded', String(expanded));
    if (expanded) {
      setTimeout(() => document.getElementById('ajb-input')?.focus(), 0);
    }
  };

  window.ajbSend = async function () {
    const inp = document.getElementById('ajb-input');
    const txt = (inp?.value || '').trim();
    if (!txt) return;

    const box = document.getElementById('ajb-messages');
    const append = (sender, text) => {
      if (!box) return;
      const d = document.createElement('div');
      d.style.margin = '6px 0';
      d.innerHTML = '<strong>' + sender + ':</strong> ' + (text || '');
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    };

    append('Tu', txt);
    if (inp) inp.value = '';

    const AJB_API = new URLSearchParams(location.search).get('api') || '/chat';
    try {
      const r = await fetch(AJB_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: txt })
      });
      if (!r.ok) throw new Error('Request failed: ' + r.status + ' ' + r.statusText);
      const data = await r.json();
      append('AjutorBot', data.reply ?? 'Răspuns gol de la server.');
    } catch (e) {
      console.error(e);
      append('AjutorBot', 'Nu pot contacta serverul. Verifică dacă rulează și dacă ai setat OPENAI_API_KEY.');
    }
  };
})();