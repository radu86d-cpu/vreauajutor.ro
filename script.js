
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

// slider + populare formular + servicii
window.onload = function () {
  populateJudete();
  populateServicii();

  let slideIndex = 0;
  const slides = document.getElementById("slides");
  const totalSlides = slides?.children.length || 0;

  function showSlide(index) {
    if (slides) {
      slides.style.transform = `translateX(-${index * 100}%)`;
    }
  }

  function moveSlide(direction) {
    slideIndex = (slideIndex + direction + totalSlides) % totalSlides;
    showSlide(slideIndex);
  }

  window.moveSlide = moveSlide;

  if (totalSlides > 0) {
    setInterval(() => {
      moveSlide(1);
    }, 5000);
  }
};

async function populateJudete() {
  try {
    const response = await fetch("judete_orase_servicii.json");
    const data = await response.json();

    const judetSelect = document.getElementById("judet");
    const orasSelect = document.getElementById("oras");

    if (!judetSelect || !orasSelect) return;

    judetSelect.innerHTML = "<option>Alege județul</option>";

    for (let judet in data) {
      const opt = document.createElement("option");
      opt.value = judet;
      opt.innerText = judet;
      judetSelect.appendChild(opt);
    }

    judetSelect.onchange = function () {
      orasSelect.innerHTML = "<option>Alege orașul</option>";
      const orase = Object.keys(data[this.value] || {});
      orase.forEach(oras => {
        const opt = document.createElement("option");
        opt.value = oras;
        opt.innerText = oras;
        orasSelect.appendChild(opt);
      });
    };
  } catch (err) {
    console.error("Eroare la încărcarea județelor:", err);
  }
}

function populateServicii() {
  const servicii = ["Curățenie", "Instalator", "Electrician", "Bone", "Transport"];
  const serviciuSelect = document.getElementById("serviciu");

  if (!serviciuSelect) return;

  serviciuSelect.innerHTML = "<option>Alege serviciul</option>";
  servicii.forEach(serv => {
    const opt = document.createElement("option");
    opt.value = serv;
    opt.innerText = serv;
    serviciuSelect.appendChild(opt);
  });
}
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
