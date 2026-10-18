const config = window.SUPABASE_CONFIG || {};
const endpoint = String(config.url || "").replace(/\/$/, "");
const authStorageKey = "sb-uzivivmrixstxjvzkksz-auth-token";

function sessionToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(authStorageKey) || "null");
    return saved?.access_token || saved?.currentSession?.access_token || "";
  } catch { return ""; }
}

async function managerRequest(path, options = {}) {
  const token = sessionToken();
  if (!token || !endpoint || !config.publishableKey) throw new Error("manager_session_missing");
  return fetch(endpoint + path, {
    ...options,
    headers: {
      apikey: config.publishableKey,
      Authorization: "Bearer " + token,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
}

async function isManager() {
  try {
    const response = await managerRequest("/rest/v1/rpc/crm_is_manager", { method: "POST" });
    return response.ok && (await response.json()) === true;
  } catch { return false; }
}

function makePage() {
  if (document.getElementById("ybaPublicResultsPage")) return;
  const page = document.createElement("section");
  page.id = "ybaPublicResultsPage";
  page.className = "page";
  const heading = document.createElement("div");
  heading.className = "page-heading";
  heading.innerHTML = '<div><p class="eyebrow">YOSH BLOGERLAR AKADEMIYASI</p><h1>Bolalar tanishuvi natijalari</h1><p class="subtle">Faqat ota-ona yoki qonuniy vakil rozilik bergan natijalar.</p></div>';
  const refresh = document.createElement("button");
  refresh.className = "button secondary";
  refresh.textContent = "Yangilash";
  refresh.onclick = renderResults;
  heading.appendChild(refresh);
  const list = document.createElement("div");
  list.id = "ybaPublicResultsList";
  list.className = "crm-list";
  list.textContent = "Rozilik bilan yuborilgan natijalar hozircha yo‘q.";
  page.append(heading, list);
  document.getElementById("workspace")?.appendChild(page);
}

function makeNav() {
  const nav = document.querySelector(".side-nav");
  if (!nav || document.getElementById("ybaPublicResultsNav")) return;
  const button = document.createElement("button");
  button.id = "ybaPublicResultsNav";
  button.className = "nav-item";
  button.innerHTML = '<span class="nav-icon">👧</span><span>Bolalar tanishuvi</span>';
  button.onclick = async () => {
    if (!(await isManager())) { button.remove(); document.getElementById("ybaPublicResultsPage")?.remove(); return; }
    makePage();
    document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
    document.querySelectorAll("[data-view]").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("ybaPublicResultsPage").classList.add("active");
    await renderResults();
  };
  const anchor = document.getElementById("newCustomTab");
  if (anchor?.parentNode === nav) nav.insertBefore(button, anchor);
  else nav.appendChild(button);
}

function addText(parent, label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("b");
  strong.textContent = label + ": ";
  row.append(strong, document.createTextNode(value || "—"));
  parent.appendChild(row);
}

async function renderResults() {
  const list = document.getElementById("ybaPublicResultsList");
  if (!list || !(await isManager())) { list && (list.textContent = "Rahbar ruxsati topilmadi."); return; }
  list.textContent = "Yuklanmoqda…";
  try {
    const response = await managerRequest("/rest/v1/yba_public_intro_results?select=id,child_name,age_group,interests,blog_styles,progress,consent_at,created_at&order=created_at.desc&limit=300");
    if (!response.ok) throw new Error("read_failed");
    const rows = await response.json();
    list.replaceChildren();
    if (!rows.length) { list.textContent = "Rozilik bilan yuborilgan natijalar hozircha yo‘q."; return; }
    for (const item of rows) {
      const card = document.createElement("article"); card.className = "crm-card";
      const body = document.createElement("div"); body.className = "crm-card-main";
      const title = document.createElement("h2"); title.textContent = item.child_name || "Ism ko‘rsatilmagan"; body.appendChild(title);
      addText(body, "Yosh guruhi", item.age_group === "7-10" ? "7–10" : "11–14");
      addText(body, "Qiziqishlar", (item.interests || []).join(", "));
      addText(body, "Yoqtirgan videolari", (item.blog_styles || []).join(", "));
      addText(body, "Tanishuv", String(item.progress || 0) + "/4 xona");
      addText(body, "Rozilik berilgan", item.consent_at ? new Date(item.consent_at).toLocaleString("uz-UZ") : "—");
      card.appendChild(body); list.appendChild(card);
    }
  } catch { list.textContent = "Natijalarni yuklab bo‘lmadi. Bo‘lim yoki ruxsat hali ulanmagan bo‘lishi mumkin."; }
}

let checks = 0;
const timer = setInterval(async () => {
  checks++;
  if (sessionToken()) {
    clearInterval(timer);
    if (await isManager()) { makePage(); makeNav(); }
  }
  if (checks >= 30) clearInterval(timer);
}, 1000);

