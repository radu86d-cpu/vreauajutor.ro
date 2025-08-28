// assets/js/ofera-servicii.js
// Logica paginii „Oferă servicii”: populare select-uri, OTP, submit provider.

import { initServiceSelect, renderSubcategories, renderChildren } from "./categories-ui.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  serviceName: "",
  subcatChosen: null,  // poate fi id (nr) sau nume (string)
  childrenChosen: new Set(), // set de id/nume
  otpOk: false,
  otpSessionToken: null
};

function toast(msg) {
  const el = $("#formMsg");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = msg.toLowerCase().includes("eroare") ? "error" : "success";
}

// ------- populate județe/orase pentru flux signup (din lists?mode=signup) ------
async function loadJudete() {
  const r = await fetch("/.netlify/functions/lists?mode=signup");
  const { judete = [] } = await r.json().catch(() => ({}));
  const sel = $("#judet");
  sel.innerHTML = `<option value="">Alege județul</option>`;
  judete.forEach(j => sel.appendChild(new Option(j, j)));
}
async function loadOrase(judet) {
  const r = await fetch("/.netlify/functions/lists?mode=signup&judet=" + encodeURIComponent(judet));
  const { orase = [] } = await r.json().catch(() => ({}));
  const sel = $("#oras");
  sel.innerHTML = `<option value="">Alege orașul</option>`;
  orase.forEach(o => sel.appendChild(new Option(o, o)));
}

// ---------------- OTP (Twilio Verify) ----------------
async function otpStart() {
  const raw = ($("#phone").value || "").trim();
  if (!raw) return toast("Te rog completează numărul de telefon.");
  let phone = raw;
  if (phone.startsWith("0")) phone = "+4" + phone; // mic ajutor RO
  if (!/^\+?[1-9]\d{7,14}$/.test(phone)) return toast("Telefon invalid.");

  const r = await fetch("/.netlify/functions/otp_start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return toast("Eroare OTP: " + (j.error || r.statusText));
  toast("Cod trimis. Verifică SMS-ul.");
}

async function otpVerify() {
  const raw = ($("#phone").value || "").trim();
  let phone = raw.startsWith("0") ? "+4" + raw : raw;
  const code = ($("#otp").value || "").trim();
  if (!phone || !code) return toast("Completează telefon + cod.");

  const r = await fetch("/.netlify/functions/otp_verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok || !j.otp_session) {
    state.otpOk = false;
    state.otpSessionToken = null;
    return toast("Eroare verificare OTP.");
  }
  state.otpOk = true;
  state.otpSessionToken = j.otp_session; // token semnat pe server
  toast("Telefon verificat ✓");
}

// ---------------- Submit provider ----------------
async function onSubmit(e) {
  e.preventDefault();

  const company_name = ($("#company").value || "").trim();
  const service_name = state.serviceName || "";
  const judet        = ($("#judet").value || "").trim();
  const oras         = ($("#oras").value || "").trim();
  const phoneRaw     = ($("#phone").value || "").trim();
  const email        = ($("#email").value || "").trim();
  const description  = ($("#descriere").value || "").trim();

  if (!company_name || !service_name || !judet || !oras) {
    return toast("Completează câmpurile obligatorii marcate cu *.");
  }
  if (!state.otpOk || !state.otpSessionToken) {
    return toast("Verifică telefonul înainte de trimitere.");
  }

  // pregătim sub/subsub (dacă ai nevoie să le trimiți)
  // din UI: state.subcatChosen + state.childrenChosen
  const payload = {
    company_name,
    service_name,
    judet,
    oras,
    phone: phoneRaw,
    email,
    description,
    subcat: state.subcatChosen,
    subsubs: Array.from(state.childrenChosen)
  };

  const r = await fetch("/.netlify/functions/register_provider", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // e necesar tokenul de la supabase client pentru autentificarea userului logat
      // dacă ai inițializat supabase în `window.supa`, îl poți atașa:
      ...(window?.supaToken
        ? { Authorization: "Bearer " + window.supaToken }
        : {})
    },
    body: JSON.stringify(payload)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) {
    return toast("Eroare salvare: " + (j.error || r.statusText));
  }
  toast("Înregistrare reușită!");
  // redirect opțional către pagina furnizorului
}

// ---------------- boot UI ----------------
async function boot() {
  // init servicii
  await initServiceSelect("#serviceSelect", {
    onChange: async (name) => {
      state.serviceName = name;
      state.subcatChosen = null;
      state.childrenChosen.clear();
      // randează subcategoriile
      await renderSubcategories("#subcats", name, {
        onSelect: async (idOrName) => {
          state.subcatChosen = idOrName;
          state.childrenChosen.clear();
          await renderChildren("#children", idOrName, {
            selected: state.childrenChosen,
            onToggle: (kid) => {
              const key = kid.id ?? kid.name;
              if (state.childrenChosen.has(String(key))) {
                state.childrenChosen.delete(String(key));
              } else {
                state.childrenChosen.add(String(key));
              }
            }
          });
        }
      });
      // golește copii la schimbarea subcat
      $("#children").innerHTML = "";
    }
  });

  // județe/orase
  await loadJudete();
  $("#judet")?.addEventListener("change", (e) => {
    const v = e.target.value || "";
    $("#oras").innerHTML = `<option value="">Alege orașul</option>`;
    if (v) loadOrase(v);
  });

  // OTP
  $("#btnSendOtp")?.addEventListener("click", otpStart);
  $("#btnVerifyOtp")?.addEventListener("click", otpVerify);

  // submit
  $("#offerForm")?.addEventListener("submit", onSubmit);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}