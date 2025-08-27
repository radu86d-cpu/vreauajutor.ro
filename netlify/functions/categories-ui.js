// assets/js/categories-ui.js
// (cascader 2 coloane) — compat cu offer.css și id-urile #subcats / #children
// Folosește funcțiile Netlify: /.netlify/functions/lists și /.netlify/functions/taxonomy

/* ========= Utils ========= */
async function fetchJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
function el(sel) { return document.querySelector(sel); }

/* ========= State ========= */
let __activeSubcatKey = null;              // id numeric sau nume (fallback)
let __activeSubcatName = null;             // pentru hidden name
// Mapă: subcatKey -> Set(childIdString)
if (!window.__sel) window.__sel = { bySub: new Map() };

/* ========= Servicii (categorii) pentru formularul de înscriere ========= */
/**
 * Populează dropdown-ul de servicii (categorii) pentru înscriere.
 * @param {string} selectSelector ex: "#service_name"
 */
export async function initServiceSelect(selectSelector = "#service_name") {
  const select = el(selectSelector);
  if (!select) return;

  try {
    // lists?mode=signup -> { services:[ {name,label} ], judete, ... }
    const res = await fetch("/.netlify/functions/lists?mode=signup", { cache: "no-store" });
    const { services = [] } = await res.json();

    select.innerHTML = '<option value="">Alege serviciul</option>';
    (services || []).forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.name;                 // IMPORTANT: backend folosește numele
      opt.textContent = s.label || s.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Nu pot încărca serviciile:", e);
    select.innerHTML = '<option value="">Eroare la încărcare</option>';
  }

  // când se schimbă categoria -> încarcă subcategoriile
  select.addEventListener("change", async () => {
    const serviceName = select.value || "";
    await renderSubcategories("#subcats", serviceName);
    await renderChildren("#children", null); // golește nivelul 2
  });

  // dacă exista o valoare presetată, declanșează încărcarea
  if (select.value) {
    await renderSubcategories("#subcats", select.value);
  }
}

/* ========= Subcategorii (nivel 1) ========= */
/**
 * Redă lista de subcategorii pentru serviciu, ca „chips”.
 * Setează hidden-urile #subcat, #subcat_name, #subsub.
 */
export async function renderSubcategories(containerSelector, serviceName) {
  const cont = el(containerSelector);
  if (!cont) return;
  cont.innerHTML = "";

  // reset hidden
  __activeSubcatKey = null;
  __activeSubcatName = null;
  el("#subcat")?.setAttribute("value", "");
  el("#subcat_name")?.setAttribute("value", "");
  el("#subsub")?.setAttribute("value", "");

  if (!serviceName) {
    cont.textContent = "Alege un serviciu mai sus.";
    return;
  }

  // skeleton simplu
  cont.innerHTML = `<div class="skeleton" aria-hidden="true">Se încarcă…</div>`;

  try {
    const { subcategories: items } = await fetchJSON(
      "/.netlify/functions/taxonomy?mode=subcategories&service=" + encodeURIComponent(serviceName)
    );

    cont.innerHTML = "";
    if (!items?.length) {
      cont.textContent = "Nu există subcategorii pentru acest serviciu.";
      return;
    }

    items.forEach((it) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.title = it.name;
      btn.innerHTML = `
        <span>${it.name}</span>
        <span class="badge">${it.count || 0}</span>
      `;

      btn.addEventListener("click", async () => {
        // vizual activ
        cont.querySelectorAll(".chip").forEach(b => b.classList.remove("active", "blue"));
        btn.classList.add("active", "blue");

        // setează hidden-urile L1
        __activeSubcatKey = (it.id != null) ? Number(it.id) : it.name;
        __activeSubcatName = it.name || "";
        el("#subcat")?.setAttribute("value", (it.id != null) ? String(it.id) : "");
        el("#subcat_name")?.setAttribute("value", __activeSubcatName);

        // goliți copilul implicit
        el("#subsub")?.setAttribute("value", "");

        // încarcă nivelul 2
        await renderChildren("#children", __activeSubcatKey);
      });

      cont.appendChild(btn);
    });
  } catch (e) {
    console.error(e);
    cont.textContent = "Eroare la încărcarea subcategoriilor.";
  }
}

/* ========= Copii (nivel 2) ========= */
/**
 * Redă copiii (nivel 2) sub formă de checkbox-uri. Suportă multi-select.
 * Sincronizează hidden #subsub (primul copil selectat) și afișează hint „minim unu” (dacă există #min1-hint).
 * subcatKey poate fi id numeric sau nume (fallback).
 */
export async function renderChildren(containerSelector, subcatKey) {
  const cont = el(containerSelector);
  if (!cont) return;
  cont.innerHTML = "";

  if (!subcatKey) { cont.textContent = "Alege o subcategorie."; return; }

  // skeleton simplu
  cont.innerHTML = `<div class="skeleton" aria-hidden="true">Se încarcă…</div>`;

  try {
    const param = encodeURIComponent(String(subcatKey));
    const { children: items } = await fetchJSON(
      "/.netlify/functions/taxonomy?mode=children&subcat=" + param
    );

    cont.innerHTML = "";
    if (!items?.length) {
      cont.textContent = "Nu există elemente pe nivelul următor.";
      return;
    }

    // Set de selecții curente pentru acest subcat
    const subKey = subcatKey;
    let set = window.__sel.bySub.get(subKey);
    if (!set) { set = new Set(); window.__sel.bySub.set(subKey, set); }

    items.forEach((it) => {
      const idVal = (it.id != null) ? String(it.id) : String(it.name);
      const safeId = idVal.replace(/[^a-z0-9_\-]/gi, "_");
      const inputId = `kid_${(typeof subKey === "number" ? subKey : 'n')}_${safeId}`;

      const lab = document.createElement("label");
      lab.className = "child-item";
      lab.setAttribute("for", inputId);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = inputId;
      cb.value = idVal;
      cb.checked = set.has(idVal);
      if (cb.checked) lab.classList.add("on");

      cb.addEventListener("change", () => {
        if (cb.checked) set.add(idVal); else set.delete(idVal);
        if (set.size === 0) window.__sel.bySub.delete(subKey);
        lab.classList.toggle("on", cb.checked);

        // setează primul copil selectat în hidden #subsub (compat)
        const firstKid = Array.from(window.__sel.bySub.values()).flatMap(s => Array.from(s))[0];
        el("#subsub")?.setAttribute("value", firstKid ? String(firstKid) : "");

        // ascunde/afișează hintul „minim unul”
        const hasAny = Array.from(window.__sel.bySub.values()).some(s => s.size > 0);
        const hint = el("#min1-hint");
        if (hint) hint.style.display = hasAny ? "none" : "";
      });

      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(it.name + (it.count ? ` (${it.count})` : "")));
      cont.appendChild(lab);
    });
  } catch (e) {
    console.error(e);
    cont.textContent = "Eroare la încărcarea sub-subcategoriilor.";
  }
}

/* ========= Opțional: helper pentru focus/scroll la activ ========= */
export function scrollActiveIntoView(containerSel){
  const c = el(containerSel);
  if (!c) return;
  const a = c.querySelector(".active");
  if (a) a.scrollIntoView({ block: "nearest", behavior: "smooth" });
}