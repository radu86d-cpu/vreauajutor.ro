(() => {
  // === DEBUG helper: comentează următoarea linie după ce e ok
  const DBG = (...a) => { try { console.log("[VA]", ...a); } catch {} };

  // ============================================================
  //  SUPABASE helpers (client + auth state)
  // ============================================================
  async function ensureSupabase() {
    if (window.__supaClient) return window.__supaClient;
    const r = await fetch("/api/spa_env", { cache: "no-store", credentials: "omit" });
    if (!r.ok) throw new Error("Nu pot citi /api/spa_env");
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await r.json();
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Lipsesc cheile Supabase");

    let createClient = window.supabase?.createClient;
    if (!createClient) {
      const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      createClient = mod.createClient;
    }
    window.__supaClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.__supaClient;
  }
  async function getCurrentUser() {
    try {
      const supa = await ensureSupabase();
      const { data: { user } } = await supa.auth.getUser();
      return user || null;
    } catch (e) {
      DBG("getCurrentUser error:", e);
      return null;
    }
  }

  // ============================================================
  //  INTENȚIE post-login (next redirect)
  // ============================================================
  const setPost = (path) => { try { sessionStorage.setItem("postAuthRedirect", path); } catch {} };
  const clearPost = ()   => { try { sessionStorage.removeItem("postAuthRedirect"); } catch {} };

  // ============================================================
  //  Helper: normalizare path
  // ============================================================
  const normPath = (p) => (p || "").replace(/\/+$/, "") || "/";
  const OFFER_PATH = "/ofera-servicii.html";

  function isOfferHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, location.origin);
      return normPath(u.pathname) === OFFER_PATH;
    } catch {
      return href.includes("ofera-servicii.html");
    }
  }

  // ============================================================
  //  0) Guard LA ÎNCĂRCARE DE PAGINĂ (acces direct la /ofera-servicii.html)
  // ============================================================
  async function guardDirectAccess() {
    const here = normPath(location.pathname);
    if (here !== OFFER_PATH) return; // doar pentru /ofera-servicii.html
    const user = await getCurrentUser();
    if (!user) {
      DBG("Direct pe /ofera-servicii.html dar neautentificat → trimitem la login");
      setPost(OFFER_PATH);
      if (typeof window.openLogin === "function") {
        // Dacă ai modal pe această pagină:
        window.openLogin();
      } else {
        // Fallback: pagină clasică de autentificare
        location.replace("/autentificare.html");
      }
    }
  }

  // ============================================================
  //  1) Interceptare click-uri către Oferă servicii (capture phase)
  // ============================================================
  async function onAnyClickCapture(e) {
    try {
      const t = e.target;
      if (!t) return;

      const a = t.closest && t.closest("a, button");
      if (!a) return;

      // Detectăm butoane/links Oferă servicii
      const href = a.getAttribute && a.getAttribute("href");
      const gotoOffer =
        a.classList?.contains("cta-suppliers") ||
        a.classList?.contains("link-suppliers") ||
        a.id === "btnOffer" ||
        isOfferHref(href);

      if (!gotoOffer) return;

      const user = await getCurrentUser();
      if (!user) {
        DBG("Click pe Oferă servicii neautentificat → bloc & login");
        e.preventDefault();
        e.stopPropagation();

        setPost(OFFER_PATH);
        if (typeof window.openLogin === "function") {
          window.openLogin(); // deschide modal Login
        } else {
          location.href = "/autentificare.html";
        }
      }
    } catch (err) {
      DBG("onAnyClickCapture error:", err);
    }
  }

  // ============================================================
  //  2) Butoane meniu: Autentificare / Înregistrare
  //      – după login, mergem ACASĂ (conform cerinței)
  // ============================================================
  function wireAuthButtons() {
    const btnLogin    = document.getElementById("btnLogin");
    const btnRegister = document.getElementById("btnRegister");

    const goHomeAfter = () => setPost("/");

    btnLogin?.addEventListener("click", (e) => {
      e.preventDefault();
      DBG("Click Autentificare → goHomeAfter=/");
      goHomeAfter();
      if (typeof window.openLogin === "function") window.openLogin();
      else location.href = "/autentificare.html";
    });

    btnRegister?.addEventListener("click", (e) => {
      e.preventDefault();
      DBG("Click Înregistrare → goHomeAfter=/");
      goHomeAfter();
      if (typeof window.openRegister === "function") window.openRegister();
      else location.href = "/inregistrare.html";
    });
  }

  // ============================================================
  //  3) Slider + Modal (opțional, dacă există în pagină)
  // ============================================================
  function initSliderAndModal() {
    // Slider (doar dacă ai structura cu #slides)
    let slideIndex = 0;
    const slides = document.getElementById("slides");
    const totalSlides = slides ? slides.children.length : 0;
    const container = document.querySelector(".slider-container");
    const showSlide = (i) => { if (slides) slides.style.transform = `translateX(-${i * 100}%)`; };
    window.moveSlide = (d) => { if (!totalSlides) return; slideIndex = (slideIndex + d + totalSlides) % totalSlides; showSlide(slideIndex); };
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let autoplay = null;
    const start = () => { if (!prefersReducedMotion.matches && totalSlides > 0 && !autoplay) autoplay = setInterval(() => window.moveSlide(1), 5000); };
    const stop  = () => { if (autoplay) { clearInterval(autoplay); autoplay = null; } };
    const initS = () => { if (totalSlides > 0) showSlide(0); start(); };
    initS();
    prefersReducedMotion.addEventListener?.("change", (e) => e.matches ? stop() : start());
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    container?.addEventListener("mouseenter", stop);
    container?.addEventListener("mouseleave", start);

    // Modal (dacă există în pagină)
    const modal = document.getElementById("authModal");
    const btnTabLogin = document.getElementById("tab-login");
    const btnTabRegister = document.getElementById("tab-register");
    const loginPanel = document.getElementById("loginForm");
    const registerPanel = document.getElementById("registerForm");
    const setTabState = (isLogin) => {
      btnTabLogin?.classList.toggle("active", isLogin);
      btnTabRegister?.classList.toggle("active", !isLogin);
      loginPanel?.setAttribute("aria-hidden", String(!isLogin));
      registerPanel?.setAttribute("aria-hidden", String(isLogin));
    };
    let lastFocused = null;
    function openModal() {
      if (!modal) return;
      lastFocused = document.activeElement;
      modal.style.display = "block";
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      stop();
    }
    function closeModal() {
      if (!modal) return;
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      lastFocused?.focus?.();
      start();
    }
    window.openLogin = () => {
      openModal();
      if (loginPanel) loginPanel.style.display = "block";
      if (registerPanel) registerPanel.style.display = "none";
      setTabState(true);
      document.getElementById("login_email")?.focus();
    };
    window.openRegister = () => {
      openModal();
      if (loginPanel) loginPanel.style.display = "none";
      if (registerPanel) registerPanel.style.display = "block";
      setTabState(false);
      document.getElementById("register_email")?.focus();
    };
    window.inchideModal = closeModal;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  }

  // ============================================================
  //  BOOT
  // ============================================================
  window.addEventListener("click", onAnyClickCapture, true); // CAPTURE phase
  document.addEventListener("DOMContentLoaded", () => {
    wireAuthButtons();
    initSliderAndModal();
    guardDirectAccess();
  });

  // Log erori JS (să știm dacă se oprește ceva)
  window.addEventListener("error", (e) => DBG("JS error:", e.message, e.filename, e.lineno));
})();