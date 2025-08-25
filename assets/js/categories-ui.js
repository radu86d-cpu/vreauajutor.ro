// assets/js/categories-ui.js

// Umple un <select id="serviceSelect">
export async function initServiceSelect(selectSelector = "#serviceSelect") {
  const select = document.querySelector(selectSelector);
  if (!select) return;

  try {
    const res = await fetch("/api/categories", { method: "GET" });
    const { items } = await res.json();

    select.innerHTML = '<option value="">Alege serviciul...</option>';
    (items || []).forEach(it => {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = it.display || it.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Nu pot încărca categoriile:", e);
  }
}

// Umple o listă de butoane <div id="serviceList"></div>
export async function initServiceButtons(containerSelector = "#serviceList") {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  try {
    const res = await fetch("/api/categories", { method: "GET" });
    const { items } = await res.json();

    container.innerHTML = "";
    (items || []).forEach(it => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "service-chip";
      btn.textContent = it.display || it.name;
      btn.dataset.id = it.id;
      btn.addEventListener("click", () => {
        // aici pui ce vrei să se întâmple când utilizatorul alege serviciul
        console.log("Ai ales serviciul:", it.id, it.name);
      });
      container.appendChild(btn);
    });
  } catch (e) {
    console.error("Nu pot încărca categoriile:", e);
  }
}
