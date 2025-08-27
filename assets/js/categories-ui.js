// assets/js/categories-ui.js  (cascader 2 coloane)
// DEPENDINȚE UI: se bazează pe CSS-ul din offer.css și pe id-urile #subcats / #children

// utilitar mic
async function fetchJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// Populează dropdown-ul de servicii (categorii) deja existent în formularul de înscriere
export async function initServiceSelect(selectSelector = "#service_name") {
  const select = document.querySelector(selectSelector);
  if (!select) return;

  // servicii pentru înscriere (lists?mode=signup) – exact ca pagina ta
  try {
    const res = await fetch("/.netlify/functions/lists?mode=signup", { cache: "no-store" });
    const { services = [] } = await res.json();

    select.innerHTML = '<option value="">Alege serviciul</option>';
    (services || []).forEach(s => {
      // în /lists?mode=signup ai { name, label }
      const opt = document.createElement("option");
      opt.value = s.name;             // exact numele din DB (valoarea folosită de backend)
      opt.textContent = s.label || s.name;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error("Nu pot încărca serviciile:", e);
  }

  // când se schimbă categoria -> încarcă subcategoriile
  select.addEventListener("change", async () => {
    const serviceName = select.value || "";
    await renderSubcategories("#subcats", serviceName);
    await renderChildren("#children", null); // golește nivelul 2
  });

  // dacă aveai o valoare presetată, declanșează încărcarea
  if (select.value) {
    await renderSubcategories("#subcats", select.value);
  }
}

/** Reține ce subcategorie e activă (pentru highlight + reîncărcări) */
let __activeSubcatId = null;
let __activeSubcatName = null;

// Încarcă subcategoriile (nivel 1) după numele serviciului
export async function renderSubcategories(containerSelector, serviceName) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  __activeSubcatId = null;
  __activeSubcatName = null;
  document.getElementById("subcat")?.setAttribute("value", "");
  document.getElementById("subcat_name")?.setAttribute("value", "");
  document.getElementById("subsub")?.setAttribute("value", "");

  if (!serviceName) {
    el.textContent = "Alege un serviciu mai sus.";
    return;
  }

  const { subcategories: items } = await fetchJSON(
    "/.netlify/functions/taxonomy?mode=subcategories&service=" + encodeURIComponent(serviceName)
  );

  if (!items?.length) {
    el.textContent = "Nu există subcategorii pentru acest serviciu.";
    return;
  }

  // Randare: listă verticală de “chips”
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
      // marchează activ
      el.querySelectorAll(".chip").forEach(b => b.classList.remove("active", "blue"));
      btn.classList.add("active", "blue");

      // setează hidden-urile L1
      __activeSubcatId = (it.id != null) ? Number(it.id) : null;
      __activeSubcatName = it.name;
      document.getElementById("subcat")?.setAttribute("value", __activeSubcatId ? String(__activeSubcatId) : "");
      document.getElementById("subcat_name")?.setAttribute("value", __activeSubcatName || "");

      // goleşte primul copil implicit
      document.getElementById("subsub")?.setAttribute("value", "");

      // încarcă nivelul 2 în coloana din dreapta
      await renderChildren("#children", __activeSubcatId ?? __activeSubcatName);
    });

    el.appendChild(btn);
  });
}

// Încarcă copiii (nivel 2) pentru subcategoria aleasă (id numeric sau nume – suportă fallback)
export async function renderChildren(containerSelector, subcatKey) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  if (!subcatKey) { el.textContent = "Alege o subcategorie în stânga."; return; }

  const param = encodeURIComponent(String(subcatKey));
  const { children: items } = await fetchJSON(
    "/.netlify/functions/taxonomy?mode=children&subcat=" + param
  );

  if (!items?.length) {
    el.textContent = "Nu există elemente pe nivelul următor.";
    return;
  }

  // pentru selecții multiple vom păstra într-un Set pe subcategorie
  if (!window.__sel) window.__sel = { bySub: new Map() };
  const set = window.__sel.bySub.get(__activeSubcatId ?? __activeSubcatName) || new Set();

  items.forEach((it) => {
    const idVal = (it.id != null) ? String(it.id) : String(it.name);
    const inputId = `kid_${(__activeSubcatId ?? 'n')}_${idVal.replace(/[^a-z0-9_\-]/gi,'_')}`;

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
      let cur = window.__sel.bySub.get(__activeSubcatId ?? __activeSubcatName);
      if (!cur) { cur = new Set(); window.__sel.bySub.set(__activeSubcatId ?? __activeSubcatName, cur); }

      if (cb.checked) cur.add(idVal); else cur.delete(idVal);
      if (cur.size === 0) window.__sel.bySub.delete(__activeSubcatId ?? __activeSubcatName);

      lab.classList.toggle("on", cb.checked);

      // setează primul copil selectat în hidden #subsub (compat)
      const firstKid = Array.from(window.__sel.bySub.values()).flatMap(s=>Array.from(s))[0];
      document.getElementById("subsub")?.setAttribute("value", firstKid ? String(firstKid) : "");

      // ascunde/afișează hintul „minim unul”
      const hasAny = Array.from(window.__sel.bySub.values()).some(s=>s.size>0);
      document.getElementById("min1-hint").style.display = hasAny ? "none" : "";
    });

    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(it.name + (it.count ? ` (${it.count})` : "")));
    el.appendChild(lab);
  });
}

// helper opțional pentru focus/scroll la elementul activ
function scrollActiveIntoView(containerSel){
  const c = document.querySelector(containerSel);
  if (!c) return;
  const a = c.querySelector(".active");
  if (a) a.scrollIntoView({ block:"nearest", behavior:"smooth" });
}