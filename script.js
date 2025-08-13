function afiseazaFormular(tip) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginForm) loginForm.style.display = "none";
  if (registerForm) registerForm.style.display = "none";

  if (tip === "login" && loginForm) {
    loginForm.style.display = "block";
    loginForm.scrollIntoView({ behavior: "smooth" });
  } else if (tip === "register" && registerForm) {
    registerForm.style.display = "block";
    registerForm.scrollIntoView({ behavior: "smooth" });
  }
}

// doar slider-ul (popularea listelor se face acum din index.html prin /.netlify/functions/lists)
document.addEventListener('DOMContentLoaded', () => {
  let slideIndex = 0;
  const slides = document.getElementById('slides');
  const totalSlides = slides?.children.length || 0;

  function showSlide(index){
    if (slides) slides.style.transform = `translateX(-${index * 100}%)`;
  }

  window.moveSlide = function(direction){
    if (!totalSlides) return;               // protecție dacă nu sunt imagini
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  };

  if (totalSlides > 0){
    showSlide(0);                           // aliniază la start
    setInterval(() => window.moveSlide(1), 5000);
  }
});

// ----- autentificare / înregistrare (rămân la fel) -----
function openLogin(){
  const modal = document.getElementById('authModal');
  const login  = document.getElementById('loginForm');
  const reg    = document.getElementById('registerForm');

  if (modal) modal.style.display = 'block';
  if (login) login.style.display = 'block';
  if (reg)   reg.style.display   = 'none';

  document.getElementById('tab-login')?.classList.add('active');
  document.getElementById('tab-register')?.classList.remove('active');

  // focus pe email
  document.getElementById('login_email')?.focus();
}

function openRegister(){
  const modal = document.getElementById('authModal');
  const login  = document.getElementById('loginForm');
  const reg    = document.getElementById('registerForm');

  if (modal) modal.style.display = 'block';
  if (login) login.style.display = 'none';
  if (reg)   reg.style.display   = 'block';

  document.getElementById('tab-login')?.classList.remove('active');
  document.getElementById('tab-register')?.classList.add('active');

  // focus pe email register
  document.getElementById('register_email')?.focus();
}

function inchideModal(){
  const m = document.getElementById('authModal');
  if (m) m.style.display = 'none';
}

function schimbaTab(tab){
  if (tab === 'login') openLogin();
  else if (tab === 'register') openRegister();
}

// extra UX: Esc + click în overlay închide modalul
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') inchideModal();
});
document.getElementById('authModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'authModal') inchideModal();
});

