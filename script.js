(() => {
  // ============================================================
  //  SLIDER (hero) – simplu, cu autoplay + respectă reduce-motion
  // ============================================================
  let slideIndex = 0;
  const slides = document.getElementById("slides");
  const totalSlides = slides ? slides.children.length : 0;
  const container = document.querySelector(".slider-container");

  const showSlide = (i) => {
    if (slides) slides.style.transform = `translateX(-${i * 100}%)`;
  };

  window.moveSlide = function (direction) {
    if (!totalSlides) return;
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  };

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let autoplay = null;
  const start = () => {
    if (prefersReducedMotion.matches) return;
    if (totalSlides > 0 && !autoplay) {
      autoplay = setInterval(() => window.moveSlide(1), 5000);
    }
  };
  const stop = () => {
    if (autoplay) {
      clearInterval(autoplay);
      autoplay = null;
    }
  };

  const initSlider = () => {
    if (totalSlides > 0) showSlide(0);
    start();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSlider);
  } else {
    initSlider();
  }

  if (typeof prefersReducedMotion.addEventListener === "function") {
    prefersReducedMotion.addEventListener("change", (e) => (e.matches ? stop() : start()));
  }

  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  container?.addEventListener("mouseenter", stop);
  container?.addEventListener("mouseleave", start);

  // ============================================================
  //  MODAL LOGIN / REGISTER
  // ============================================================
  const modal = document.getElementById("authModal");
  const btnTabLogin = document.getElementById("tab-login");
  const btnTabRegister = document.getElementById("tab-register");
  const loginPanel = document.getElementById("loginForm");
  const registerPanel = document.getElementById("registerForm");

  function setTabState(isLogin) {
    btnTabLogin?.classList.toggle("active", isLogin);
    btnTabRegister?.classList.toggle("active", !isLogin);
    loginPanel?.setAttribute("aria-hidden", String(!isLogin));
    registerPanel?.setAttribute("aria-hidden", String(isLogin));
  }

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
    modal.setAttribute("aria-hidden", "true"); // ✅ FIX: paranteză închisă corect
    document.body.style.overflow = "";
    lastFocused?.focus?.();
    start();
  }

  window.openLogin = function () {
    openModal();
    if (loginPanel) loginPanel.style.display = "block";
    if (registerPanel) registerPanel.style.display = "none";
    setTabState(true);
    document.getElementById("login_email")?.focus();
  };

  window.openRegister = function () {
    openModal();
    if (loginPanel) loginPanel.style.display = "none";
    if (registerPanel) registerPanel.style.display = "block";
    setTabState(false);
    document.getElementById("register_email")?.focus();
  };

  window.inchideModal = closeModal;

  // Închidere cu Escape sau click pe overlay
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

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
    } catch {
      return null;
    }
  }

  // ============================================================
  //  INTENȚIE post-login (next redirect)
  // ============================================================
  function setPostAuthRedirect(path) {
    try { sessionStorage.setItem("postAuthRedirect", path); } catch {}
  }
  function clearPostAuthRedirect() {
    try { sessionStorage.removeItem("postAuthRedirect"); } catch {}
  }

  // ============================================================
  //  Helper: detectează link către Oferă servicii
  // ============================================================
  function isOfferHref(href) {
    if (!href) return false;
    try {
      const u = new URL(href, location.origin);
      return u.pathname.replace(/\/+$/, "") === "/ofera-servicii.html";
    } catch {
      return href.includes("ofera-servicii.html");
    }
  }

  // ============================================================
  //  GARD AUTENTIFICARE pentru „Oferă servicii”
  // ============================================================
  function interceptOfferLinks() {
    document.addEventListener("click", async (e) => {
      const a = e.target.closest("a, button");
      if (!a) return;

      const href = a.getAttribute("href");
      const gotoOffer =
        a.classList.contains("cta-suppliers") ||
        a.classList.contains("link-suppliers") ||
        a.id === "btnOffer" ||
        isOfferHref(href);

      if (!gotoOffer) return;

      const user = await getCurrentUser();
      if (!user) {
        e.preventDefault();
        e.stopPropagation();
        setPostAuthRedirect("/ofera-servicii.html");
        if (typeof window.openLogin === "function") {
          window.openLogin(); // deschide login
        } else {
          location.href = "/autentificare.html";
        }
      }
      // dacă e logat, lăsăm navigarea normală
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", interceptOfferLinks);
  } else {
    interceptOfferLinks();
  }

  // ============================================================
  //  BUTOANE MENIU: Autentificare / Înregistrare (revenire unde ești)
  // ============================================================
  function wireAuthButtons() {
    const btnLogin = document.getElementById("btnLogin");
    const btnRegister = document.getElementById("btnRegister");

    const backHere = () => {
      const next = location.pathname + location.search;
      setPostAuthRedirect(next || "/");
    };

    btnLogin?.addEventListener("click", (e) => {
      e.preventDefault();
      backHere();
      window.openLogin?.();
    });

    btnRegister?.addEventListener("click", (e) => {
      e.preventDefault();
      backHere();
      window.openRegister?.();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireAuthButtons);
  } else {
    wireAuthButtons();
  }

  // ============================================================
  //  AJUTORBOT
  // ============================================================
  window.toggleAjb = function () {
    const w = document.getElementById("ajb-widget");
    if (!w) return;
    w.classList.toggle("minimized");
  };

  window.ajbSend = async function () {
    const inp = document.getElementById("ajb-input");
    const txt = (inp?.value || "").trim();
    if (!txt) return;

    const box = document.getElementById("ajb-messages");
    const append = (sender, text) => {
      if (!box) return;
      const d = document.createElement("div");
      d.style.margin = "6px 0";
      d.innerHTML = `<strong>${sender}:</strong> ${text}`;
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    };

    append("Tu", txt);
    inp.value = "";

    const AJB_API =
      new URLSearchParams(location.search).get("api") || "/.netlify/functions/chat";
    try {
      const r = await fetch(AJB_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: txt })
      });
      const data = await r.json();
      append("AjutorBot", data.reply ?? "Răspuns gol de la server.");
    } catch (e) {
      append("AjutorBot", "Eroare la contactarea serverului.");
    }
  };
})();