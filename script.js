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
window.onload = function () {
  let slideIndex = 0;
  const slides = document.getElementById("slides");
  const totalSlides = slides?.children.length || 0;

  function showSlide(index) {
    if (slides) {
      slides.style.transform = `translateX(-${index * 100}%)`;
    }
  }

  window.moveSlide = function (direction) {
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  };

  if (totalSlides > 0) {
    setInterval(() => {
      window.moveSlide(1);
    }, 5000);
  }
};

// ----- autentificare / înregistrare (rămân la fel) -----
function openLogin() {
  document.getElementById("authModal").style.display = "block";
  document.getElementById("loginForm").style.display = "block";
  document.getElementById("registerForm").style.display = "none";
  document.getElementById("tab-login").classList.add("active");
  document.getElementById("tab-register").classList.remove("active");
}

function openRegister() {
  document.getElementById("authModal").style.display = "block";
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("registerForm").style.display = "block";
  document.getElementById("tab-login").classList.remove("active");
  document.getElementById("tab-register").classList.add("active");
}

function inchideModal() {
  document.getElementById("authModal").style.display = "none";
}

function schimbaTab(tab) {
  if (tab === "login") openLogin();
  else if (tab === "register") openRegister();
}
