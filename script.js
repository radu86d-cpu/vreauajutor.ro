(() => {
  // ---------- SLIDER ----------
  let slideIndex = 0;
  const slides = document.getElementById('slides');
  const totalSlides = slides ? slides.children.length : 0;
  const container = document.querySelector('.slider-container');

  const showSlide = (i) => {
    if (slides) slides.style.transform = `translateX(-${i * 100}%)`;
  };

  // expune pentru butoanele HTML
  window.moveSlide = function(direction) {
    if (!totalSlides) return;
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  };

  // respectă preferința de mișcare redusă
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // autoplay (pauză când tab-ul nu e activ / hover / focus în slider)
  let autoplay = null;
  const start = () => {
    if (prefersReducedMotion.matches) return; // nu autoredăm dacă userul preferă mai puțină mișcare
    if (totalSlides > 0 && !autoplay) autoplay = setInterval(() => window.moveSlide(1), 5000);
  };
  const stop = () => {
    if (autoplay) { clearInterval(autoplay); autoplay = null; }
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (totalSlides > 0) showSlide(0);
    start();
  });

  prefersReducedMotion.addEventListener?.('change', e => { e.matches ? stop() : start(); });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  container?.addEventListener('mouseenter', stop);
  container?.addEventListener('mouseleave', start);
  container?.addEventListener('focusin', stop);
  container?.addEventListener('focusout', start);

  // control din tastatură — nu interceptăm când scrii în input/textarea/select
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input','textarea','select'].includes(tag) || e.target.isContentEditable) return;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); window.moveSlide(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); window.moveSlide(1); }
  });

  // ---------- MODAL LOGIN/REGISTER ----------
  const modal = document.getElementById('authModal');
  const btnTabLogin    = document.getElementById('tab-login');
  const btnTabRegister = document.getElementById('tab-register');
  const login  = document.getElementById('loginForm');
  const reg    = document.getElementById('registerForm');

  let lastFocused = null;
  let focusTrapHandler = null;

  function trapFocus(e){
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

  function openModal(){
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    focusTrapHandler = trapFocus;
    document.addEventListener('keydown', focusTrapHandler);
  }

  function closeModal(){
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', focusTrapHandler);
    focusTrapHandler = null;
    lastFocused?.focus?.();
  }

  window.openLogin = function() {
    openModal();
    if (login) login.style.display = 'block';
    if (reg)   reg.style.display   = 'none';
    btnTabLogin?.classList.add('active');
    btnTabRegister?.classList.remove('active');
    document.getElementById('login_email')?.focus();
  };

  window.openRegister = function() {
    openModal();
    if (login) login.style.display = 'none';
    if (reg)   reg.style.display   = 'block';
    btnTabLogin?.classList.remove('active');
    btnTabRegister?.classList.add('active');
    document.getElementById('register_email')?.focus();
  };

  window.inchideModal = closeModal;

  window.schimbaTab = function(tab){
    if (tab === 'login') window.openLogin();
    else if (tab === 'register') window.openRegister();
  };

  // compat: vechiul nume
  window.afiseazaFormular = window.schimbaTab;

  // Escape + click în overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
})();
