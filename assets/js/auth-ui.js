// assets/js/auth-ui.js
// Control pentru modalul de autentificare (login/register)

(() => {
  const modal          = document.getElementById("authModal");
  const btnTabLogin    = document.getElementById("tab-login");
  const btnTabRegister = document.getElementById("tab-register");
  const loginPanel     = document.getElementById("loginForm");
  const registerPanel  = document.getElementById("registerForm");
  let lastFocused      = null;
  let trapHandler      = null;

  function setTab(isLogin) {
    btnTabLogin?.classList.toggle("active",  isLogin);
    btnTabRegister?.classList.toggle("active", !isLogin);
    btnTabLogin?.setAttribute("aria-selected", String(isLogin));
    btnTabRegister?.setAttribute("aria-selected", String(!isLogin));
    loginPanel?.setAttribute("aria-hidden", String(!isLogin));
    registerPanel?.setAttribute("aria-hidden", String(isLogin));
  }

  function trapFocus(e) {
    if (e.key !== "Tab" || !modal) return;
    const focusables = modal.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
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

  function openModal(defaultTab = "login") {
    lastFocused = document.activeElement;
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    trapHandler = trapFocus;
    document.addEventListener("keydown", trapHandler);
    if (defaultTab === "register") openRegister(); else openLogin();
  }

  function closeModal() {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", trapHandler);
    trapHandler = null;
    lastFocused?.focus?.();
  }

  function openLogin() {
    if (!modal) return;
    loginPanel.style.display    = "block";
    registerPanel.style.display = "none";
    setTab(true);
    document.getElementById("login_email")?.focus();
  }

  function openRegister() {
    if (!modal) return;
    loginPanel.style.display    = "none";
    registerPanel.style.display = "block";
    setTab(false);
    document.getElementById("register_email")?.focus();
  }

  // expunem global
  window.openLogin    = () => openModal("login");
  window.openRegister = () => openModal("register");
  window.closeAuth    = closeModal;

  // butoane tab
  btnTabLogin?.addEventListener("click", openLogin);
  btnTabRegister?.addEventListener("click", openRegister);

  // închidere cu Escape
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  // click pe overlay
  modal?.addEventListener("click", e => { if (e.target === modal) closeModal(); });
})();