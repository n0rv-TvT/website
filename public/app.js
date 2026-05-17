const revealItems = document.querySelectorAll(".reveal");
const siteHeader = document.querySelector(".site-header");

if (siteHeader) {
  const updateHeaderState = () => siteHeader.classList.toggle("is-scrolled", window.scrollY > 12);
  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", () => {
    const navToggle = document.querySelector("#nav-toggle");
    if (navToggle) navToggle.checked = false;
  });
});

const quoteForm = document.querySelector("[data-quote-form]");
let turnstileWidgetId = null;

initTurnstile();
initContactPopup();
initAdminDashboard();

if (quoteForm) {
  const status = quoteForm.querySelector("[data-form-status]");
  const submitButton = quoteForm.querySelector("button[type='submit']");

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!quoteForm.checkValidity()) {
      quoteForm.reportValidity();
      return;
    }

    const formData = new FormData(quoteForm);
    const payload = Object.fromEntries(formData.entries());

    status.textContent = "Sending your quote request...";
    status.className = "form-status";
    quoteForm.setAttribute("aria-busy", "true");
    submitButton.disabled = true;
    submitButton.setAttribute("disabled", "");
    submitButton.dataset.originalText = submitButton.textContent;
    submitButton.classList.add("is-loading");
    submitButton.textContent = "Sending";

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to submit quote request.");
      }

      quoteForm.reset();
      resetTurnstile();
      status.textContent = "Request received. We will follow up shortly.";
      status.classList.add("is-success");
    } catch (error) {
      status.textContent = error.message || "Something went wrong. Please call us instead.";
      status.classList.add("is-error");
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute("disabled");
      submitButton.classList.remove("is-loading");
      submitButton.textContent = submitButton.dataset.originalText || "Submit Quote Request";
      quoteForm.removeAttribute("aria-busy");
    }
  });
}

async function initTurnstile() {
  const widget = document.querySelector("[data-turnstile-widget]");
  const tokenField = document.querySelector("[data-turnstile-token]");
  if (!widget || !tokenField) return;

  try {
    const response = await fetch("/api/config");
    const config = await response.json();

    if (!config.turnstileSiteKey) {
      widget.hidden = true;
      return;
    }

    await loadTurnstile();
    widget.hidden = false;
    turnstileWidgetId = window.turnstile.render(widget, {
      sitekey: config.turnstileSiteKey,
      callback: (token) => {
        tokenField.value = token;
      },
      "expired-callback": () => {
        tokenField.value = "";
      },
      "error-callback": () => {
        tokenField.value = "";
      },
    });
  } catch (error) {
    console.warn("Turnstile unavailable", error);
    widget.hidden = true;
  }
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector("script[data-turnstile]");
    if (existingScript) {
      existingScript.addEventListener("load", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });
}

function resetTurnstile() {
  const tokenField = document.querySelector("[data-turnstile-token]");
  if (tokenField) tokenField.value = "";
  if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
}

function initContactPopup() {
  const contactLinks = document.querySelectorAll('a[href="index.html#contact"], a[href="#contact"]');
  if (!contactLinks.length) return;

  const modal = document.createElement("div");
  modal.className = "contact-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-popup-title" tabindex="-1">
      <button class="contact-close" type="button" aria-label="Close contact popup">Close</button>
      <p class="eyebrow">Contact U&amp;U Movers</p>
      <h2 id="contact-popup-title">Need help with a move?</h2>
      <p class="contact-dialog-copy">Call now or request a free estimate online. We serve Illinois and the Chicagoland area from Northbrook.</p>
      <div class="contact-dialog-actions">
        <a class="btn btn-primary btn-large" href="tel:+18478493939">Call (847) 849-3939</a>
        <a class="btn btn-secondary btn-large" href="index.html#quote">Request Free Estimate</a>
      </div>
      <div class="contact-dialog-grid">
        <article>
          <span>Phone</span>
          <strong>(847) 849-3939</strong>
        </article>
        <article>
          <span>Address</span>
          <strong>3856 S Parkway Dr<br />Northbrook, IL 60062</strong>
        </article>
        <article>
          <span>Service area</span>
          <strong>Illinois &amp; Chicagoland</strong>
        </article>
        <article>
          <span>Coverage</span>
          <strong>Fully insured</strong>
        </article>
      </div>
      <a class="contact-map-link" href="https://www.google.com/maps/search/?api=1&amp;query=3856%20S%20Parkway%20Dr%20Northbrook%20IL%2060062">Open address in Google Maps</a>
    </section>
  `;
  document.body.append(modal);

  const dialog = modal.querySelector(".contact-dialog");
  const closeButton = modal.querySelector(".contact-close");
  let previousFocus = null;

  contactLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const navToggle = document.querySelector("#nav-toggle");
      if (navToggle) navToggle.checked = false;
      openContactPopup();
    });
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeContactPopup();
  });

  closeButton.addEventListener("click", closeContactPopup);

  modal.querySelector('a[href="index.html#quote"]').addEventListener("click", () => {
    closeContactPopup();
    if (window.location.pathname.endsWith("/") || window.location.pathname.endsWith("/index.html")) {
      requestAnimationFrame(() => document.querySelector("#quote")?.scrollIntoView({ behavior: "smooth" }));
    }
  });

  function openContactPopup() {
    previousFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("contact-popup-open");
    document.addEventListener("keydown", handleContactKeydown);
    requestAnimationFrame(() => dialog.focus());
  }

  function closeContactPopup() {
    modal.hidden = true;
    document.body.classList.remove("contact-popup-open");
    document.removeEventListener("keydown", handleContactKeydown);
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  }

  function handleContactKeydown(event) {
    if (event.key === "Escape") closeContactPopup();
  }
}

function initAdminDashboard() {
  const dashboard = document.querySelector("[data-admin-dashboard]");
  if (!dashboard) return;

  const loginModal = dashboard.querySelector("[data-admin-modal]");
  const adminContent = dashboard.querySelector("[data-admin-content]");
  const loginForm = dashboard.querySelector("[data-admin-login-form]");
  const usernameInput = dashboard.querySelector("[data-admin-username]");
  const passwordInput = dashboard.querySelector("[data-admin-password]");
  const loginStatus = dashboard.querySelector("[data-admin-login-status]");
  const status = dashboard.querySelector("[data-admin-status]");
  const tableBody = dashboard.querySelector("[data-admin-table-body]");
  const refreshButton = dashboard.querySelector("[data-admin-refresh]");
  const exportButton = dashboard.querySelector("[data-admin-export]");
  const logoutButton = dashboard.querySelector("[data-admin-logout]");
  const totalStat = dashboard.querySelector("[data-admin-total]");
  const latestStat = dashboard.querySelector("[data-admin-latest]");
  const notifiedStat = dashboard.querySelector("[data-admin-notified]");
  const loginButton = loginForm.querySelector("button[type='submit']");
  let latestQuotes = [];
  let adminCredentials = null;

  usernameInput.value = localStorage.getItem("uuAdminUsername") || "admin";
  updateAdminSummary(latestQuotes, { totalStat, latestStat, notifiedStat });
  exportButton.disabled = true;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }

    const credentials = {
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    };

    loginStatus.textContent = "Checking credentials...";
    loginStatus.className = "admin-status";
    setButtonLoading(loginButton, true, "Checking");

    try {
      await loadQuotes(credentials);
      adminCredentials = credentials;
      localStorage.setItem("uuAdminUsername", credentials.username);
      passwordInput.value = "";
      showDashboard();
      loginStatus.textContent = "";
    } catch (error) {
      adminCredentials = null;
      loginStatus.textContent = error.message || "Unable to sign in.";
      loginStatus.className = "admin-status is-error";
    } finally {
      setButtonLoading(loginButton, false);
    }
  });

  refreshButton.addEventListener("click", async () => {
    if (!adminCredentials) {
      showLogin("Sign in again to refresh quote requests.");
      return;
    }

    try {
      await loadQuotes(adminCredentials);
    } catch (error) {
      adminCredentials = null;
      showLogin(error.message || "Sign in again to continue.", true);
    }
  });

  exportButton.addEventListener("click", () => {
    if (!latestQuotes.length) {
      status.textContent = "No quote requests to export.";
      return;
    }

    exportQuotes(latestQuotes);
    status.textContent = "CSV export downloaded.";
    status.className = "admin-status is-success";
  });

  logoutButton.addEventListener("click", () => {
    adminCredentials = null;
    latestQuotes = [];
    renderQuotes(tableBody, latestQuotes);
    updateAdminSummary(latestQuotes, { totalStat, latestStat, notifiedStat });
    exportButton.disabled = true;
    showLogin("Logged out.", false);
  });

  requestAnimationFrame(() => usernameInput.focus());

  async function loadQuotes(credentials) {
    if (!credentials.username || !credentials.password) throw new Error("Enter both username and password.");

    status.textContent = "Loading quote requests...";
    status.className = "admin-status";
    setButtonLoading(refreshButton, true, "Refreshing");

    try {
      const response = await fetch("/api/quotes", {
        headers: { Authorization: buildBasicAuthHeader(credentials) },
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) throw new Error("Invalid admin credentials.");
      if (!response.ok || !result.success) throw new Error(result.error || "Unable to load quote requests.");

      latestQuotes = result.quotes || [];
      renderQuotes(tableBody, latestQuotes);
      updateAdminSummary(latestQuotes, { totalStat, latestStat, notifiedStat });
      exportButton.disabled = !latestQuotes.length;
      status.textContent = latestQuotes.length ? `Loaded ${latestQuotes.length} request(s).` : "No quote requests yet.";
      status.className = "admin-status is-success";
    } catch (error) {
      status.textContent = error.message || "Unable to load quote requests.";
      status.className = "admin-status is-error";
      throw error;
    } finally {
      setButtonLoading(refreshButton, false);
    }
  }

  function showDashboard() {
    loginModal.hidden = true;
    adminContent.hidden = false;
    adminContent.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
  }

  function showLogin(message, isError = true) {
    adminContent.hidden = true;
    loginModal.hidden = false;
    passwordInput.value = "";
    loginStatus.textContent = message || "";
    loginStatus.className = message && isError ? "admin-status is-error" : "admin-status";
    requestAnimationFrame(() => (usernameInput.value ? passwordInput : usernameInput).focus());
  }
}

function buildBasicAuthHeader(credentials) {
  return `Basic ${base64Utf8(`${credentials.username}:${credentials.password}`)}`;
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function setButtonLoading(button, isLoading, loadingText = "Loading") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  button.textContent = button.dataset.originalText || button.textContent;
}

function renderQuotes(tableBody, quotes) {
  tableBody.textContent = "";

  if (!quotes.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.textContent = "No quote requests to show.";
    row.append(cell);
    tableBody.append(row);
    return;
  }

  quotes.forEach((quote) => {
    const row = document.createElement("tr");
    [
      quote.id,
      quote.created_at,
      quote.name,
      quote.phone,
      quote.email || "",
      quote.move_type,
      `${quote.moving_from} -> ${quote.moving_to}`,
      quote.details,
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value || "");
      row.append(cell);
    });
    tableBody.append(row);
  });
}

function updateAdminSummary(quotes, elements) {
  if (elements.totalStat) elements.totalStat.textContent = String(quotes.length);
  if (elements.latestStat) elements.latestStat.textContent = quotes[0]?.created_at ? formatAdminDate(quotes[0].created_at) : "None";
  if (elements.notifiedStat) elements.notifiedStat.textContent = String(quotes.filter((quote) => quote.notification_sent).length);
}

function formatAdminDate(value) {
  const date = new Date(`${String(value).replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function exportQuotes(quotes) {
  if (!quotes.length) return;

  const headers = ["id", "created_at", "name", "phone", "email", "move_type", "moving_from", "moving_to", "moving_date", "move_size", "details"];
  const rows = quotes.map((quote) => headers.map((header) => csvEscape(quote[header] || "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `quote-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
