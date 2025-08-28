// assets/js/categories-ui.js
// Helperi de UI pentru selectarea Serviciu → Subcategorie → Copii
// Folosește funcțiile Netlify existente:
//  - /.netlify/functions/lists?mode=categories&judet=&oras=
//  - /.netlify/functions/taxonomy?mode=subcategories&service=&judet=&oras=
//  - /.netlify/functions/taxonomy?mode=children&subcat=  (id SAU nume)

export async function initServiceSelect(
  selectSelector = "#serviceSelect",
  { judet = "", oras = "", onChange = null } = {}
) {
  const sel = document.querySelector(selectSelector);
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Se încarcă...</option>`;

  try {
    // ia serviciile disponibile pentru (judet, oras) – dacă nu trimiți filtre, ia globale
    const url = new URL("/.netlify/functions/lists", location.origin);
    url.searchParams.set("mode", "categories");
    if (judet) url.searchParams.set("judet", judet);
    if (oras)  url.searchParams.set("oras",  oras);

    const { services = [] } = await fetchJSON(url.toString());

    sel.innerHTML = `<option value="">Alege serviciul...</option>`;
    (services || []).forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });

    sel.disabled = false;

    sel.addEventListener("change", async () => {
      const serviceName = sel.value || "";
      // goliți zonele dependente (dacă există în pagină)
      const subsBox = document.querySelector("#subcats");
      const kidsBox = document.querySelector("#children");
      if (subsBox) subsBox.innerHTML = "";
      if (kidsBox) kidsBox.innerHTML = "";

      if (typeof onChange === "function") onChange(serviceName);
    });
  } catch (e) {
    console.error("initServiceSelect error:", e);
    sel.innerHTML = `<option value="">Eroare încărcare servicii</option>`;
  }
}

/**
 * Randează subcategoriile ca „chips”.
 * containerSelector: elementul unde apar butoanele
 * serviceName: numele categoriei selectate
 * options:
 *   - judet, oras (filtrare pentru numărări / context)
 *   - onSelect(idSauNume) – se apelează când utilizatorul alege o subcategorie
 *   - activeId (numeric) – marchează chip-ul ca selectat
 */
export async function renderSubcategories(
  containerSelector,
  serviceName,
  { judet = "", oras = "", onSelect = null, activeId = null } = {}
) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  if (!serviceName) {
    el.textContent = "Alege mai întâi un serviciu.";
    return;
  }

  try {
    const url = new URL("/.netlify/functions/taxonomy", location.origin);
    url.searchParams.set("mode", "subcategories");
    url.searchParams.set("service", serviceName);
    if (judet) url.searchParams.set("judet", judet);
    if (oras)  url.searchParams.set("oras",  oras);

    const { subcategories = [] } = await fetchJSON(url.toString());

    if (!subcategories.length) {
      el.textContent = "Nu există subcategorii pentru această categorie.";
      return;
    }

    el.classList.add("service-list");
    subcategories.forEach(sc => {
      // sc: { id (poate fi null), name, count? }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "service-chip";
      b.textContent = sc.name + (sc.count ? ` (${sc.count})` : "");
      if (activeId != null && String(activeId) === String(sc.id)) {
        b.classList.add("active");
      }
      b.addEventListener("click", () => {
        el.querySelectorAll(".service-chip").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        if (typeof onSelect === "function") {
          // Trimitem prioritar id-ul; dacă e null, trimitem numele (fallback)
          onSelect(sc.id ?? sc.name);
        }
      });
      el.appendChild(b);
    });
  } catch (e) {
    console.error("renderSubcategories error:", e);
    el.textContent = "Eroare la încărcarea subcategoriilor.";
  }
}

/**
 * Randează copiii (nivelul 3) pentru o subcategorie (id sau nume).
 * containerSelector: elementul unde apar butoanele
 * subcat: poate fi numeric (id) sau string (nume)
 * options:
 *   - judet, oras (nu sunt folosite în endpoint-ul children, dar le păstrăm pentru paritate)
 *   - onToggle(item) – se apelează la click; poți decide single/multi select în pagina ta
 *   - selected (Set sau Array de id/nume) – marchează cele bifate
 */
export async function renderChildren(
  containerSelector,
  subcat,
  { judet = "", oras = "", onToggle = null, selected = [] } = {}
) {
  const el = document.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = "";

  if (!subcat) {
    el.textContent = "";
    return;
  }

  const selSet = toSet(selected);

  try {
    const url = new URL("/.netlify/functions/taxonomy", location.origin);
    url.searchParams.set("mode", "children");
    url.searchParams.set("subcat", String(subcat));

    const { children = [] } = await fetchJSON(url.toString());
    if (!children.length) {
      el.textContent = "Nu există sub-subcategorii.";
      return;
    }

    el.classList.add("service-list");
    children.forEach(kid => {
      // kid: { id (poate fi null), name, count? }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "service-chip";
      b.textContent = kid.name + (kid.count ? ` (${kid.count})` : "");

      const key = kid.id ?? kid.name;
      if (selSet.has(String(key))) b.classList.add("active");

      b.addEventListener("click", () => {
        b.classList.toggle("active");
        if (typeof onToggle === "function") {
          onToggle(kid);
        }
      });

      el.appendChild(b);
    });
  } catch (e) {
    console.error("renderChildren error:", e);
    el.textContent = "Eroare la încărcarea sub-subcategoriilor.";
  }
}

/* ---------- Utils ---------- */
async function fetchJSON(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText} – ${txt}`);
  }
  return r.json();
}
function toSet(v) {
  if (!v) return new Set();
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v.map(x => String(x)));
  return new Set([String(v)]);
}