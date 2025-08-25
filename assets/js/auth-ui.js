// assets/js/auth-ui.js
const emailInput = document.querySelector("#email");
const phoneInput = document.querySelector("#phone");
const otpBtn = document.querySelector("#btnSendOtp");
const submitBtn = document.querySelector("#btnSubmit");

let phoneVerified = false;
let otpToken = null;

function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function refreshSubmitState() {
  const emailOk = validEmail(emailInput?.value || "");
  if (submitBtn) submitBtn.disabled = !(emailOk && phoneVerified);
}

emailInput?.addEventListener("input", refreshSubmitState);

// --- helper pentru normalizare număr ---
function normalizePhone(raw) {
  let v = (raw || "").trim();
  if (!v) return v;

  // dacă începe cu 0 (ex. 07...), îl transformăm în +40...
  if (/^0\d{8,}$/.test(v)) {
    v = "+40" + v.substring(1);
  }

  // dacă nu începe cu +, prefixăm + în față
  if (!v.startsWith("+")) {
    v = "+" + v;
  }
  return v;
}

otpBtn?.addEventListener("click", async () => {
  let phone = normalizePhone(phoneInput?.value || "");
  if (!phone) { alert("Introdu numărul de telefon"); return; }

  try {
    const r = await fetch("/api/otp_start", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ phone })
    }).then(r=>r.json());

    if (!r?.ok) { alert(r?.error || "Eroare la trimiterea codului"); return; }

    const code = prompt("Introdu codul primit prin SMS:");
    if (!code) return;

    const v = await fetch("/api/otp_verify", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ phone, code })
    }).then(r=>r.json());

    phoneVerified = !!v?.ok;
    otpToken = v?.otpToken || null;
    if (otpToken) localStorage.setItem("_va_otp", otpToken);
    if (!phoneVerified) { alert("Cod invalid"); }
    refreshSubmitState();
  } catch (e) {
    alert("Eroare rețea");
  }
});

// expune pentru alte scripturi
window.__getOtpToken = () => otpToken || localStorage.getItem("_va_otp") || null;

// inițial, butonul e dezactivat
refreshSubmitState();
