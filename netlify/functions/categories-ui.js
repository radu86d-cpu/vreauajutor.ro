// assets/js/categories-ui.js

// Populează dropdown-ul de servicii (categorii)
export async function initServiceSelect(selectSelector = "#serviceSelect") {
  const select = document.querySelector(selectSelector);
  if (!select) return;

  const { items } = await fetchJSON("/api/categories");

  select.innerHTML = '<option value="">Alege serviciul...</option>';
  (items || []).forEach(it => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.display || it.name;
    select.appendChild(opt);
  });

  // când se schimbă categoria -> încarcă subcategoriile
  select.addEventListener("change", async () => {
    const serviceId = select.value || "";
    await renderSubcategories("#subcats", serviceId);
    await renderChildren("#children", null); // golește nivelul 3
  });
}

// Încarcă subcategoriile și le redă ca „chips”
export async function renderSubcategories(containerSelector, serviceId) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  if (!serviceId) { el.textContent = "Alege un serviciu mai sus."; return; }

  const { items } = await fetchJSON(`/api/subcategories?serviceId=${encodeURIComponent(serviceId)}`);

  if (!items?.length) { el.textContent = "Nu există subcategorii."; return; }

  el.classList.add("service-list");
  items.forEach(it => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "service-chip";
    btn.textContent = it.name;
    btn.dataset.id = it.id;
    btn.addEventListener("click", async () => {
      // marchează activ
      el.querySelectorAll(".service-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      await renderChildren("#children", it.id);
    });
    el.appendChild(btn);
  });
}

// Încarcă copiii (nivel 3) pentru subcategorie
export async function renderChildren(containerSelector, subcatId) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  if (!subcatId) { el.textContent = ""; return; }

  const { items } = await fetchJSON(`/api/children?subcatId=${encodeURIComponent(subcatId)}`);

  if (!items?.length) { el.textContent = "Nu există elemente pe nivelul următor."; return; }

  el.classList.add("service-list");
  items.forEach(it => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "service-chip";
    btn.textContent = it.name;
    btn.dataset.id = it.id;
    btn.addEventListener("click", () => {
      // aici poți salva alegerea finală, dacă ai nevoie
      console.log("Ai ales copilul:", it.id, it.name);
    });
    el.appendChild(btn);
  });
}

// utilitar mic
async function fetchJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
