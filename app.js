import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { translateTree, restoreTree, startUzObserver, uzText } from "./uz-phrases.js?v=polish-20";

const config = window.SUPABASE_CONFIG || {};
const db = createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
const $ = (id) => document.getElementById(id);
const state = { user: null, crmRole: null, selectedCustomRecord: null, leads: [], orders: [], promos: [], shows: [], tabs: [], selectedLead: null, selectedOrder: null, ownerToken: "", leadAccess: false, manager: false, language: localStorage.getItem("crm-language") || "uz" };
const excelLeadsTabName = "Загрузка лидов через Excel";
const statuses = {
  new: "Yangi",
  contacted: "Bog‘lanildi",
  interview: "Suhbat",
  hired: "Ishga olindi",
  rejected: "Mos kelmadi"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
function initials(value) {
  const parts = String(value || "?").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "?").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}
function money(value) {
  return new Intl.NumberFormat("uz-UZ").format(Number(value) || 0) + " so‘m";
}
function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return pad(date.getDate()) + "." + pad(date.getMonth() + 1) + "." + date.getFullYear();
}
function excelLeadDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value >= 20000 && value <= 100000 && window.XLSX?.SSF?.parse_date_code) {
    const code = XLSX.SSF.parse_date_code(value);
    if (code) return new Date(Date.UTC(code.y, code.m - 1, code.d, code.H || 0, code.M || 0, code.S || 0)).toISOString();
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return text.length > 10 ? parsed.toISOString() : parsed.toISOString().slice(0, 10);
  }
  const numericDate = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (numericDate) {
    const first = Number(numericDate[1]), second = Number(numericDate[2]);
    let month = first, day = second;
    if (first > 12) { day = first; month = second; }
    let year = Number(numericDate[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(Date.UTC(year, month - 1, day, Number(numericDate[4] || 0), Number(numericDate[5] || 0), Number(numericDate[6] || 0)));
    return numericDate[4] ? date.toISOString() : date.toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
function trackExcelLeadSubmission(values, sourceTime) {
  if (!sourceTime) return;
  const hadHistory = Array.isArray(values.lead_submission_times);
  let times = hadHistory ? [...values.lead_submission_times] : (values.created_time ? [values.created_time] : []);
  const legacySameDay = !hadHistory && values.created_time && values.created_time.length === 10 && values.created_time.slice(0, 10) === sourceTime.slice(0, 10);
  if (legacySameDay) times = [sourceTime];
  else if (!times.includes(sourceTime)) times.push(sourceTime);
  if (!times.length) times = [sourceTime];
  times = [...new Set(times)].sort();
  values.lead_submission_times = times;
  values.submission_count = Math.max(Number(values.submission_count) || 1, times.length);
  values.created_time = times[0];
  values.latest_submission_time = times[times.length - 1];
}
function leadSubmissionCountText(count) {
  const n = Math.max(1, Number(count) || 1), lastTwo = n % 100, last = n % 10;
  const unit = last === 1 && lastTwo !== 11 ? "раз" : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "раза" : "раз";
  return n + " " + unit;
}
function excelLeadEditedBy() {
  const user = state.user || {};
  return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Администратор";
}
function excelLeadEditFields(fields) {
  const name = (fields || []).find((field) => field.name === "Имя") || { name: "Имя", type: "text" };
  const phone = (fields || []).find((field) => field.name === "Телефон") || { name: "Телефон", type: "phone" };
  return [name, phone, { name: "Результат последнего звонка", type: "textarea" }];
}
function dateTimeText(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function telegramHref(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = "998" + digits;
  return digits.length >= 8 && digits.length <= 15 ? "https://t.me/+" + digits : "";
}

function phoneHref(value) {
  return "tel:" + String(value || "").replace(/[^+\d]/g, "");
}
function showMessage(id, text, type) {
  const node = $(id);
  node.textContent = text || "";
  node.classList.toggle("hidden", !text);
  node.classList.toggle("error", type === "error");
  node.classList.toggle("success", type === "success");
}
function toast(text) {
  const node = $("toast");
  node.textContent = text;
  node.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add("hidden"), 2600);
}
function detailRow(label, value) {
  return '<div class="detail-row"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(value || "—") + "</b></div>";
}
function statusPill(status) {
  const key = statuses[status] ? status : "new";
  return '<span class="status ' + key + '">' + statuses[key] + "</span>";
}
// После обновления страницы (F5) возвращаем открытый раздел: запоминаем его в браузере.
const viewMemoryKey = "crm.lastView.v1";
const viewMemory = { ready: false, restored: false };
const rememberablePages = new Set(["bloggers", "hr", "shows", "autopilot", "dashboard", "script"]);
function saveView(view) {
  if (!viewMemory.ready) return;
  try { localStorage.setItem(viewMemoryKey, JSON.stringify(view)); } catch { /* память браузера недоступна */ }
}
function readSavedView() {
  try {
    const value = JSON.parse(localStorage.getItem(viewMemoryKey) || "null");
    return value && typeof value === "object" ? value : null;
  } catch { return null; }
}
function openSavedPanel(id, attempt = 0) {
  // Панели «Bolalar tanishuvi» и «Intellekt Lab» добавляются отдельными скриптами чуть позже.
  const button = document.getElementById(id);
  if (button) { button.click(); return; }
  if (attempt < 20) setTimeout(() => openSavedPanel(id, attempt + 1), 400);
}
async function restoreLastView() {
  if (viewMemory.restored) return;
  viewMemory.restored = true;
  try {
    const saved = readSavedView();
    if (saved?.type === "page" && rememberablePages.has(saved.page) && saved.page !== "bloggers") setPage(saved.page);
    else if (saved?.type === "tab") { const tab = state.tabs.find((item) => item.id === saved.id); if (tab) await showCustomTab(tab); }
    else if (saved?.type === "panel" && /^(ybaPublicResultsNav|intellektLabResultsNav)$/.test(String(saved.id))) openSavedPanel(saved.id);
  } finally { viewMemory.ready = true; }
}
document.addEventListener("click", (event) => {
  const panelButton = event.target.closest?.("#ybaPublicResultsNav, #intellektLabResultsNav");
  if (panelButton) saveView({ type: "panel", id: panelButton.id });
});
// Если выбран раздел из «Архива», держим архив раскрытым; сам по себе при входе он свёрнут.
function openArchiveIfActive() {
  if ($("navArchiveList").querySelector(".nav-item.active")) $("navArchive").open = true;
}
function setPage(page) {
  if (page === "dashboard" && !state.manager) { toast("Дашборд доступен только руководителю"); page = "bloggers"; }
  if (page === "hr" && !state.manager) { toast("HR-лиды доступны только руководителю"); page = "bloggers"; }
  const pageId = ({ bloggers: "homePage", hr: "leadsPage", shows: "ordersPage" })[page] || page + "Page";
  document.querySelectorAll(".page").forEach((node) => node.classList.toggle("active", node.id === pageId));
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
  openArchiveIfActive();
  saveView({ type: "page", page });
  if (page === "hr") renderLeads();
  if (page === "dashboard") renderDashboard();
  if (page === "script") renderScriptPage();
  if (page === "bloggers") renderPromos();
  if (page === "shows") renderShows();
  if (page === "autopilot") renderAutopilot();
}
function showLogin(message, error) {
  $("sidebar").classList.add("hidden");
  $("newCustomTabMobile").classList.add("hidden");
  $("topbar").classList.remove("hidden");
  $("mobileNav").classList.add("hidden");
  $("mobileLogoutBtn").classList.add("hidden");
  $("workspace").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  $("ownerPage").classList.add("hidden");
  if (message) showMessage("loginMessage", message, error ? "error" : "");
}
function showCRM() {
  $("sidebar").classList.remove("hidden");
  $("newCustomTabMobile").classList.remove("hidden");
  $("topbar").classList.remove("hidden");
  $("mobileNav").classList.remove("hidden");
  $("mobileLogoutBtn").classList.remove("hidden");
  $("loginView").classList.add("hidden");
  $("ownerPage").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  setPage("bloggers");
}
function leadSearchText(lead) {
  return [lead.full_name, lead.phone, lead.kirgili_answer, lead.study_answer, lead.availability, lead.crm_note, ...Object.values(lead.meta_answers || {})]
    .join(" ").toLowerCase();
}
function filteredLeads() {
  const query = $("leadSearch").value.trim().toLowerCase();
  const filter = $("leadFilter").value;
  return state.leads.filter((lead) => {
    const status = lead.pipeline_status || "new";
    return (filter === "all" || filter === status) && (!query || leadSearchText(lead).includes(query));
  });
}
function leadCard(lead, index, compact) {
  const answer = lead.availability || lead.kirgili_answer || "Ariza yuborgan";
  const sub = lead.phone || "Telefon kiritilmagan";
  if (compact) {
    return '<button class="mini-row lead-open" data-lead-index="' + index + '"><span class="mini-avatar">' + escapeHtml(initials(lead.full_name)) +
      '</span><span class="mini-main"><b>' + escapeHtml(lead.full_name || "Nomsiz nomzod") + '</b><small>' + escapeHtml(sub) +
      '</small></span>' + statusPill(lead.pipeline_status || "new") + "</button>";
  }
  return '<button class="lead-card lead-open" data-lead-index="' + index + '"><span class="lead-card-top"><span class="mini-avatar">' +
    escapeHtml(initials(lead.full_name)) + '</span><span class="lead-card-info"><span class="lead-card-name">' +
    escapeHtml(lead.full_name || "Nomsiz nomzod") + '</span><span class="lead-card-secondary">' + escapeHtml(sub) +
    '</span></span>' + statusPill(lead.pipeline_status || "new") + '</span><span class="lead-card-foot"><span class="lead-answer">' +
    escapeHtml(answer) + '</span><span class="lead-card-secondary">' + escapeHtml(dateText(lead.meta_created_at || lead.received_at)) +
    "</span></span></button>";
}
function orderCard(order, index, compact) {
  const signed = order.status === "signed";
  if (compact) {
    return '<button class="mini-row order-open" data-order-index="' + index + '"><span class="mini-avatar">▤</span><span class="mini-main"><b>' +
      escapeHtml(order.business_name || "Buyurtma") + '</b><small>' + escapeHtml(order.order_number || "") + " · " + money(order.total_amount) +
      '</small></span><span class="status ' + (signed ? "hired" : "interview") + '">' + (signed ? "Imzolangan" : "Kutilmoqda") + "</span></button>";
  }
  return '<button class="order-card order-open" data-order-index="' + index + '"><span class="order-card-top"><span class="mini-avatar">▤</span><span class="order-card-info"><span class="order-card-name">' +
    escapeHtml(order.business_name || "Buyurtma") + '</span><span class="order-card-secondary">' + escapeHtml(order.owner_name || "") +
    " · " + escapeHtml(order.order_number || "") + '</span></span><span class="status ' + (signed ? "hired" : "interview") + '">' +
    (signed ? "Imzolangan" : "Kutilmoqda") + '</span></span><span class="order-card-foot"><span class="order-amount">' +
    money(order.total_amount) + '</span><span class="order-card-secondary">' + escapeHtml(dateText(order.created_at)) + "</span></span></button>";
}
function renderHome() {
  $("leadCountNav").textContent = state.manager ? String(state.leads.length) : "";
  $("showCountNav").textContent = String(state.shows.length);
  document.querySelectorAll('[data-view="hr"],[data-view="dashboard"]').forEach((item) => item.classList.toggle("hidden", !state.manager));
}
function renderLeads() {
  if (!state.manager || !state.leadAccess) {
    $("leadsNotice").textContent = "HR-лиды доступны только руководителю.";
    $("leadsNotice").classList.remove("hidden");
    $("leadList").innerHTML = "";
    $("leadEmpty").classList.add("hidden");
    return;
  }
  $("leadsNotice").classList.add("hidden");
  const rows = filteredLeads();
  $("leadList").innerHTML = rows.map((lead) => leadCard(lead, state.leads.indexOf(lead), false)).join("");
  $("leadEmpty").classList.toggle("hidden", rows.length > 0);
  bindOpenButtons();
}
function renderOrders() {
  const query = $("orderSearch").value.trim().toLowerCase();
  const rows = state.orders.filter((order) => [order.business_name, order.owner_name, order.order_number].join(" ").toLowerCase().includes(query));
  $("orderList").innerHTML = rows.map((order) => orderCard(order, state.orders.indexOf(order), false)).join("");
  $("orderEmpty").classList.toggle("hidden", rows.length > 0);
  bindOpenButtons();
}
const promoDate = (row) => row.published_at || row.created_at;
const isFargonaTezkorPromo = (row) => [row.blogger?.username, row.blogger?.display_name, row.blogger?.instagram_url].some((value) => String(value || "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]+/g, " ").trim().includes("fargona tezkor"));
function sourcePromoCard(row) {
  const business = row.business || {}, blogger = row.blogger || {};
  const phone = String(business.phone || "").trim();
  return '<article class="source-record-card"><div class="source-record-header"><div><span class="source-record-kicker">БИЗНЕС</span><h3>' + escapeHtml(business.name || "Бизнес") + '</h3><p class="source-record-meta">' + escapeHtml(business.city || "Ферганская область") + (row.published_at ? ' · ' + escapeHtml(dateText(row.published_at)) : "") + '</p></div><div class="source-record-actions">' + '<a class="button primary" href="' + escapeHtml(row.permalink) + '" target="_blank" rel="noopener">Публикация ↗</a></div></div><div class="source-record-fields">' + (phone ? '<div class="source-record-field"><span>Телефон</span><a href="' + escapeHtml(phoneHref(phone)) + '">' + escapeHtml(phone) + '</a></div>' : '<div class="source-record-field"><span>Телефон</span><b class="muted-value">Не указан</b></div>') + '<div class="source-record-field"><span>Источник</span><b>' + escapeHtml(blogger.display_name || blogger.username || "Блогер") + '</b></div></div>' + (row.evidence ? '<div class="source-record-evidence"><span>ПОЧЕМУ СЧИТАЕМ РЕКЛАМОЙ</span><p>' + escapeHtml(row.evidence) + '</p></div>' : "") + '</article>';
}
function customSourceRecordCard(record, fields) {
  const entries = (fields || []).map((field) => [field.name, String(record.values?.[field.name] || "").trim()]).filter(([, value]) => value);
  const findEntry = (pattern) => entries.find(([name]) => pattern.test(name));
  const value = (pattern) => findEntry(pattern)?.[1] || "";
  const business = value(/бизнес|business|korxona/i) || "Бизнес";
  const phone = value(/телефон|phone|telefon/i);
  const instagram = value(/instagram|профиль/i);
  const city = value(/город|район|city|shahar/i);
  const publication = value(/ссылка.*(публикац|пост)|publication|permalink|post link/i);
  const date = value(/дата.*(публикац|пост)|publish.*date/i);
  const evidence = value(/подтверж|основан.*реклам|evidence|доказ/i);
  const consumed = new Set([business, phone, instagram, city, publication, date, evidence].filter(Boolean));
  const extras = entries.filter(([, item]) => !consumed.has(item)).map(([label, item]) => '<div class="source-record-field"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(item) + '</b></div>').join("");
  const profileAction = /^https?:\/\//i.test(instagram) ? '<a class="button secondary" href="' + escapeHtml(instagram) + '" target="_blank" rel="noopener">Instagram бизнеса ↗</a>' : "";
  const postAction = /^https?:\/\//i.test(publication) ? '<a class="button primary" href="' + escapeHtml(publication) + '" target="_blank" rel="noopener">Публикация ↗</a>' : "";
  return '<article class="source-record-card"><div class="source-record-header"><div><span class="source-record-kicker">БИЗНЕС</span><h3>' + escapeHtml(business) + '</h3><p class="source-record-meta">' + [city, date ? dateText(date) : ""].filter(Boolean).map(escapeHtml).join(" · ") + '</p></div><div class="source-record-actions">' + profileAction + postAction + '</div></div><div class="source-record-fields">' + (phone ? '<div class="source-record-field"><span>Телефон</span><a href="' + escapeHtml(phoneHref(phone)) + '">' + escapeHtml(phone) + '</a></div>' : '<div class="source-record-field"><span>Телефон</span><b class="muted-value">Не указан</b></div>') + (instagram && !profileAction ? '<div class="source-record-field"><span>Instagram бизнеса</span><b>' + escapeHtml(instagram) + '</b></div>' : "") + (extras ? extras : "") + '</div>' + (evidence ? '<div class="source-record-evidence"><span>ПОЧЕМУ СЧИТАЕМ РЕКЛАМОЙ</span><p>' + escapeHtml(evidence) + '</p></div>' : "") + '</article>';
}
function promoCard(row) { return sourcePromoCard(row); }
function promoSourceGroup(name, rows) {
  const profileUrl = rows[0]?.blogger?.instagram_url || "";
  return '<section class="promo-source-group"><div class="promo-source-heading"><div><p class="eyebrow">ИСТОЧНИК</p><h2>' + escapeHtml(name) + ' <span class="autopilot-count">' + rows.length + '</span></h2></div>' + (profileUrl ? '<a class="button secondary" href="' + escapeHtml(profileUrl) + '" target="_blank" rel="noopener">Профиль источника ↗</a>' : "") + '</div><div class="crm-list">' + rows.map(promoCard).join("") + '</div></section>';
}
function renderPromos() {
  const query = $("promoSearch").value.trim().toLowerCase(), sevenDays = Date.now() - 7 * 86400000;
  const rows = state.promos.filter((row) => {
    if (isFargonaTezkorPromo(row)) return false;
    const matchesPeriod = $("promoPeriod").value === "all" || (row.published_at && new Date(row.published_at).getTime() >= sevenDays);
    const haystack = [row.business?.name, row.business?.phone, row.business?.city, row.blogger?.display_name, row.blogger?.username, row.permalink, row.evidence].join(" ").toLowerCase();
    return matchesPeriod && (!query || haystack.includes(query));
  });
  const groups = new Map();
  rows.forEach((row) => {
    const name = row.blogger?.display_name || row.blogger?.username || "Источник не указан", key = row.blogger?.id || String(name).toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key).rows.push(row);
  });
  $("promoList").innerHTML = [...groups.values()].map((group) => promoSourceGroup(group.name, group.rows)).join("");
  $("promoEmpty").classList.toggle("hidden", rows.length > 0);
  document.querySelectorAll(".promo-review").forEach((select) => select.onchange = async () => {
    const result = await db.from("promo_observations").update({ review_status: select.value }).eq("id", select.dataset.id);
    if (result.error) { toast("Не удалось сохранить проверку"); return; }
    const row = state.promos.find((item) => item.id === select.dataset.id); if (row) row.review_status = select.value;
  });
}
const showStatusLabels = { new: "Новая", reviewed: "Просмотрена", casting: "Кастинг", chosen: "Выбрана", rejected: "Отказ" };
function renderShows() {
  const query = $("showSearch").value.trim().toLowerCase();
  const category = $("showCategory").value;
  const status = $("showStatus").value;
  const rows = state.shows.filter((row) => (category === "all" || row.category === category) && (status === "all" || row.status === status) && [row.full_name, row.phone, row.city].join(" ").toLowerCase().includes(query));
  $("showList").innerHTML = rows.map((row) => '<article class="crm-card"><div class="crm-card-main"><div class="crm-card-title"><b>' + escapeHtml(row.full_name) + '</b><span class="status ' + (row.status === "chosen" ? "hired" : row.status === "rejected" ? "rejected" : "interview") + '">' + escapeHtml(showStatusLabels[row.status] || "Новая") + '</span></div><p>' + (row.category === "brand_face" ? "Бренд-фейс" : "Мобилограф") + ' · ' + escapeHtml(row.city) + '</p><p class="crm-card-meta">' + escapeHtml(row.phone) + ' · ' + escapeHtml(dateText(row.application_date)) + (row.portfolio_url ? ' · <a href="' + escapeHtml(row.portfolio_url) + '" target="_blank" rel="noopener">Портфолио ↗</a>' : "") + '</p></div><div class="crm-card-actions"><a class="button secondary" href="' + escapeHtml(phoneHref(row.phone)) + '">☎ Позвонить</a><select class="filter-select show-stage" data-id="' + escapeHtml(row.id) + '">' + Object.entries(showStatusLabels).map(([key, label]) => '<option value="' + key + '" ' + (row.status === key ? "selected" : "") + '>' + label + '</option>').join("") + '</select></div></article>').join("");
  $("showEmpty").classList.toggle("hidden", rows.length > 0);
  document.querySelectorAll(".show-stage").forEach((select) => select.onchange = async () => {
    const result = await db.from("show_applications").update({ status: select.value }).eq("id", select.dataset.id);
    if (result.error) { toast("Не удалось сохранить этап"); return; }
    const item = state.shows.find((candidate) => candidate.id === select.dataset.id); if (item) item.status = select.value;
    renderShows();
  });
}
async function loadCoreSections() {
  const [manager, role] = await Promise.all([db.rpc("crm_is_manager"), db.rpc("crm_user_role")]);
  state.manager = !manager.error && manager.data === true;
  state.crmRole = !role.error && typeof role.data === "string" ? role.data : null;
  state.leadAccess = state.manager;
  const [promos, shows, tabs, runs] = await Promise.all([
    db.from("promo_observations").select("*,blogger:bloggers(*),business:local_businesses(*)").order("published_at", { ascending: false }).limit(300),
    db.from("show_applications").select("*").order("application_date", { ascending: false }).limit(300),
    db.from("custom_tabs").select("*").order("created_at", { ascending: true }),
    db.from("research_runs").select("started_at,finished_at,status,found_count,message").order("started_at", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (!promos.error) { state.promos = promos.data || []; $("researchStatus").textContent = "Раз в две недели проведите ресерч в Chrome и загрузите сюда Excel за последние 7 дней. CRM не использует Meta API."; }
  else { state.promos = []; $("researchStatus").textContent = "Нужно применить миграцию CRM, чтобы включить этот раздел."; }
  if (!shows.error) state.shows = shows.data || [];
  else { state.shows = []; $("showList").innerHTML = '<div class="loading-row">Примените миграцию CRM в Supabase, чтобы включить заявки шоу.</div>'; }
  if (!tabs.error) {
    state.tabs = tabs.data || [];
    if (state.crmRole && !state.tabs.some((tab) => tab.name === excelLeadsTabName)) {
      const seeded = await db.from("custom_tabs").insert({
        name: excelLeadsTabName,
        icon: "⇧",
        fields: [{ name: "Имя", type: "text" }, { name: "Телефон", type: "phone" }],
        viewer_roles: ["owner", "manager", "admin"],
        editor_roles: ["owner", "manager", "admin"]
      }).select("*").single();
      if (!seeded.error && seeded.data) state.tabs.push(seeded.data);
    }
  } else state.tabs = [];
  if (!runs.error && runs.data) {
    const next = new Date(new Date(runs.data.started_at).getTime() + 14 * 86400000);
    $("researchLastRun").textContent = "Последняя загрузка: " + dateText(runs.data.started_at) + " · найдено строк: " + runs.data.found_count + " · следующий ресерч: " + dateText(next);
  } else $("researchLastRun").textContent = "Excel ещё не загружали · периодичность: раз в 2 недели";
  renderHome(); renderPromos(); renderShows(); renderCustomTabs();
  restoreLastView();
  if (state.manager) {
    const leads = await db.from("meta_admin_leads").select("meta_lead_id,full_name,phone,kirgili_answer,study_answer,availability,meta_answers,meta_created_at,received_at,pipeline_status,crm_note").order("received_at", { ascending: false }).limit(300);
    state.leadAccess = !leads.error; state.leads = leads.data || []; renderLeads();
    if (leads.error) { $("leadsNotice").textContent = "Не удалось загрузить HR-лиды. Проверьте миграцию и права руководителя."; $("leadsNotice").classList.remove("hidden"); }
    renderHome();
  } else { state.leads = []; renderHome(); }
}
function bindOpenButtons() {
  document.querySelectorAll(".lead-open").forEach((button) => {
    button.onclick = () => openLead(state.leads[Number(button.dataset.leadIndex)]);
  });
  document.querySelectorAll(".order-open").forEach((button) => {
    button.onclick = () => openOrder(state.orders[Number(button.dataset.orderIndex)]);
  });
}
async function loadData() {
  $("promoList").innerHTML = '<div class="loading-row">Загрузка…</div>';
  $("showList").innerHTML = '<div class="loading-row">Загрузка…</div>';
  await loadCoreSections();
}
function openLead(lead) {
  if (!lead) return;
  state.selectedLead = lead;
  $("leadDialogName").textContent = lead.full_name || "Nomsiz nomzod";
  const metaAnswerRows = Object.entries(lead.meta_answers || {}).filter(([key, value]) => {
    const normalized = key.toLowerCase().replace(/[^a-zа-яё0-9]/gi, "");
    return value != null && String(value).trim() && !["fullname", "name", "phone", "phonenumber", "telefon", "ism", "ismfamiliya"].includes(normalized);
  }).map(([key, value]) => {
    const label = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return detailRow(label.charAt(0).toUpperCase() + label.slice(1), Array.isArray(value) ? value.join(", ") : String(value));
  }).join("");
  $("leadDialogInfo").innerHTML = detailRow("Telefon", lead.phone) + detailRow("Kirguli", lead.kirgili_answer) +
    detailRow("O‘qish / talabalik", lead.study_answer) + detailRow("Bo‘sh vaqt", lead.availability) +
    detailRow("Ariza kelgan sana", dateText(lead.meta_created_at || lead.received_at)) + metaAnswerRows;
  $("leadStatus").value = lead.pipeline_status || "new";
  $("leadNote").value = lead.crm_note || "";
  const call = $("leadCall");
  if (lead.phone) {
    call.href = phoneHref(lead.phone);
    call.classList.remove("hidden");
  } else call.classList.add("hidden");
  const telegram = $("leadTelegram");
  const telegramUrl = telegramHref(lead.phone);
  if (telegramUrl) {
    telegram.href = telegramUrl;
    telegram.classList.remove("hidden");
  } else telegram.classList.add("hidden");
  showMessage("leadDialogMessage", "", "");
  $("leadDialog").showModal();
}
$("saveLead").onclick = async () => {
  const lead = state.selectedLead;
  if (!lead) return;
  const button = $("saveLead");
  button.disabled = true;
  button.textContent = "Saqlanmoqda…";
  const update = await db.from("meta_admin_leads")
    .update({ pipeline_status: $("leadStatus").value, crm_note: $("leadNote").value.trim() })
    .eq("meta_lead_id", lead.meta_lead_id).select("meta_lead_id,pipeline_status,crm_note").single();
  if (update.error) {
    showMessage("leadDialogMessage", "Saqlab bo‘lmadi. CRM migratsiyasini qo‘llang va qayta urinib ko‘ring.", "error");
  } else {
    Object.assign(lead, update.data);
    $("leadDialog").close();
    renderHome(); renderLeads();
    toast("Nomzod ma’lumoti saqlandi");
  }
  button.disabled = false;
  button.textContent = "Saqlash";
};
function openOrder(order) {
  if (!order) return;
  state.selectedOrder = order;
  $("orderDetailTitle").textContent = order.business_name || "Buyurtma";
  $("orderDetailInfo").innerHTML =
    detailRow("Buyurtma raqami", order.order_number) +
    detailRow("Rahbar", order.owner_name) +
    detailRow("Biznes", order.business_name) +
    detailRow("Telefon", order.phone) +
    (order.stir ? detailRow("STIR", order.stir) : "") +
    detailRow("Paket", order.package_name) +
    detailRow("Xizmat", order.details) +
    detailRow("Kelishilgan summa", money(order.total_amount)) +
    detailRow("Oldindan to‘langan", money(order.paid_amount)) +
    detailRow("Qolgan summa", money(Number(order.total_amount) - Number(order.paid_amount))) +
    detailRow("To‘lov grafigi", order.payment_schedule || "Alohida kelishiladi") +
    detailRow("Topshirish muddati", order.delivery_deadline || "Alohida kelishiladi") +
    detailRow("Holati", order.status === "signed" ? "Imzolangan" : "Imzo kutilmoqda");
  $("orderDetailDialog").showModal();
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
async function hashToken(token) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function ownerUrl(token) {
  return location.href.split("#")[0] + "#owner=" + encodeURIComponent(token);
}
$("orderForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("createOrder");
  const fields = {
    owner_name: $("orderOwner").value.trim(),
    business_name: $("orderBusiness").value.trim(),
    phone: $("orderPhone").value.trim(),
    stir: $("orderStir").value.trim(),
    package_name: $("orderPackage").value.trim(),
    details: $("orderDetails").value.trim(),
    total_amount: Number($("orderTotal").value || 0),
    paid_amount: Number($("orderPaid").value || 0),
    payment_schedule: $("orderSchedule").value.trim(),
    delivery_deadline: $("orderDeadline").value.trim()
  };
  if (fields.paid_amount > fields.total_amount) {
    showMessage("orderFormMessage", "Oldindan to‘lov jami summadan oshmasligi kerak.", "error");
    return;
  }
  button.disabled = true;
  button.textContent = "Saqlanmoqda…";
  const token = randomToken();
  const orderNumber = "ZKD-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + crypto.randomUUID().slice(0, 4).toUpperCase();
  const result = await db.from("orders").insert({
    ...fields, coordinator_id: state.user.id, order_number: orderNumber, owner_token_hash: await hashToken(token)
  }).select("id").single();
  if (result.error) {
    showMessage("orderFormMessage", "Buyurtma saqlanmadi. Tekshiring va qayta urinib ko‘ring.", "error");
    button.disabled = false; button.textContent = "Saqlash va havola olish";
    return;
  }
  $("orderDialog").close();
  await loadData();
  const link = ownerUrl(token);
  $("shareUrl").textContent = link;
  $("copyShare").onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast("Havola nusxalandi"); }
    catch { $("shareUrl").focus(); toast("Havolani bosib nusxalang"); }
  };
  $("whatsappShare").href = "https://wa.me/?text=" + encodeURIComponent("Buyurtmani ko‘rib chiqish va imzolash havolasi: " + link);
  $("shareDialog").showModal();
  button.disabled = false; button.textContent = "Saqlash va havola olish";
  $("orderForm").reset();
  $("orderPackage").value = "Duo Start"; $("orderPaid").value = "0";
};
$("printOrder").onclick = () => window.print();
document.querySelectorAll("[data-new-order]").forEach((button) => button.onclick = () => {
  showMessage("orderFormMessage", "", "");
  $("orderDialog").showModal();
});
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => setPage(button.dataset.view));
document.querySelectorAll("[data-close]").forEach((button) => button.onclick = () => $(button.dataset.close).close());
$("leadSearch").addEventListener("input", renderLeads);
$("leadFilter").addEventListener("change", renderLeads);
$("refreshLeads").onclick = loadData;
$("promoSearch").addEventListener("input", renderPromos);
$("promoPeriod").addEventListener("change", renderPromos);
$("showSearch").addEventListener("input", renderShows);
$("showCategory").addEventListener("change", renderShows);
$("showStatus").addEventListener("change", renderShows);
$("refreshPromos").onclick = loadData;
$("uploadExcelButton").onclick = () => $("excelFile").click();
$("uploadAutopilotExcel").onclick = () => $("excelFile").click();
$("downloadAutopilotTemplate").onclick = () => $("downloadExcelTemplate").click();
$("excelFile").onchange = async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  showMessage("excelImportMessage", "Читаю первый лист Excel…", "");
  try {
    if (!window.XLSX) throw new Error("Не загрузился модуль чтения Excel. Обновите страницу и попробуйте снова.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Размер файла больше 5 МБ. Разделите таблицу на несколько файлов.");
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
    if (matrix.length < 2) throw new Error("В файле нет строк с данными.");
    const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
    const aliases = {
      business: ["бизнес", "название бизнеса", "business", "business name", "biznes", "korxona"],
      phone: ["телефон", "телефон бизнеса", "phone", "business phone", "telefon", "telefon raqami"],
      phone_source: ["источник телефона", "phone source", "telefon manbasi"],
      city: ["город", "город район", "город район область", "city", "city area", "shahar", "shahar tuman"],
      blogger: ["блогер", "профиль блогера", "blogger", "blogger profile", "bloger", "instagram блогер"],
      permalink: ["ссылка на пост", "ссылка публикации", "ссылка на публикацию", "post link", "post url", "permalink", "post havolasi"],
      published_at: ["дата публикации", "дата поста", "publish date", "published at", "e lon sanasi"],
      evidence: ["основание рекламы", "что подтверждает рекламу", "evidence", "ad evidence", "reklama asosi"]
    };
    const header = matrix[0].map(normalize);
    const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, header.findIndex((name) => names.includes(name))]));
    for (const key of ["business", "blogger", "permalink"]) if (columns[key] < 0) throw new Error("Не найдена обязательная колонка: " + ({ business: "Бизнес", blogger: "Блогер (профиль Instagram)", permalink: "Ссылка на пост" })[key] + ". Скачайте шаблон CRM и используйте его заголовки.");
    const rows = matrix.slice(1).map((cells, index) => {
      const value = (key) => columns[key] < 0 ? "" : cells[columns[key]];
      return { row: index + 2, business: String(value("business") || "").trim(), phone: String(value("phone") || "").trim(), phone_source: String(value("phone_source") || "").trim(), city: String(value("city") || "").trim(), blogger: String(value("blogger") || "").trim(), permalink: String(value("permalink") || "").trim(), published_at: value("published_at"), evidence: String(value("evidence") || "").trim() };
    }).filter((row) => row.business || row.blogger || row.permalink);
    if (rows.length > 300) throw new Error("В файле больше 300 строк данных. Разделите его на несколько частей.");
    let added = 0, updated = 0, skipped = 0; const issues = [];
    const asDate = (value) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
      if (typeof value === "number" && window.XLSX.SSF?.parse_date_code) { const d = XLSX.SSF.parse_date_code(value); if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString(); }
      const raw = String(value || "").trim(); if (!raw) return null;
      const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      const date = match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : new Date(raw);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    for (const row of rows) {
      try {
        if (!row.business || !row.blogger || !row.permalink) throw new Error("нет бизнеса, профиля блогера или ссылки поста");
        const publishedAt = asDate(row.published_at);
        if (!publishedAt) throw new Error("укажите дату публикации в Excel");
        const publishedMs = new Date(publishedAt).getTime();
        if (publishedMs < Date.now() - 7 * 86400000 || publishedMs > Date.now() + 86400000) throw new Error("публикация вне выбранного периода последних 7 дней");
        const profile = /^https?:\/\//i.test(row.blogger) ? new URL(row.blogger) : new URL("https://www.instagram.com/" + row.blogger.replace(/^@/, "").replace(/^\//, "") + "/");
        if (!/(^|\.)instagram\.com$/i.test(profile.hostname)) throw new Error("профиль блогера должен быть ссылкой Instagram или @username");
        const username = profile.pathname.split("/").filter(Boolean)[0];
        if (!username || ["p", "reel", "reels", "stories", "explore"].includes(username.toLowerCase())) throw new Error("нужна ссылка профиля блогера");
        const postUrl = new URL(row.permalink);
        if (!/(^|\.)instagram\.com$/i.test(postUrl.hostname) || !/\/(p|reel|reels|tv)\//i.test(postUrl.pathname)) throw new Error("ссылка должна вести на пост, Reels или видео Instagram");
        const blogger = await db.from("bloggers").upsert({ instagram_url: "https://www.instagram.com/" + username + "/", username, display_name: row.blogger }, { onConflict: "instagram_url" }).select("id").single();
        if (blogger.error) throw blogger.error;
        const businessLookup = await db.from("local_businesses").select("id,phone,city,contact_source").ilike("name", row.business).limit(1).maybeSingle();
        if (businessLookup.error) throw businessLookup.error;
        const business = businessLookup.data
          ? await db.from("local_businesses").update({ phone: row.phone || businessLookup.data.phone, city: row.city || businessLookup.data.city, contact_source: row.phone_source || businessLookup.data.contact_source }).eq("id", businessLookup.data.id).select("id").single()
          : await db.from("local_businesses").insert({ name: row.business, phone: row.phone || null, city: row.city || "Ферганская область", contact_source: row.phone_source || null }).select("id").single();
        if (business.error) throw business.error;
        const existing = await db.from("promo_observations").select("id").eq("permalink", postUrl.toString()).maybeSingle();
        if (existing.error) throw existing.error;
        const values = { blogger_id: blogger.data.id, business_id: business.data.id, permalink: postUrl.toString(), published_at: publishedAt, evidence: row.evidence || null, last_seen_at: new Date().toISOString() };
        const saved = existing.data ? await db.from("promo_observations").update(values).eq("id", existing.data.id) : await db.from("promo_observations").insert(values);
        if (saved.error) throw saved.error;
        if (existing.data) updated++; else added++;
      } catch (error) { skipped++; issues.push("Строка " + row.row + ": " + (error.message || "ошибка импорта")); }
    }
    await db.from("research_runs").insert({ finished_at: new Date().toISOString(), status: "complete", found_count: added + updated, message: file.name + " · добавлено " + added + ", обновлено " + updated + ", пропущено " + skipped });
    await loadData();
    const summary = "Excel обработан: добавлено " + added + ", обновлено " + updated + ", пропущено " + skipped + ". Профили и публикации находятся в разделе «Блогеры», сгруппированные по источнику." + (issues.length ? " Подробности: " + issues.slice(0, 4).join("; ") : "") + " Исходный файл не сохранялся.";
    showMessage("excelImportMessage", summary, skipped ? "error" : "success");
     showMessage("autopilotImportMessage", summary, skipped ? "error" : "success");
  } catch (error) { showMessage("excelImportMessage", error.message || "Не удалось прочитать Excel.", "error"); showMessage("autopilotImportMessage", error.message || "Не удалось прочитать Excel.", "error"); }
  finally { event.target.value = ""; }
};
$("downloadExcelTemplate").onclick = () => {
  if (!window.XLSX) { toast("Модуль Excel пока недоступен"); return; }
  const headers = ["Бизнес", "Телефон бизнеса", "Источник телефона", "Город/район", "Блогер (профиль Instagram)", "Ссылка на пост", "Дата публикации", "Основание рекламы"];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), "Реклама Instagram");
  XLSX.writeFile(workbook, "CRM_Instagram_шаблон.xlsx");
};
$("addPromo").onclick = () => { $("promoDate").value = new Date().toISOString().slice(0, 10); showMessage("promoFormMessage", "", ""); $("promoDialog").showModal(); };
$("addShow").onclick = () => { showMessage("showFormMessage", "", ""); $("showDialog").showModal(); };
$("newCustomTab").onclick = () => { showMessage("customTabMessage", "", ""); $("customTabDialog").showModal(); };
function closeMobileMore() {
  $("mobileMoreSheet").classList.add("hidden");
  $("mobileMore").setAttribute("aria-expanded", "false");
}
$("mobileMore").onclick = () => {
  const sheet = $("mobileMoreSheet");
  if (!sheet.classList.contains("hidden")) { closeMobileMore(); return; }
  sheet.innerHTML = "";
  document.querySelectorAll(".side-nav .nav-item:not(#newCustomTab):not(.hidden)").forEach((source) => {
    const item = document.createElement("button");
    item.type = "button"; item.className = "mobile-more-item" + (source.classList.contains("active") ? " active" : ""); item.setAttribute("role", "menuitem");
    const icon = source.querySelector(".nav-icon"), label = source.querySelector(":scope > .nav-custom-label") || [...source.children].find((node) => !node.classList.contains("nav-icon") && !node.classList.contains("nav-count"));
    item.innerHTML = '<span>' + escapeHtml(icon?.textContent || "▤") + '</span><b>' + escapeHtml(label?.textContent || source.textContent.trim()) + '</b>';
    item.onclick = () => { closeMobileMore(); source.click(); };
    sheet.appendChild(item);
  });
  sheet.classList.remove("hidden");
  $("mobileMore").setAttribute("aria-expanded", "true");
};
document.addEventListener("click", (event) => {
  if (!event.target.closest("#mobileMore, #mobileMoreSheet")) closeMobileMore();
});
$("newCustomTabMobile").onclick = () => { showMessage("customTabMessage", "", ""); $("customTabDialog").showModal(); };
$("promoForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try {
    const bloggerInput = $("promoBlogger").value.trim();
    const username = bloggerInput.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, "").split(/[/?#]/)[0];
    const instagramUrl = "https://www.instagram.com/" + username + "/";
    let blogger = await db.from("bloggers").upsert({ instagram_url: instagramUrl, username, display_name: bloggerInput }, { onConflict: "instagram_url" }).select("id").single();
    if (blogger.error) throw blogger.error;
    const businessName = $("promoBusiness").value.trim();
    let foundBusiness = await db.from("local_businesses").select("id,phone,city,contact_source").ilike("name", businessName).limit(1).maybeSingle();
    let business;
    if (!foundBusiness.error && foundBusiness.data) {
      business = await db.from("local_businesses").update({ phone: $("promoPhone").value.trim() || foundBusiness.data.phone, city: $("promoCity").value.trim() || foundBusiness.data.city, contact_source: $("promoPhoneSource").value.trim() || foundBusiness.data.contact_source }).eq("id", foundBusiness.data.id).select("id").single();
    } else {
      business = await db.from("local_businesses").insert({ name: businessName, phone: $("promoPhone").value.trim() || null, city: $("promoCity").value.trim() || null, contact_source: $("promoPhoneSource").value.trim() || null }).select("id").single();
    }
    if (business.error) throw business.error;
    const permalink = $("promoLink").value.trim();
    const existing = await db.from("promo_observations").select("id").eq("permalink", permalink).maybeSingle();
    if (existing.error) throw existing.error;
    const values = { blogger_id: blogger.data.id, business_id: business.data.id, permalink, published_at: $("promoDate").value || null, evidence: $("promoEvidence").value.trim() || null, last_seen_at: new Date().toISOString() };
    const result = existing.data
      ? await db.from("promo_observations").update(values).eq("id", existing.data.id)
      : await db.from("promo_observations").insert(values);
    if (result.error) throw result.error;
    $("promoDialog").close(); event.target.reset(); await loadData(); toast("Публикация сохранена");
  } catch (error) { showMessage("promoFormMessage", error.message || "Не удалось сохранить. Проверьте миграцию CRM.", "error"); }
  finally { button.disabled = false; }
};
$("showForm").onsubmit = async (event) => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  const result = await db.from("show_applications").insert({ full_name: $("showName").value.trim(), phone: $("showPhone").value.trim(), category: $("showType").value, city: $("showCity").value.trim(), portfolio_url: $("showPortfolio").value.trim() || null });
  button.disabled = false;
  if (result.error) { showMessage("showFormMessage", result.error.message || "Не удалось сохранить заявку.", "error"); return; }
  $("showDialog").close(); event.target.reset(); await loadData(); toast("Заявка сохранена");
};
function isFargonaTezkorTab(tab) { return /^fargona\s+tezkor$/i.test(String(tab?.name || "").trim()); } function renderCustomTabs() {
  const sidebarNav = document.querySelector(".side-nav");
  document.querySelectorAll(".custom-tab-nav,.custom-tab-page,.excel-leads-mobile-nav").forEach((node) => node.remove());
  for (const tab of state.tabs) {
    if (isFargonaTezkorTab(tab) || isScriptTab(tab)) continue;
    const nav = document.createElement("button"); nav.className = "nav-item custom-tab-nav"; nav.dataset.view = "custom-" + tab.id; nav.dataset.bound = "1";
    nav.innerHTML = '<span class="nav-icon">' + escapeHtml(tab.icon || "▤") + '</span><span>' + escapeHtml(tab.name) + '</span>';
    // Куда попадёт пункт (меню или «Архив»), решает nav-archive.js; Excel-лиды по умолчанию остаются в меню.
    if (tab.name === excelLeadsTabName) nav.dataset.excel = "1";
    sidebarNav.insertBefore(nav, $("newCustomTab"));
    nav.onclick = () => showCustomTab(tab);
    if (tab.name === excelLeadsTabName) {
      const mobileNav = document.createElement("button"); mobileNav.className = "mobile-nav-item excel-leads-mobile-nav"; mobileNav.dataset.view = "custom-" + tab.id; mobileNav.dataset.bound = "1";
      mobileNav.innerHTML = '<span>⇧</span><small>Excel-лиды</small>';
      $("mobileNav").insertBefore(mobileNav, $("mobileMore")); mobileNav.onclick = () => showCustomTab(tab);
    }
  }
  const groups = new Map();
  for (const row of state.promos || []) {
    const blogger = row.blogger || {};
    const key = String(blogger.id || blogger.instagram_url || blogger.username || blogger.display_name || "").toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) {
      const rawName = blogger.display_name || blogger.username || "Источник не указан";
      const name = isFargonaTezkorPromo(row) ? "Fargona Tezkor" : String(rawName).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "@").replace(/\/+$/, "");
      const profileUrl = blogger.instagram_url || (blogger.username ? "https://www.instagram.com/" + String(blogger.username).replace(/^@/, "") + "/" : "");
      groups.set(key, { id: blogger.id || key, name, profileUrl });
    }
  }
  const folderGrid = $("bloggerFolders");
  if (folderGrid) {
    const sources = [...groups.values()];
    folderGrid.classList.toggle("hidden", sources.length === 0);
    folderGrid.innerHTML = sources.map((source, index) => '<button class="source-folder-button" type="button" data-source-index="' + index + '" aria-label="Открыть папку ' + escapeHtml(source.name) + '"><span class="source-folder-symbol" aria-hidden="true">◉</span><span class="source-folder-name">' + escapeHtml(source.name) + '</span><span class="source-folder-arrow" aria-hidden="true">↗</span></button>').join("");
    folderGrid.querySelectorAll(".source-folder-button").forEach((button) => {
      button.onclick = () => showPromoFolder(sources[Number(button.dataset.sourceIndex)]);
    });
  }
  document.querySelectorAll("[data-view]").forEach((button) => {
    if (!button.dataset.bound) { button.dataset.bound = "1"; button.onclick = () => setPage(button.dataset.view); }
  });
}
function showPromoFolder(source) {
  if (!source) return;
  const sourceKey = String(source.id).toLowerCase();
  const pageId = "promo-folder-" + sourceKey.replace(/[^a-z0-9-]+/g, "-");
  document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === "bloggers"));
  let page = document.getElementById(pageId);
  if (!page) {
    page = document.createElement("section"); page.id = pageId; page.className = "page source-folder-page";
    $("workspace").appendChild(page);
  }
  page.classList.add("active");
  const rows = state.promos.filter((row) => String(row.blogger?.id || row.blogger?.instagram_url || row.blogger?.username || row.blogger?.display_name || "").toLowerCase() === sourceKey);
  page.innerHTML = '<div class="source-page-top"><button class="button secondary" id="sourceFolderBack">← Блогеры</button>' + (source.profileUrl ? '<a class="button secondary" href="' + escapeHtml(source.profileUrl) + '" target="_blank" rel="noopener">Профиль источника ↗</a>' : "") + '</div><header class="source-page-header"><div><p class="eyebrow">ПАПКА БЛОГЕРА</p><h1>' + escapeHtml(source.name) + '</h1><p class="subtle">Публикации и бизнесы из этого профиля.</p></div><div class="source-page-count"><b>' + rows.length + '</b><span>НАХОДОК</span></div></header><div class="source-record-list">' + rows.map(sourcePromoCard).join("") + '</div>';
  $("sourceFolderBack").onclick = () => setPage("bloggers");
}
function canManageCustomTab(tab) {
  return Boolean(state.user && (tab.created_by === state.user.id || (state.crmRole && Array.isArray(tab.editor_roles) && tab.editor_roles.includes(state.crmRole))));
}
function openCustomRecordDialog(tab, fields, record = null) {
  state.selectedCustomTab = tab;
  state.selectedCustomRecord = record;
  $("customRecordTitle").textContent = (record ? "Изменить запись · " : "Новая запись · ") + tab.name;
  $("customRecordFields").innerHTML = fields.map((field, index) => {
    const inputType = field.type === "phone" ? "tel" : field.type === "date" ? "date" : field.type === "link" ? "url" : "text";
    const value = record?.values?.[field.name] ?? "";
    const required = tab.name === excelLeadsTabName && ["Имя", "Телефон"].includes(field.name) ? " required" : "";
    const note = field.type === "file" ? '<small class="subtle">Hozircha fayl havolasini kiriting.</small>' : "";
    const placeholder = field.name === "Результат последнего звонка" ? "Бу ерда қўнғироқ натижалари ёзилади." : "Кратко укажите результат разговора";
    const control = field.type === "textarea"
      ? '<textarea class="input-control compact-area" id="customField' + index + '" data-field-name="' + escapeHtml(field.name) + '" rows="4" placeholder="' + escapeHtml(placeholder) + '">' + escapeHtml(value) + '</textarea>'
      : '<input class="input-control" id="customField' + index + '" data-field-name="' + escapeHtml(field.name) + '" type="' + inputType + '" value="' + escapeHtml(value) + '"' + required + (field.type === "file" ? ' placeholder="https://…"' : "") + '>';
    return '<label class="field-label" for="customField' + index + '">' + escapeHtml(field.name) + '</label>' + control + note;
  }).join("");
  showMessage("customRecordMessage", "", "");
  $("customRecordDialog").showModal();
}
function attachYbaInviteActions(records) {
  const cards = [...document.querySelectorAll("#customRecordList .custom-record-card")];

      records.forEach((record, index) => {
        const card = cards[index];
        if (!card) return;
        const box = document.createElement("div");
        box.className = "yba-parent-invite-actions";
        box.style.cssText = "display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #e5e7eb";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button secondary";
        button.textContent = "Создать ссылку для родителя";
        const status = document.createElement("small");
        status.className = "subtle";
        const link = document.createElement("input");
        link.className = "input-control";
        link.type = "text";
        link.readOnly = true;
        link.hidden = true;
        link.setAttribute("aria-label", "Персональная ссылка родителя");
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "button secondary";
        copy.textContent = "Скопировать ссылку";
        copy.hidden = true;
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(link.value); status.textContent = "Ссылка скопирована. Отправьте её родителю."; }
          catch { link.focus(); link.select(); status.textContent = "Ссылка выделена — скопируйте её и отправьте родителю."; }
        };
        button.onclick = async () => {
          button.disabled = true;
          button.textContent = "Создаю…";
          status.textContent = "";
          try {
            const auth = await db.auth.getSession();
            const accessToken = auth.data?.session?.access_token;
            if (!accessToken) throw new Error("Войдите в CRM заново.");
            const response = await fetch(config.url + "/functions/v1/yba-parent-api", {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: config.publishableKey, Authorization: "Bearer " + accessToken },
              body: JSON.stringify({ action: "create_invite", lead_record_id: record.id })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.link) throw new Error(result.error === "forbidden" ? "Нет прав на создание ссылки." : "Ссылку создать не удалось.");
            link.value = result.link;
            link.hidden = false;
            copy.hidden = false;
            try { await navigator.clipboard.writeText(result.link); status.textContent = "Ссылка создана и скопирована. Отправьте её родителю."; }
            catch { status.textContent = "Ссылка готова. Нажмите поле и скопируйте её родителю."; }
            button.textContent = "Создать новую ссылку";
          } catch (error) {
            status.textContent = error.message || "Не удалось создать ссылку.";
            button.textContent = "Повторить";
          } finally { button.disabled = false; }
        };
        box.append(button, link, copy, status);
        card.appendChild(box);
      });
}
function renderHighIntentLeads(records) {
  const panel = $("highIntentLeads");
  if (!panel) return;
  const highIntent = records.filter((record) => Number(record.values?.submission_count) > 1);
  panel.classList.toggle("hidden", highIntent.length === 0);
  if (!highIntent.length) { panel.innerHTML = ""; return; }
  panel.innerHTML = '<div class="high-intent-header"><div><p class="eyebrow">ПОВТОРНАЯ ЗАЯВКА</p><h2>Высокое намерение</h2><p class="subtle">Эти родители отправляли заявку больше одного раза.</p></div><span class="high-intent-total">' + highIntent.length + '</span></div><div class="high-intent-list">' + highIntent.map((record) => '<button type="button" class="high-intent-item" data-lead-target="excel-lead-' + String(record.id).replace(/[^a-zA-Z0-9_-]/g, "") + '"><b>' + escapeHtml(record.values?.["Имя"] || "Без имени") + '</b><span>' + escapeHtml(leadSubmissionCountText(record.values?.submission_count)) + ' оставил(а) заявку</span></button>').join("") + '</div>';
  panel.querySelectorAll(".high-intent-item").forEach((button) => button.onclick = () => document.getElementById(button.dataset.leadTarget)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}
// «Перезвонить» (Qayta aloqa): время хранится в записи лида и в таблице lead_callbacks; в срок бот шлёт напоминание в Telegram.
const callbackTimeField = "Время повторной связи";
const tashkentOffsetMs = 5 * 60 * 60 * 1000;
function callbackTimeText(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return parts.day + "." + parts.month + " " + parts.hour + ":" + parts.minute;
}
// «Завтра/послезавтра в 10:00» по Ташкенту (UTC+5, без перехода на летнее время).
function tashkentDayAt(daysAhead, hour) {
  const local = new Date(Date.now() + tashkentOffsetMs + daysAhead * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - tashkentOffsetMs);
}
function tashkentInputValue(date) {
  return new Date(date.getTime() + tashkentOffsetMs).toISOString().slice(0, 16);
}
async function cancelCallbackReminders(recordId) {
  await db.from("lead_callbacks").update({ status: "cancelled" }).eq("record_id", recordId).eq("status", "pending");
}
// ИИ-комментарий пишет сервер через несколько секунд после сохранения результата звонка: проверяем и обновляем список.
function watchAiComment(recordId, tab, before) {
  [6000, 12000, 20000, 30000].forEach((delay) => setTimeout(async () => {
    if (state.selectedCustomTab?.id !== tab.id || watchAiComment.done === recordId + before) return;
    const { data } = await db.from("custom_records").select("values").eq("id", recordId).maybeSingle();
    if (data && String(data.values?.["ИИ-комментарий"] || "") !== before) {
      watchAiComment.done = recordId + before;
      await showCustomTab(tab);
    }
  }, delay));
}
function openCallbackDialog(tab, record, onDone) {
  document.getElementById("callbackDialog")?.remove();
  const values = record.values || {};
  const hasPlan = String(values["Статус консультации"] || "") === "callback" && values[callbackTimeField];
  const dialog = document.createElement("dialog");
  dialog.id = "callbackDialog"; dialog.className = "callback-dialog";
  dialog.innerHTML = '<form method="dialog" class="callback-form"><h2>Перезвонить</h2><p class="subtle callback-lead"></p>'
    + '<p class="callback-hint">Выберите, когда напомнить. Напоминание придёт в Telegram-бот.</p>'
    + '<div class="callback-presets"><button type="button" data-hours="3">Через 3 часа</button><button type="button" data-hours="5">Через 5 часов</button><button type="button" data-days="1">Завтра 10:00</button><button type="button" data-days="2">Послезавтра 10:00</button></div>'
    + '<label class="callback-calendar"><span>Другая дата и время</span><input type="datetime-local" id="callbackWhen"></label>'
    + '<div class="callback-message hidden" id="callbackMessage" role="status"></div>'
    + '<div class="callback-actions"><button type="button" class="button primary" id="callbackSave">Сохранить</button>' + (hasPlan ? '<button type="button" class="button danger" id="callbackCancel">Отменить напоминание</button>' : "") + '<button type="button" class="button secondary" id="callbackClose">Закрыть</button></div></form>';
  dialog.querySelector(".callback-lead").textContent = String(values["Имя"] || "Без имени") + " · " + String(values["Телефон"] || "—");
  document.body.appendChild(dialog);
  const when = dialog.querySelector("#callbackWhen");
  when.min = tashkentInputValue(new Date());
  if (hasPlan) when.value = tashkentInputValue(new Date(values[callbackTimeField]));
  const message = dialog.querySelector("#callbackMessage");
  const say = (text) => { message.textContent = text; message.classList.toggle("hidden", !text); };
  const finish = () => { dialog.close(); dialog.remove(); };
  const setBusy = (busy) => dialog.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  const save = async (due) => {
    if (!(due instanceof Date) || Number.isNaN(due.getTime()) || due.getTime() < Date.now() + 30 * 1000) { say("Выберите время в будущем."); return; }
    setBusy(true);
    const name = String(values["Имя"] || "").slice(0, 120), phone = String(values["Телефон"] || "").slice(0, 60);
    await cancelCallbackReminders(record.id);
    const inserted = await db.from("lead_callbacks").insert({ record_id: record.id, tab_id: tab.id, due_at: due.toISOString(), lead_name: name, phone }).select("id").maybeSingle();
    if (inserted.error || !inserted.data) { setBusy(false); say("Не удалось поставить напоминание. Проверьте права доступа."); return; }
    const nextValues = { ...values, "Статус консультации": "callback", [callbackTimeField]: due.toISOString(), "Последний изменивший": excelLeadEditedBy() };
    const updatedAt = new Date().toISOString();
    const updated = await db.from("custom_records").update({ values: nextValues, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle();
    if (updated.error || !updated.data) {
      await db.from("lead_callbacks").update({ status: "cancelled" }).eq("id", inserted.data.id);
      setBusy(false); say("Не удалось сохранить лид. Проверьте права доступа."); return;
    }
    record.values = nextValues; record.updated_at = updatedAt;
    finish(); toast("Напоминание поставлено: " + callbackTimeText(due.toISOString())); onDone();
  };
  dialog.querySelectorAll(".callback-presets button").forEach((button) => button.onclick = () => {
    save(button.dataset.hours ? new Date(Date.now() + Number(button.dataset.hours) * 60 * 60 * 1000) : tashkentDayAt(Number(button.dataset.days), 10));
  });
  dialog.querySelector("#callbackSave").onclick = () => {
    if (!when.value) { say("Выберите дату и время или нажмите быструю кнопку."); return; }
    save(new Date(when.value + ":00+05:00"));
  };
  dialog.querySelector("#callbackCancel")?.addEventListener("click", async () => {
    setBusy(true);
    await cancelCallbackReminders(record.id);
    const nextValues = { ...values, "Статус консультации": "no_answer", "Последний изменивший": excelLeadEditedBy() };
    delete nextValues[callbackTimeField];
    const updatedAt = new Date().toISOString();
    const updated = await db.from("custom_records").update({ values: nextValues, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle();
    if (updated.error || !updated.data) { setBusy(false); say("Не удалось отменить. Проверьте права доступа."); return; }
    record.values = nextValues; record.updated_at = updatedAt;
    finish(); toast("Напоминание отменено"); onDone();
  });
  dialog.querySelector("#callbackClose").onclick = finish;
  dialog.addEventListener("cancel", () => dialog.remove());
  dialog.showModal();
}
// «O'quvchi bo'ldi»: суммы из комментария оператора ("99.000 tolov qilish kerak, 90.000 tolov qildi").
// Числа без подсказки не угадываем: каждая сумма получает роль (оплачено / цена / остаток) по ближайшему слову.
const moneyKeywordGroups = [
  ["paid", /(tolov(ni)? qild|to['’ʻ`]lov(ni)? qild|to['’ʻ`]?lad[ie]|to['’ʻ`]?lag|tashlad|o['’ʻ`]?tkazd|kiritd|berdi|avans|bayana|oldindan|предоплат|оплатил|оплачен|внес|внёс|перевел|аванс|тўлад|тўлаг)/gi],
  ["remain", /(qolgan|qoldi|qoldiq|qoganini|qarz|долг|остаток|осталось)/gi],
  ["price", /(kerak|narx|jami|umumiy|aksiy|askiy|akasiy|цена|стоимост|итого|всего)/gi],
];

function parseMoneyMentions(text) {
  const source = String(text || "");
  // Даты и время не деньги: 22.10.2026, 22.10.20265, 17:00
  const masked = source.replace(/\d{1,2}[./]\d{1,2}[./]\d{2,5}/g, (m) => " ".repeat(m.length)).replace(/\d{1,2}:\d{2}/g, (m) => " ".repeat(m.length));
  const found = [];
  const re = /(\d{1,3}(?:[.\s,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mln|million|млн|minglik|ming|minlik|min(?![a-zа-яё])|мин(?![a-zа-яё])|тыс|k(?![a-zа-яё]))?/gi;
  let match;
  while ((match = re.exec(masked))) {
    const raw = match[1];
    const suffix = (match[2] || "").toLowerCase();
    let amount;
    if (/^\d{1,3}([.\s,]\d{3})+$/.test(raw)) amount = Number(raw.replace(/[.\s,]/g, ""));
    else if (/^\d{2,3}[.,]0{1,3}$/.test(raw)) amount = Number(raw.split(/[.,]/)[0]) * 1000; // «400.00» = 400 000
    else amount = Number(raw.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (amount < 1000 && suffix) amount *= /^(mln|million|млн)$/.test(suffix) ? 1000000 : 1000; // 400 ming, 90k, 1.5 mln
    if (amount < 1000 || amount > 100000000) continue;
    if (/^(19|20)\d{2}$/.test(raw)) continue; // год
    found.push({ amount: Math.round(amount), start: match.index, end: match.index + match[0].trimEnd().length });
  }
  return { source: masked, original: source, found };
}

function extractPaymentHint(text) {
  const { source, original, found } = parseMoneyMentions(text);
  const keywords = [];
  for (const [kind, pattern] of moneyKeywordGroups) {
    pattern.lastIndex = 0;
    let hit;
    while ((hit = pattern.exec(source))) keywords.push({ kind, start: hit.index, end: hit.index + hit[0].length, used: false });
  }
  keywords.sort((a, b) => a.start - b.start);
  const parts = found.map((item, index) => {
    const prevEnd = index > 0 ? found[index - 1].end : 0;
    const nextStart = index + 1 < found.length ? found[index + 1].start : source.length;
    const free = (k) => !k.used;
    // 1) слово прямо перед числом («Оплатил 90 000», «tolov qildi 100.000», «narxi 99k»)
    const adjacent = keywords.filter((k) => free(k) && k.start >= prevEnd && k.end <= item.start && item.start - k.end <= 14).pop();
    // 2) слово сразу после числа («99.000 tolov qilish kerak»)
    const after = keywords.find((k) => free(k) && k.start >= item.end && k.end <= nextStart && k.start - item.end <= 45);
    // 3) слово подальше перед числом
    const far = keywords.filter((k) => free(k) && k.start >= prevEnd && k.end <= item.start && item.start - k.end <= 32).pop();
    const hit = adjacent || after || far;
    if (hit) hit.used = true;
    const isLik = !hit && /^\s*lik\b/i.test(source.slice(item.end, item.end + 8));
    return { amount: item.amount, kind: hit ? hit.kind : isLik ? "price" : "", text: original.slice(Math.max(0, item.start - 12), Math.min(original.length, item.end + 24)).replace(/\s+/g, " ").trim() };
  });
  const paid = parts.filter((p) => p.kind === "paid").reduce((sum, p) => sum + p.amount, 0);
  const priceCandidates = parts.filter((p) => p.kind === "price").map((p) => p.amount);
  const remain = parts.filter((p) => p.kind === "remain").reduce((sum, p) => sum + p.amount, 0);
  let price = priceCandidates.length ? Math.max(...priceCandidates) : 0;
  let paidTotal = paid;
  if (!price && paid && remain) price = paid + remain;
  if (price && !paidTotal && remain && remain < price) paidTotal = price - remain;
  const unlabeled = parts.filter((p) => !p.kind);
  const guess = !price && !paidTotal && unlabeled.length === 1 ? unlabeled[0].amount : 0; // одинокая сумма без слов: только как подсказка цены
  return { price: price || guess, paid: paidTotal, priceIsGuess: !price && Boolean(guess), parts };
}

// ---------- «O'quvchi bo'ldi»: карточка ученика, цена и платежи ----------
const studentSummary = new Map(); // record_id -> { price, paid }
const studentPriceMemoryKey = "crm.studentPrice.v1";
function moneyText(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0)).replace(/[  ]/g, " ") + " so‘m";
}
function moneyInputValue(input) { return Number(String(input.value || "").replace(/\D/g, "")) || 0; }
function formatMoneyInput(input) {
  const amount = moneyInputValue(input);
  input.value = amount ? new Intl.NumberFormat("ru-RU").format(amount).replace(/[  ]/g, " ") : "";
}
function rememberStudentPrice(price) { try { localStorage.setItem(studentPriceMemoryKey, String(price)); } catch { /* память браузера недоступна */ } }
function rememberedStudentPrice() { try { return Number(localStorage.getItem(studentPriceMemoryKey)) || 0; } catch { return 0; } }
function studentStatusText(record) {
  const info = studentSummary.get(record.id);
  if (!info) return "Ученик";
  const debt = Math.max(0, info.price - info.paid);
  return debt > 0 ? "Ученик · долг " + moneyText(debt) : "Ученик · оплачено полностью";
}
async function loadStudentSummaries(tabId) {
  studentSummary.clear();
  const [students, payments] = await Promise.all([
    db.from("lead_students").select("record_id,price").eq("tab_id", tabId),
    db.from("student_payments").select("record_id,amount").eq("tab_id", tabId).is("cancelled_at", null),
  ]);
  for (const row of students.data || []) studentSummary.set(row.record_id, { price: Number(row.price) || 0, paid: 0 });
  for (const row of payments.data || []) {
    const info = studentSummary.get(row.record_id);
    if (info) info.paid += Number(row.amount) || 0;
  }
}
// Имя и телефон ученика: телефон — нажимаемая ссылка для звонка.
function fillStudentLead(node, values) {
  node.textContent = "";
  node.classList.add("student-lead-box");
  const name = document.createElement("b");
  name.textContent = String(values["Имя"] || "Без имени");
  node.appendChild(name);
  const phone = String(values["Телефон"] || "").trim();
  if (phone) {
    const link = document.createElement("a");
    link.className = "student-phone"; link.href = phoneHref(phone); link.textContent = "📞 " + phone;
    node.appendChild(link);
  }
}
function studentDialogShell(id, className) {
  document.getElementById(id)?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = id; dialog.className = "callback-dialog " + className;
  dialog.addEventListener("cancel", () => dialog.remove());
  return dialog;
}
function openStudentDialog(tab, record, onChange) {
  if (studentSummary.has(record.id)) openStudentCard(tab, record, onChange);
  else openStudentCreateDialog(tab, record, onChange);
}
function openStudentCreateDialog(tab, record, onChange) {
  const values = record.values || {};
  const hint = extractPaymentHint(String(values["Результат последнего звонка"] || ""));
  const dialog = studentDialogShell("studentCreateDialog", "student-dialog");
  const detected = hint.parts.filter((part) => part.kind).map((part) => (part.kind === "paid" ? "оплачено " : part.kind === "remain" ? "остаток " : "цена ") + moneyText(part.amount));
  dialog.innerHTML = '<form method="dialog" class="callback-form"><h2>Создание карточки ученика</h2><p class="subtle student-lead"></p>'
    + '<p class="callback-hint student-hint"></p>'
    + '<label class="callback-calendar"><span>Цена курса (so‘m)</span><input type="text" inputmode="numeric" id="studentPrice" autocomplete="off"></label>'
    + '<label class="callback-calendar"><span>Уже оплачено (so‘m)</span><input type="text" inputmode="numeric" id="studentPaid" autocomplete="off"></label>'
    + '<p class="student-debt"><span>Остаток долга:</span> <b id="studentDebt">—</b></p>'
    + '<div class="callback-message hidden" id="studentMessage" role="status"></div>'
    + '<div class="callback-actions"><button type="button" class="button primary" id="studentCreate">Создать карточку</button><button type="button" class="button secondary" id="studentCreateClose">Закрыть</button></div></form>';
  fillStudentLead(dialog.querySelector(".student-lead"), values);
  const hintNode = dialog.querySelector(".student-hint");
  hintNode.textContent = "";
  if (detected.length) {
    const title = document.createElement("b"); title.textContent = "Найдено в комментарии:";
    hintNode.append(title, document.createTextNode(" " + detected.join("; ")));
  } else hintNode.textContent = "В комментарии сумм не найдено. Введите вручную.";
  document.body.appendChild(dialog);
  const price = dialog.querySelector("#studentPrice"), paid = dialog.querySelector("#studentPaid");
  const message = dialog.querySelector("#studentMessage"), debt = dialog.querySelector("#studentDebt");
  price.value = String(hint.price || rememberedStudentPrice() || hint.paid || "");
  paid.value = hint.paid ? String(hint.paid) : "";
  formatMoneyInput(price); formatMoneyInput(paid);
  const say = (text) => { message.textContent = text; message.classList.toggle("hidden", !text); };
  const refreshDebt = () => { debt.textContent = moneyText(Math.max(0, moneyInputValue(price) - moneyInputValue(paid))); };
  [price, paid].forEach((input) => { input.addEventListener("input", refreshDebt); input.addEventListener("blur", () => { formatMoneyInput(input); refreshDebt(); }); });
  refreshDebt();
  const finish = () => { dialog.close(); dialog.remove(); };
  const setBusy = (busy) => dialog.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  dialog.querySelector("#studentCreateClose").onclick = finish;
  dialog.querySelector("#studentCreate").onclick = async () => {
    const priceValue = moneyInputValue(price), paidValue = moneyInputValue(paid);
    if (!priceValue) { say("Введите цену курса."); return; }
    if (paidValue > priceValue) { say("Оплачено больше цены: проверьте суммы."); return; }
    setBusy(true);
    const created = await db.from("lead_students").upsert({ record_id: record.id, tab_id: tab.id, price: priceValue }, { onConflict: "record_id" }).select("record_id").maybeSingle();
    if (created.error || !created.data) { setBusy(false); say("Не удалось сохранить. Проверьте права доступа."); return; }
    if (paidValue > 0) {
      const payment = await db.from("student_payments").insert({ record_id: record.id, tab_id: tab.id, amount: paidValue, note: detected.length ? "Из комментария оператора" : "Первая оплата" }).select("id").maybeSingle();
      if (payment.error || !payment.data) { setBusy(false); say("Не удалось сохранить платёж. Проверьте права доступа."); return; }
    }
    const nextValues = { ...values, "Статус консультации": "student", "Последний изменивший": excelLeadEditedBy() };
    delete nextValues[callbackTimeField];
    const updatedAt = new Date().toISOString();
    const updated = await db.from("custom_records").update({ values: nextValues, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle();
    if (updated.error || !updated.data) { setBusy(false); say("Не удалось сохранить. Проверьте права доступа."); return; }
    await cancelCallbackReminders(record.id);
    record.values = nextValues; record.updated_at = updatedAt;
    studentSummary.set(record.id, { price: priceValue, paid: paidValue });
    rememberStudentPrice(priceValue);
    finish(); toast("Карточка ученика создана");
    onChange("student");
    openStudentCard(tab, record, onChange);
  };
  dialog.showModal();
}
async function openStudentCard(tab, record, onChange) {
  const values = record.values || {};
  const dialog = studentDialogShell("studentCardDialog", "student-dialog student-card");
  dialog.innerHTML = '<form method="dialog" class="callback-form"><h2>Карточка ученика</h2><p class="subtle student-lead"></p>'
    + '<div class="student-tiles"><div><span>Цена</span><b id="studentTilePrice">—</b></div><div><span>Оплачено</span><b id="studentTilePaid">—</b></div><div class="student-tile-debt"><span>Долг</span><b id="studentTileDebt">—</b></div></div>'
    + '<div class="student-progress" aria-hidden="true"><i id="studentBar"></i></div>'
    + '<label class="callback-calendar"><span>Цена курса (so‘m)</span><span class="student-inline"><input type="text" inputmode="numeric" id="studentCardPrice" autocomplete="off"><button type="button" class="button secondary" id="studentSavePrice">Сохранить цену</button></span></label>'
    + '<h3 class="student-subtitle">Добавить платёж</h3>'
    + '<div class="student-add"><input type="text" inputmode="numeric" id="studentAmount" placeholder="Summa (so‘m)" autocomplete="off"><input type="text" id="studentNote" maxlength="200" placeholder="Izoh" autocomplete="off"><button type="button" class="button primary" id="studentAdd">Добавить</button></div>'
    + '<div class="callback-message hidden" id="studentCardMessage" role="status"></div>'
    + '<h3 class="student-subtitle">История платежей</h3><div id="studentPayments" class="student-payments"></div>'
    + '<div class="callback-actions"><button type="button" class="button secondary" id="studentCardClose">Закрыть</button></div></form>';
  fillStudentLead(dialog.querySelector(".student-lead"), values);
  document.body.appendChild(dialog);
  const q = (selector) => dialog.querySelector(selector);
  const say = (text) => { q("#studentCardMessage").textContent = text; q("#studentCardMessage").classList.toggle("hidden", !text); };
  const setBusy = (busy) => dialog.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  let priceFilled = false;
  const render = (payments) => {
    const info = studentSummary.get(record.id) || { price: 0, paid: 0 };
    const debt = Math.max(0, info.price - info.paid);
    q("#studentTilePrice").textContent = moneyText(info.price);
    q("#studentTilePaid").textContent = moneyText(info.paid);
    q("#studentTileDebt").textContent = debt > 0 ? moneyText(debt) : "Полностью оплачено";
    q(".student-tile-debt").classList.toggle("is-clear", debt === 0);
    q("#studentBar").style.width = Math.min(100, info.price ? Math.round(info.paid / info.price * 100) : 0) + "%";
    if (!priceFilled || document.activeElement !== q("#studentCardPrice")) { priceFilled = true; q("#studentCardPrice").value = String(info.price || ""); formatMoneyInput(q("#studentCardPrice")); }
    const list = q("#studentPayments");
    list.textContent = "";
    if (!payments.length) { const empty = document.createElement("p"); empty.className = "subtle"; empty.textContent = "Платежей пока нет."; list.appendChild(empty); return; }
    for (const payment of payments) {
      const row = document.createElement("div");
      row.className = "student-payment" + (payment.cancelled_at ? " is-cancelled" : "");
      const when = document.createElement("span"); when.textContent = callbackTimeText(payment.paid_at) || "";
      const amount = document.createElement("b"); amount.textContent = moneyText(payment.amount);
      const note = document.createElement("em"); note.textContent = payment.cancelled_at ? "Отменён" : payment.note || "";
      row.append(when, amount, note);
      if (!payment.cancelled_at) {
        const cancel = document.createElement("button");
        cancel.type = "button"; cancel.className = "student-payment-cancel"; cancel.title = "Отменить платёж"; cancel.setAttribute("aria-label", "Отменить платёж"); cancel.textContent = "✕";
        cancel.onclick = async () => {
          if (!window.confirm(state.language === "uz" ? uzText("Отменить этот платёж? Он останется в истории как отменённый.") : "Отменить этот платёж? Он останется в истории как отменённый.")) return;
          setBusy(true);
          const result = await db.from("student_payments").update({ cancelled_at: new Date().toISOString() }).eq("id", payment.id).select("id").maybeSingle();
          setBusy(false);
          if (result.error || !result.data) { say("Не удалось сохранить. Проверьте права доступа."); return; }
          toast("Платёж отменён"); await reload(); onChange();
        };
        row.appendChild(cancel);
      }
      list.appendChild(row);
    }
  };
  const reload = async () => {
    const [payments, student] = await Promise.all([
      db.from("student_payments").select("id,amount,paid_at,note,cancelled_at").eq("record_id", record.id).order("paid_at", { ascending: false }),
      db.from("lead_students").select("price").eq("record_id", record.id).maybeSingle(),
    ]);
    const rows = payments.data || [];
    studentSummary.set(record.id, { price: Number(student.data?.price) || 0, paid: rows.filter((row) => !row.cancelled_at).reduce((sum, row) => sum + Number(row.amount), 0) });
    render(rows);
  };
  [q("#studentCardPrice"), q("#studentAmount")].forEach((input) => input.addEventListener("blur", () => formatMoneyInput(input)));
  q("#studentCardClose").onclick = () => { dialog.close(); dialog.remove(); };
  q("#studentSavePrice").onclick = async () => {
    const price = moneyInputValue(q("#studentCardPrice"));
    if (!price) { say("Введите цену курса."); return; }
    setBusy(true);
    const result = await db.from("lead_students").update({ price, updated_at: new Date().toISOString() }).eq("record_id", record.id).select("record_id").maybeSingle();
    setBusy(false);
    if (result.error || !result.data) { say("Не удалось сохранить. Проверьте права доступа."); return; }
    say(""); rememberStudentPrice(price); toast("Цена сохранена"); await reload(); onChange();
  };
  q("#studentAdd").onclick = async () => {
    const amount = moneyInputValue(q("#studentAmount"));
    if (!amount) { say("Введите сумму платежа."); return; }
    setBusy(true);
    const result = await db.from("student_payments").insert({ record_id: record.id, tab_id: tab.id, amount, note: q("#studentNote").value.trim().slice(0, 200) || null }).select("id").maybeSingle();
    setBusy(false);
    if (result.error || !result.data) { say("Не удалось сохранить платёж. Проверьте права доступа."); return; }
    say(""); q("#studentAmount").value = ""; q("#studentNote").value = "";
    toast("Платёж добавлен"); await reload(); onChange();
  };
  dialog.showModal();
  await reload();
}
// ---------- Дашборд: лиды, ученики, деньги, долги ----------
const dashboardState = { period: "all" };
const dashboardStatusLabels = [
  ["new", "Без статуса"], ["no_answer", "Не ответили"], ["callback", "Перезвонить"],
  ["booked", "Записались"], ["attended", "Пришли"], ["student", "Стали учениками"],
];
function dashboardEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function dashboardSince(period) {
  if (period === "today") return tashkentDayAt(0, 0).getTime();
  if (period === "7") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (period === "30") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}
function tashkentDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(date);
}
function dashboardTile(label, value, sub, tone) {
  const tile = dashboardEl("div", "dash-tile" + (tone ? " is-" + tone : ""));
  tile.append(dashboardEl("span", "dash-tile-label", label), dashboardEl("b", "dash-tile-value", value), dashboardEl("small", "dash-tile-sub", sub));
  return tile;
}
async function renderDashboard() {
  const page = $("dashboardPage");
  if (!page) return;
  const tab = state.tabs.find((item) => item.name === excelLeadsTabName);
  page.textContent = "";
  const head = dashboardEl("div", "dash-head");
  const titles = dashboardEl("div");
  titles.append(dashboardEl("p", "eyebrow", "CRM · EXCEL"), dashboardEl("h1", "", "Дашборд"), dashboardEl("p", "subtle", "Лиды, ученики, поступления и долги по вкладке «Загрузка лидов через Excel»."));
  const controls = dashboardEl("div", "dash-controls");
  for (const [value, label] of [["today", "Сегодня"], ["7", "7 дней"], ["30", "30 дней"], ["all", "Всё время"]]) {
    const button = dashboardEl("button", "dash-period" + (dashboardState.period === value ? " is-active" : ""), label);
    button.type = "button";
    button.onclick = () => { dashboardState.period = value; renderDashboard(); };
    controls.appendChild(button);
  }
  const refresh = dashboardEl("button", "icon-button", "↻");
  refresh.type = "button"; refresh.setAttribute("aria-label", "Обновить"); refresh.onclick = () => renderDashboard();
  controls.appendChild(refresh);
  head.append(titles, controls);
  page.appendChild(head);
  if (!tab) { page.appendChild(dashboardEl("div", "empty-state", "Вкладка «Загрузка лидов через Excel» не найдена.")); return; }
  const loading = dashboardEl("div", "loading-row", "Загрузка…");
  page.appendChild(loading);
  const [records, students, payments] = await Promise.all([
    db.from("custom_records").select("id,values,created_at").eq("tab_id", tab.id),
    db.from("lead_students").select("record_id,price,created_at").eq("tab_id", tab.id),
    db.from("student_payments").select("id,record_id,amount,paid_at,note").eq("tab_id", tab.id).is("cancelled_at", null),
  ]);
  loading.remove();
  if (records.error || students.error || payments.error) { page.appendChild(dashboardEl("div", "message error", "Не удалось загрузить данные. Проверьте права доступа.")); return; }
  const since = dashboardSince(dashboardState.period);
  const leadRows = records.data || [], studentRows = students.data || [], paymentRows = payments.data || [];
  const recordById = new Map(leadRows.map((row) => [row.id, row]));
  const leadTime = (row) => Date.parse(row.values?.created_time || row.created_at || "") || 0;
  const leadsInPeriod = leadRows.filter((row) => leadTime(row) >= since).length;
  const studentsInPeriod = studentRows.filter((row) => Date.parse(row.created_at) >= since).length;
  const paidByRecord = new Map();
  for (const row of paymentRows) paidByRecord.set(row.record_id, (paidByRecord.get(row.record_id) || 0) + Number(row.amount));
  const moneyInPeriod = paymentRows.filter((row) => Date.parse(row.paid_at) >= since).reduce((sum, row) => sum + Number(row.amount), 0);
  const moneyTotal = paymentRows.reduce((sum, row) => sum + Number(row.amount), 0);
  const priceTotal = studentRows.reduce((sum, row) => sum + Number(row.price), 0);
  const debtors = studentRows.map((row) => ({ row, record: recordById.get(row.record_id), price: Number(row.price), paid: paidByRecord.get(row.record_id) || 0 }))
    .map((item) => ({ ...item, debt: Math.max(0, item.price - item.paid) })).filter((item) => item.debt > 0).sort((a, b) => b.debt - a.debt);
  const debtTotal = debtors.reduce((sum, item) => sum + item.debt, 0);
  const conversion = leadRows.length ? Math.round(studentRows.length / leadRows.length * 1000) / 10 : 0;

  const tiles = dashboardEl("div", "dash-tiles");
  tiles.append(
    dashboardTile("Лиды", String(leadsInPeriod), "Всего: " + leadRows.length),
    dashboardTile("Ученики", String(studentsInPeriod), "Всего: " + studentRows.length, "good"),
    dashboardTile("Конверсия", conversion + "%", "Лид → ученик"),
    dashboardTile("Поступило", moneyText(moneyInPeriod), "Всего: " + moneyText(moneyTotal), "good"),
    dashboardTile("Долг", moneyText(debtTotal), "Должников: " + debtors.length, debtTotal ? "bad" : ""),
    dashboardTile("Сумма по ученикам", moneyText(priceTotal), "Оплачено " + (priceTotal ? Math.round(Math.min(moneyTotal, priceTotal) / priceTotal * 100) : 0) + "%"),
    dashboardTile("Опросы заполнены", leadRows.filter((row) => surveyProgress(row.values?.["Опрос"]).filled === 8).length + " / " + leadRows.length, "Нужно уточнить: " + leadRows.filter((row) => leadNeedsClarification(row.values)).length, "bad"),
  );
  page.appendChild(tiles);

  // Воронка лидов (по текущему статусу)
  const counts = Object.fromEntries(dashboardStatusLabels.map(([key]) => [key, 0]));
  for (const row of leadRows) {
    const status = String(row.values?.["Статус консультации"] || "new");
    counts[status in counts ? status : "new"]++;
  }
  const funnel = dashboardEl("section", "dash-card");
  funnel.appendChild(dashboardEl("h2", "", "Воронка лидов"));
  const maxCount = Math.max(1, ...Object.values(counts));
  for (const [key, label] of dashboardStatusLabels) {
    const row = dashboardEl("div", "dash-bar-row");
    const bar = dashboardEl("div", "dash-bar"), fill = dashboardEl("i", "is-" + key);
    fill.style.width = Math.round(counts[key] / maxCount * 100) + "%";
    bar.appendChild(fill);
    row.append(dashboardEl("span", "", label), bar, dashboardEl("b", "", String(counts[key])));
    funnel.appendChild(row);
  }
  // Поступления по дням (14 дней)
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(tashkentDateKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  const perDay = new Map(days.map((key) => [key, 0]));
  for (const row of paymentRows) { const key = tashkentDateKey(new Date(row.paid_at)); if (perDay.has(key)) perDay.set(key, perDay.get(key) + Number(row.amount)); }
  const chart = dashboardEl("section", "dash-card");
  chart.appendChild(dashboardEl("h2", "", "Поступления по дням"));
  const maxDay = Math.max(1, ...perDay.values());
  const columns = dashboardEl("div", "dash-columns");
  for (const [key, amount] of perDay) {
    const column = dashboardEl("div", "dash-column");
    const fill = dashboardEl("i"); fill.style.height = Math.max(amount ? 4 : 0, Math.round(amount / maxDay * 100)) + "%";
    fill.title = key.slice(5).split("-").reverse().join(".") + " · " + moneyText(amount);
    column.append(fill, dashboardEl("small", "", key.slice(8)));
    columns.appendChild(column);
  }
  chart.appendChild(columns);
  const twoCols = dashboardEl("div", "dash-two");
  twoCols.append(funnel, chart);
  page.appendChild(twoCols);

  // Долги
  const debts = dashboardEl("section", "dash-card");
  debts.appendChild(dashboardEl("h2", "", "Крупнейшие долги"));
  if (!debtors.length) debts.appendChild(dashboardEl("p", "subtle", "Долгов нет."));
  for (const item of debtors.slice(0, 10)) {
    const row = dashboardEl("button", "dash-row"); row.type = "button";
    const who = dashboardEl("span", "dash-row-main");
    who.append(dashboardEl("b", "", String(item.record?.values?.["Имя"] || "Без имени")), dashboardEl("small", "", String(item.record?.values?.["Телефон"] || "—")));
    row.append(who, dashboardEl("span", "dash-row-sub", moneyText(item.paid) + " / " + moneyText(item.price)), dashboardEl("b", "dash-row-debt", moneyText(item.debt)));
    row.onclick = () => { if (item.record) openStudentCard(tab, item.record, () => renderDashboard()); };
    debts.appendChild(row);
  }
  // Последние платежи
  const recent = dashboardEl("section", "dash-card");
  recent.appendChild(dashboardEl("h2", "", "Последние платежи"));
  const lastPayments = [...paymentRows].sort((a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at)).slice(0, 8);
  if (!lastPayments.length) recent.appendChild(dashboardEl("p", "subtle", "Платежей пока нет."));
  for (const payment of lastPayments) {
    const record = recordById.get(payment.record_id);
    const row = dashboardEl("div", "dash-row is-static");
    const who = dashboardEl("span", "dash-row-main");
    who.append(dashboardEl("b", "", String(record?.values?.["Имя"] || "Без имени")), dashboardEl("small", "", callbackTimeText(payment.paid_at) + (payment.note ? " · " + payment.note : "")));
    row.append(who, dashboardEl("b", "dash-row-paid", moneyText(payment.amount)));
    recent.appendChild(row);
  }
  const lists = dashboardEl("div", "dash-two");
  lists.append(debts, recent);
  page.appendChild(lists);
}
// ---------- Skript va reglament: скрипт продаж и регламент (правится прямо в CRM) ----------
const scriptTabName = "Skript va reglament";
const scriptDefault = {
  "meta": {
    "version": "1.0 — qoralama (loyiha)",
    "note": "Yangi lidlar uchun amal qiladi. Skript va reglament joriy etilguniga qadar kelgan lidlar eski tartibda qoladi. [TO‘LDIRING] belgisi turgan joylarni rahbar to‘ldiradi."
  },
  "sections": [
    [
      "Konstitutsiya: 10 qoida",
      "Bizning maqsadimiz: har bir lid bilan aniq natijaga chiqish — uchrashuv, to‘lov yoki aniq qayta aloqa vaqti. «Keyinroq» degan javob bilan ishni tugatmaymiz.\n\n1. Tezlik. Yangi lidga 5 daqiqa ichida qo‘ng‘iroq qilamiz (ish vaqtida). 15 daqiqadan keyin lid sovib ketadi.\n2. Bitta qo‘ng‘iroq — bitta aniq keyingi qadam: uchrashuv kuni va soati, to‘lov sanasi yoki qayta aloqa vaqti. Vaqtsiz kelishuv kelishuv emas.\n3. Avval so‘raymiz, keyin gapiramiz. Suhbatning kamida yarmini ota-ona gapiradi.\n4. Faqat haqiqatni aytamiz. Narx, muddat, natija haqida to‘qib va’da bermaymiz. Bilmasak: «Aniqlab, soat 17:00 gacha aytaman».\n5. Bola emas, ota-ona qaror qiladi. Qaror qiluvchi kimligini bilib olamiz, kerak bo‘lsa ikkalasi bilan gaplashamiz.\n6. E’tirozni rad etmaymiz: tushunamiz → aniqlaymiz → javob beramiz → keyingi qadamga o‘tamiz.\n7. Javob bermagan lidni tashlab qo‘ymaymiz: 3 kunda 3 urinish (8-bo‘limga qarang).\n8. Har bir qo‘ng‘iroqdan keyin 10 daqiqa ichida CRMga natija yoziladi (10-bo‘lim shabloni).\n9. Pul masalasi ochiq: narx, to‘langan summa, qolgan qarz va muddat har doim yozilgan bo‘ladi.\n10. Tanqidga ochiqmiz. AI-murabbiy har bir yozuvni baholaydi va kamchilikni ko‘rsatadi; maqsad — ko‘proq o‘quvchi, kamroq yo‘qotilgan lid."
    ],
    [
      "Qo‘ng‘iroqdan oldin (2 daqiqa)",
      "- Lid anketasini oching: ism, ariza vaqti, qaysi formadan kelgan, avvalgi izohlar.\n- Agar lid takroriy bo‘lsa («Yuqori niyat» belgisi) — ota-ona bir necha marta ariza qoldirgan, tez va diqqat bilan qo‘ng‘iroq qiling.\n- Qo‘ng‘iroq maqsadini aniq belgilang: bugun nimaga erishamiz? (uchrashuv / to‘lov / qaror).\n- Qo‘lingizda bo‘lsin: kurs dasturi, jadval, narx va aksiya shartlari [TO‘LDIRING], bo‘sh joylar soni.\n- Tinch joy, ochiq CRM, qalam va qog‘oz."
    ],
    [
      "1-bosqich. Salomlashish va ruxsat (10–15 soniya)",
      "Maqsad: kim ekanligimizni ayting, qo‘ng‘iroq sababini eslating va gaplashish uchun ruxsat oling.\n\n> «Assalomu alaykum, [Ism] aka/opa? Men Yosh Blogerlar Akademiyasidan [Ismingiz]man. Siz [sana] kuni farzandingizning blogerlik kursi bo‘yicha ariza qoldirgan edingiz. Hozir 2 daqiqa gaplashish qulaymi?»\n\n- Qulay bo‘lmasa: «Qachon qo‘ng‘iroq qilsam bo‘ladi — bugun soat nechada?» — aniq vaqt oling va CRMda «Qayta aloqa» qo‘ying.\n- Yolg‘iz gapirmang: salomdan keyin to‘xtab, javobni kuting."
    ],
    [
      "2-bosqich. Aniqlashtiruvchi savollar (3–5 daqiqa)",
      "Maqsad: oilaning haqiqiy ehtiyojini, qaror qiluvchini va to‘siqlarni bilish. Javoblarni darhol yozib boring.\n\nMajburiy savollar:\n1. Farzandingizning ismi va yoshi?\n2. U hozir telefon, video, Instagram/Telegram bilan qiziqadimi? Nima qiladi?\n3. Nega blogerlik kursini ko‘rmoqchisiz? Nimaga erishsin deysiz? (ishonch, so‘zlash, hunar, bo‘sh vaqtni foydali o‘tkazish...)\n4. Avval shunga o‘xshash kursga qatnashganmi? Nima yoqdi / yoqmadi?\n5. Qaror qabul qilishda kim ishtirok etadi (ota, ona, boshqalar)?\n6. Qachon boshlashni xohlaysiz? Haftasiga qaysi kunlari/soatlari qulay?\n\nChuqurlashtirish:\n- «Buni batafsilroq aytib bera olasizmi?»\n- «Bu siz uchun nima uchun muhim?»\n- «Agar hal bo‘lmasa, nima o‘zgaradi?»\n\nEslatma: narxni ota-ona so‘ramaguncha aytmang; so‘rasa — avval qiymatni, keyin narxni ayting."
    ],
    [
      "3-bosqich. Qisqa taqdimot (30–60 soniya)",
      "Maqsad: kursni aynan shu oilaning javoblariga bog‘lab, 3 ta foyda ko‘rsatish. Uzun ma’ruza qilmang.\n\n> «Siz [farzand ismi] [2-savol javobi] bilan qiziqishini va [3-savol javobi] ni xohlayotganingizni aytdingiz. Bizning kursda aynan shu uchun: [1-foyda], [2-foyda], [3-foyda] bor.»\n\nKurs bo‘yicha faktlar (rahbar to‘ldiradi):\n- Dastur va natijalar: [TO‘LDIRING]\n- Davomiyligi va jadval: [TO‘LDIRING]\n- Joy va guruh hajmi: [TO‘LDIRING]\n- Narx va aksiya shartlari, muddati: [TO‘LDIRING]\n\nQoida: taqdimotdan keyin savol bering: «Bu sizga mosmi?» — va javobni kuting."
    ],
    [
      "4-bosqich. Yopish: aniq keyingi qadam",
      "Maqsad: suhbatni har doim aniq qadam bilan tugatish. Ikki variantli tanlov bering.\n\n> «Keling, birinchi uchrashuvni belgilaymiz: ertaga soat 15:00 yoki payshanba soat 11:00 sizga qulayroqmi?»\n\nUchrashuv kelishilsa:\n- Kun, soat va manzilni takrorlang; kim keladi (ota yoki ona + farzand).\n- CRMda status: «Yozilgan». Eslatma qo‘ying: kelishilgan vaqtdan 2 soat oldin tasdiqlovchi qo‘ng‘iroq yoki xabar.\n\nTo‘lov kelishilsa:\n- Summa, usul (naqd / karta), sana va soatni aniq yozing. Qisman to‘lov bo‘lsa — qolgan summa va muddatni ham.\n\nQaror qilinmasa:\n- «Qaysi masala hal bo‘lsa, qaror qilasiz?» — to‘siqni aniqlang.\n- Aniq qayta aloqa vaqtini oling («3 soatdan keyin» emas, «ertaga 11:00»).\n- CRMda «Qayta aloqa» qo‘ying."
    ],
    [
      "E’tirozlar bilan ishlash",
      "Tartib har doim bir xil: 1) tushuning, 2) aniqlang, 3) javob bering, 4) keyingi qadamga qaytaring. Bahslashmang.\n\n«Qimmat»\n> «Tushunaman, bu muhim qaror. Siz nimaga solishtiryapsiz?» → qiymatni ayting (natija, dastur, nazorat) → «Agar narx muammo bo‘lmasa, kurs sizga mosmi?» → to‘lov usullari [TO‘LDIRING].\n\n«O‘ylab ko‘raman»\n> «Albatta. Qaysi jihatni o‘ylamoqchisiz — narx, jadval yoki kurs mazmuni?» → aniq to‘siqni hal qiling → qayta aloqaning aniq vaqtini oling.\n\n«Er/xotinim bilan maslahatlashaman»\n> «Juda yaxshi. Ikkalangiz birga uchrashuvga kelsangiz, savollarga to‘liq javob beramiz. Qaysi kun ikkalangizga qulay?»\n\n«Bolamning vaqti yo‘q»\n> «Dars kunlari va vaqtini ayting — jadvalga mos variant bor-yo‘qligini ko‘ramiz.» Jadval variantlari: [TO‘LDIRING].\n\n«Ishonmayman / bola uddalay olmasa»\n> «Tushunaman. Shuning uchun birinchi uchrashuvda farzandingiz bilan tanishamiz va uning imkoniyatini ko‘rasiz.» (faqat haqiqatan mavjud bo‘lgan shartlarni ayting)\n\n«Boshqa joyga qaradik»\n> «Yaxshi. Nimaga e’tibor berdingiz? Nimasi yoqdi?» → farqimizni haqiqiy faktlar bilan ayting."
    ],
    [
      "Javob bermagan lid: 3 urinish tizimi",
      "Maqsad: lidni yo‘qotmaslik, lekin bezovta qilmaslik.\n\n- 1-urinish: darhol. Javob bo‘lmasa — CRMda «Javob bermagan», izohga urinish vaqtini yozing.\n- Xabar (Telegram/SMS) darhol: «Assalomu alaykum! Yosh Blogerlar Akademiyasidan yozmoqdaman. Farzandingizning blogerlik kursi bo‘yicha qo‘ng‘iroq qildim. Qachon gaplashish qulay?»\n- 2-urinish: 3 soatdan keyin (CRMda «Qayta aloqa» → «3 soatdan keyin»).\n- 3-urinish: ertasi kuni 10:00 va yana bir marta 17:00 (boshqa vaqt oralig‘ida).\n- 3 kun ichida 3 urinish va 1 xabar. Javob bo‘lmasa — izohga «3 urinish bajarildi» deb yozing va lidni arxivlang. Lid keyin o‘zi yozsa, qaytadan ochiladi.\n\nMuhim: har bir urinish izohda sana va vaqti bilan yozilgan bo‘lishi shart."
    ],
    [
      "Uchrashuvdan keyin va to‘lov",
      "Keldi:\n- Uchrashuv natijasini yozing: nima ko‘rsatildi, ota-ona va farzand reaktsiyasi, qaror.\n- To‘lovni darhol taklif qiling: «Bugun joyni band qilib qo‘ysak bo‘ladimi?» — summa va usulni ayting.\n\nTo‘lov bo‘ldi:\n- CRMda «O‘quvchi bo‘ldi» → kartada narx va to‘langan summani kiriting.\n- Qisman to‘lov: qolgan summa va aniq muddatni yozing, shu sanaga eslatma qo‘ying.\n\nKelmadi:\n- Darhol qo‘ng‘iroq: «Nima bo‘ldi, yangi vaqt belgilaymizmi?» Statusni «Qayta aloqa»ga o‘tkazing."
    ],
    [
      "Qo‘ng‘iroqdan keyin CRMga yozish shabloni",
      "Har bir qo‘ng‘iroqdan keyin 10 daqiqa ichida «Oxirgi qo‘ng‘iroq natijasi» maydoniga yozing. Har bandni to‘ldiring — AI-murabbiy yetishmayotgan bandni tanqid qiladi.\n\n1) Kim bilan gaplashildi: ota / ona / boshqa.\n2) Farzand: ism, yosh, qiziqishi.\n3) Maqsad (nega kerak) — ota-onaning o‘z so‘zlari bilan.\n4) Qaror qiluvchi kim.\n5) E’tiroz: nima va nima javob berildi.\n6) Kelishuv: aniq qadam + kun va soat.\n7) To‘lov: narx / to‘langan / qolgan / muddat.\n8) Keyingi qo‘ng‘iroq: sana va soat.\n\nMisol: «Ona bilan. Ali, 10 yosh, video tushishga qiziqadi. Maqsad: kamerada tortinmasin. Qaror: ota-ona birga. E’tiroz: narx — uchrashuvda ko‘rishga kelishildi. Kelishuv: ertaga 15:00 uchrashuv. To‘lov: hali yo‘q. Keyingi qo‘ng‘iroq: ertaga 12:00 tasdiqlash.»"
    ],
    [
      "Man etiladi",
      "- Narx, muddat yoki natija haqida to‘qib va’da berish.\n- Bosim o‘tkazish, ota-onani aldash, «oxirgi joy» deb yolg‘on gapirish.\n- Aniq vaqtsiz «keyinroq qo‘ng‘iroq qilaman» deb tugatish.\n- Natijani CRMga yozmasdan keyingi qo‘ng‘iroqqa o‘tish.\n- Ota-onaning shaxsiy ma’lumotlarini begonalarga yoki ochiq chatlarga yuborish.\n- Raqibni yomonlash."
    ],
    [
      "Nazorat va AI-murabbiy",
      "- Har bir yangi natija yozuvi AI-murabbiy tomonidan baholanadi: lid harorati, aniq qadam va tanqid (nima yetishmadi).\n- Rahbar haftasiga bir marta ko‘radi: nechta lid, nechta uchrashuv, nechta o‘quvchi, qancha pul, qancha qarz (Dashboard).\n- Ko‘rsatkichlar: 5 daqiqada qo‘ng‘iroq qilingan lidlar ulushi, har bir lidda aniq keyingi qadam bo‘lgani, to‘liq to‘ldirilgan natija yozuvlari ulushi, lid → o‘quvchi konversiyasi.\n- Reglament o‘zgarsa, yangi versiya shu sahifada yangilanadi va bosib chiqariladi."
    ]
  ]
};
function isScriptTab(tab) { return tab?.name === scriptTabName; }
async function ensureScriptTab() {
  const existing = state.tabs.find(isScriptTab);
  if (existing || !state.crmRole) return existing || null;
  const made = await db.from("custom_tabs").insert({
    name: scriptTabName, icon: "§",
    fields: [{ name: "Раздел", type: "text" }, { name: "Порядок", type: "text" }, { name: "Текст", type: "textarea" }],
    viewer_roles: ["owner", "manager", "admin"], editor_roles: ["owner", "manager", "admin"],
  }).select("*").single();
  if (made.error || !made.data) return null;
  state.tabs.push(made.data);
  const rows = [{ "Раздел": "__meta", "Версия": scriptDefault.meta.version, "Заметка": scriptDefault.meta.note }]
    .concat(scriptDefault.sections.map((section, index) => ({ "Раздел": section[0], "Порядок": String(index + 1), "Текст": section[1] })));
  await db.from("custom_records").insert(rows.map((values) => ({ tab_id: made.data.id, values })));
  renderCustomTabs();
  return made.data;
}
function scriptInline(parent, text) {
  String(text).split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) { const strong = document.createElement("strong"); strong.textContent = part.slice(2, -2); parent.appendChild(strong); }
    else if (part) parent.appendChild(document.createTextNode(part));
  });
}
// Мини-разметка: «- » список, «1. » нумерованный список, «> » фраза для разговора, пустая строка — новый абзац.
function renderScriptBody(text) {
  const box = document.createElement("div");
  box.className = "script-body";
  const lines = String(text || "").split("\n");
  let block = null, kind = "";
  const flush = () => { if (block) box.appendChild(block); block = null; kind = ""; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let match;
    if ((match = /^\s*[-•]\s+(.*)$/.exec(line))) {
      if (kind !== "ul") { flush(); block = document.createElement("ul"); kind = "ul"; }
      const item = document.createElement("li"); scriptInline(item, match[1]); block.appendChild(item);
    } else if ((match = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      if (kind !== "ol") { flush(); block = document.createElement("ol"); kind = "ol"; }
      const item = document.createElement("li"); scriptInline(item, match[1]); block.appendChild(item);
    } else if ((match = /^\s*>\s?(.*)$/.exec(line))) {
      if (kind !== "quote") { flush(); block = document.createElement("blockquote"); kind = "quote"; }
      if (block.childNodes.length) block.appendChild(document.createElement("br"));
      scriptInline(block, match[1]);
    } else {
      if (kind !== "p") { flush(); block = document.createElement("p"); kind = "p"; }
      if (block.childNodes.length) block.appendChild(document.createElement("br"));
      scriptInline(block, line.trim());
    }
  }
  flush();
  return box;
}
function openScriptEditor(tab, record, onDone, isMeta = false) {
  document.getElementById("scriptEditDialog")?.remove();
  const values = record?.values || {};
  const dialog = document.createElement("dialog");
  dialog.id = "scriptEditDialog"; dialog.className = "callback-dialog script-dialog";
  dialog.addEventListener("cancel", () => dialog.remove());
  const form = document.createElement("form"); form.method = "dialog"; form.className = "callback-form";
  const title = document.createElement("h2"); title.textContent = isMeta ? "Изменить версию" : record ? "Изменить раздел" : "Добавить раздел";
  form.appendChild(title);
  const field = (label, control) => { const wrap = document.createElement("label"); wrap.className = "callback-calendar"; const span = document.createElement("span"); span.textContent = label; wrap.append(span, control); form.appendChild(wrap); return control; };
  const input = (value) => { const node = document.createElement("input"); node.type = "text"; node.maxLength = 200; node.value = value || ""; node.className = "script-input"; return node; };
  const area = (value, rows) => { const node = document.createElement("textarea"); node.rows = rows; node.value = value || ""; node.className = "script-input script-textarea"; return node; };
  let first, second;
  if (isMeta) { first = field("Версия", input(values["Версия"])); second = field("Заметка", area(values["Заметка"], 5)); }
  else { first = field("Название раздела", input(values["Раздел"])); second = field("Текст раздела", area(values["Текст"], 16)); }
  if (!isMeta) { const hint = document.createElement("p"); hint.className = "callback-hint"; hint.textContent = "Формат: «- » список, «1. » нумерация, «> » фраза для разговора, пустая строка — новый абзац."; form.appendChild(hint); }
  const message = document.createElement("div"); message.className = "callback-message hidden"; message.setAttribute("role", "status"); form.appendChild(message);
  const actions = document.createElement("div"); actions.className = "callback-actions";
  const save = document.createElement("button"); save.type = "button"; save.className = "button primary"; save.textContent = "Сохранить";
  const close = document.createElement("button"); close.type = "button"; close.className = "button secondary"; close.textContent = "Закрыть";
  actions.append(save, close); form.appendChild(actions);
  dialog.appendChild(form); document.body.appendChild(dialog);
  const finish = () => { dialog.close(); dialog.remove(); };
  close.onclick = finish;
  save.onclick = async () => {
    const headline = first.value.trim();
    if (!headline) { message.textContent = isMeta ? "Укажите версию." : "Укажите название раздела."; message.classList.remove("hidden"); return; }
    save.disabled = true;
    let nextValues;
    if (isMeta) nextValues = { ...values, "Раздел": "__meta", "Версия": headline.slice(0, 120), "Заметка": second.value.trim().slice(0, 1000) };
    else nextValues = { ...values, "Раздел": headline.slice(0, 200), "Текст": second.value.slice(0, 12000), "Порядок": values["Порядок"] || String(onDone.nextOrder || 1) };
    const result = record
      ? await db.from("custom_records").update({ values: nextValues, updated_at: new Date().toISOString() }).eq("id", record.id).select("id").maybeSingle()
      : await db.from("custom_records").insert({ tab_id: tab.id, values: nextValues }).select("id").maybeSingle();
    save.disabled = false;
    if (result.error || !result.data) { message.textContent = "Не удалось сохранить. Проверьте права доступа."; message.classList.remove("hidden"); return; }
    finish(); toast("Раздел сохранён"); onDone();
  };
  dialog.showModal();
}
async function renderScriptPage() {
  const page = $("scriptPage");
  if (!page) return;
  page.textContent = "";
  const loading = document.createElement("div"); loading.className = "loading-row"; loading.textContent = "Загрузка…"; page.appendChild(loading);
  const tab = await ensureScriptTab();
  if (!tab) { loading.remove(); const note = document.createElement("div"); note.className = "message error"; note.textContent = "Не удалось загрузить скрипт. Проверьте права доступа."; page.appendChild(note); return; }
  const result = await db.from("custom_records").select("id,values,created_at").eq("tab_id", tab.id).order("created_at", { ascending: true });
  loading.remove();
  if (result.error) { const note = document.createElement("div"); note.className = "message error"; note.textContent = "Не удалось загрузить скрипт. Проверьте права доступа."; page.appendChild(note); return; }
  const canEdit = canManageCustomTab(tab);
  const records = result.data || [];
  const meta = records.find((record) => record.values?.["Раздел"] === "__meta");
  const sections = records.filter((record) => record.values?.["Раздел"] !== "__meta").sort((a, b) => (Number(a.values?.["Порядок"]) || 0) - (Number(b.values?.["Порядок"]) || 0));
  const refresh = () => renderScriptPage();
  const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const head = node("div", "script-head");
  const titles = node("div");
  titles.append(node("p", "eyebrow", "РЕГЛАМЕНТ"), node("h1", "", "Скрипт и регламент"));
  const badges = node("div", "script-badges");
  badges.append(node("span", "script-version", "Версия: " + String(meta?.values?.["Версия"] || "—")));
  titles.appendChild(badges);
  if (meta?.values?.["Заметка"]) titles.appendChild(node("p", "subtle script-note", String(meta.values["Заметка"])));
  const actions = node("div", "script-actions");
  const print = node("button", "button secondary", "Печать"); print.type = "button"; print.onclick = () => window.print();
  actions.appendChild(print);
  if (canEdit) {
    const editMeta = node("button", "button secondary", "Изменить версию"); editMeta.type = "button";
    editMeta.onclick = () => openScriptEditor(tab, meta || null, refresh, true);
    const add = node("button", "button primary", "Добавить раздел"); add.type = "button";
    const nextOrder = sections.reduce((max, record) => Math.max(max, Number(record.values?.["Порядок"]) || 0), 0) + 1;
    add.onclick = () => { const done = () => refresh(); done.nextOrder = nextOrder; openScriptEditor(tab, null, done); };
    actions.append(editMeta, add);
  }
  head.append(titles, actions);
  page.appendChild(head);
  if (!sections.length) { page.appendChild(node("div", "empty-state", "Разделов пока нет.")); return; }
  const toc = node("nav", "script-toc");
  toc.appendChild(node("b", "", "Содержание"));
  const list = node("ol");
  sections.forEach((record, index) => {
    const item = document.createElement("li"), link = node("a", "", String(record.values["Раздел"]));
    link.href = "#script-section-" + index;
    link.onclick = (event) => { event.preventDefault(); document.getElementById("script-section-" + index)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
    item.appendChild(link); list.appendChild(item);
  });
  toc.appendChild(list); page.appendChild(toc);
  sections.forEach((record, index) => {
    const card = node("article", "script-section"); card.id = "script-section-" + index;
    const top = node("div", "script-section-top");
    top.appendChild(node("h2", "", (index + 1) + ". " + String(record.values["Раздел"])));
    if (canEdit) {
      const tools = node("div", "script-tools");
      const tool = (label, title, handler, disabled) => { const button = node("button", "script-tool", label); button.type = "button"; button.title = title; button.setAttribute("aria-label", title); button.disabled = Boolean(disabled); button.onclick = handler; tools.appendChild(button); };
      const swap = async (other) => {
        const a = record.values["Порядок"], b = other.values["Порядок"];
        const first = await db.from("custom_records").update({ values: { ...record.values, "Порядок": String(b) } }).eq("id", record.id).select("id").maybeSingle();
        const second = await db.from("custom_records").update({ values: { ...other.values, "Порядок": String(a) } }).eq("id", other.id).select("id").maybeSingle();
        if (first.error || second.error) toast("Не удалось сохранить. Проверьте права доступа.");
        refresh();
      };
      tool("▲", "Выше", () => swap(sections[index - 1]), index === 0);
      tool("▼", "Ниже", () => swap(sections[index + 1]), index === sections.length - 1);
      tool("✎", "Изменить", () => openScriptEditor(tab, record, refresh));
      tool("✕", "Удалить", async () => {
        if (!window.confirm(state.language === "uz" ? uzText("Удалить этот раздел скрипта? Это действие нельзя отменить.") : "Удалить этот раздел скрипта? Это действие нельзя отменить.")) return;
        const removed = await db.from("custom_records").delete().eq("id", record.id).select("id").maybeSingle();
        if (removed.error || !removed.data) { toast("Не удалось удалить. Проверьте права доступа."); return; }
        toast("Раздел удалён"); refresh();
      });
      top.appendChild(tools);
    }
    card.appendChild(top);
    card.appendChild(renderScriptBody(record.values["Текст"]));
    page.appendChild(card);
  });
}
// ---------- Опрос по звонку (по шаблону из вкладки «Skript va reglament») ----------
const surveyOptions = {
  who: ["Ota", "Ona", "Boshqa"],
  interests: ["Video", "Instagram", "Telegram", "O‘yinlar", "Rasm/dizayn", "Boshqa"],
  goal: ["Ishonch", "Notiq nutq", "Hunar/daromad", "Bo‘sh vaqt", "Boshqa"],
  decider: ["Ota", "Ona", "Ikkalasi", "Boshqa"],
  objection: ["Yo‘q", "Narx", "O‘ylab ko‘raman", "Er/xotin bilan maslahat", "Vaqt yo‘q", "Ishonmayman", "Boshqa joy"],
  outcome: ["Uchrashuv belgilandi", "To‘lov qildi", "Qayta aloqa", "Rad etdi", "Javob bermadi"],
};
const surveyItemNames = ["Kim bilan gaplashildi", "Farzand", "Maqsad", "Qaror qiluvchi", "E’tiroz", "Kelishuv", "To‘lov", "Keyingi qo‘ng‘iroq"];
// Сколько из 8 пунктов шаблона заполнено; «Javob bermadi» — короткий сценарий: нужен только следующий звонок.
function surveyProgress(survey) {
  if (!survey || typeof survey !== "object") return { filled: 0, total: 8, missing: surveyItemNames.slice(), started: false };
  const done = [];
  if (survey.outcome === "Javob bermadi") {
    for (let i = 0; i < 7; i++) done.push(true);
    done.push(Boolean(survey.nextCallAt));
  } else {
    done.push(Boolean(survey.who));
    done.push(Boolean(survey.childName && survey.childAge));
    done.push(Boolean((survey.goal && survey.goal.length) || survey.goalText));
    done.push(Boolean(survey.decider));
    done.push(Boolean(survey.objection && survey.objection.length));
    done.push(Boolean(survey.outcome) && (survey.outcome !== "Uchrashuv belgilandi" || Boolean(survey.meetingAt)));
    done.push(Number(survey.price) > 0 || Boolean(survey.payNA));
    done.push(Boolean(survey.nextCallAt) || survey.outcome === "To‘lov qildi" || survey.outcome === "Rad etdi");
  }
  return { filled: done.filter(Boolean).length, total: 8, missing: surveyItemNames.filter((_, index) => !done[index]), started: true };
}
// Лиду нужно уточнение: опроса нет и комментарий короткий, либо опрос заполнен не полностью.
function leadNeedsClarification(values) {
  const survey = values?.["Опрос"];
  if (!survey) return String(values?.["Результат последнего звонка"] || "").trim().length < 40;
  return surveyProgress(survey).filled < 8;
}
function surveyDateText(iso) { return iso ? callbackTimeText(iso) : ""; }
function composeSurveyText(s) {
  const dash = "—";
  const join = (list) => (list && list.length ? list.join(", ") : dash);
  if (s.outcome === "Javob bermadi") {
    return ["Javob bermadi." + (s.note ? " " + s.note : ""), "Keyingi qo‘ng‘iroq: " + (surveyDateText(s.nextCallAt) || dash) + "."].join("\n");
  }
  const money = (value) => (Number(value) > 0 ? moneyText(Number(value)) : dash);
  const debt = Number(s.price) > 0 ? moneyText(Math.max(0, Number(s.price) - Number(s.paid || 0))) : dash;
  return [
    "Kim bilan: " + (s.who || dash) + ".",
    "Farzand: " + (s.childName || dash) + ", " + (s.childAge ? s.childAge + " yosh" : "yoshi " + dash) + "; qiziqishi: " + join(s.interests) + ".",
    "Maqsad: " + join(s.goal) + (s.goalText ? " — «" + s.goalText + "»" : "") + ".",
    "Qaror qiluvchi: " + (s.decider || dash) + ".",
    "E’tiroz: " + join(s.objection) + (s.objectionAnswer ? " — javob: " + s.objectionAnswer : "") + ".",
    "Kelishuv: " + (s.outcome || dash) + (s.meetingAt ? " — " + surveyDateText(s.meetingAt) : "") + ".",
    "To‘lov: " + (s.payNA ? "muhokama qilinmadi" : "narx " + money(s.price) + ", to‘langan " + money(s.paid) + ", qolgan " + debt + (s.payDue ? ", muddat " + s.payDue : "")) + ".",
    "Keyingi qo‘ng‘iroq: " + (surveyDateText(s.nextCallAt) || dash) + ".",
    s.note ? "Izoh: " + s.note : "",
  ].filter(Boolean).join("\n");
}
function surveyChips(options, { multi = false, value = [], onChange = () => {} } = {}) {
  const wrap = dashboardEl("div", "survey-chips");
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const buttons = options.map((label) => {
    const button = dashboardEl("button", "survey-chip", label);
    button.type = "button";
    button.onclick = () => {
      if (selected.has(label)) selected.delete(label); else { if (!multi) selected.clear(); selected.add(label); }
      sync(); onChange(get());
    };
    wrap.appendChild(button);
    return button;
  });
  const sync = () => buttons.forEach((button) => { const on = selected.has(button.textContent); button.classList.toggle("is-on", on); button.setAttribute("aria-pressed", String(on)); });
  const get = () => (multi ? [...selected] : [...selected][0] || "");
  sync();
  return { el: wrap, get };
}
function openSurveyDialog(tab, record, onChange) {
  const values = record.values || {};
  const previous = values["Опрос"] && typeof values["Опрос"] === "object" ? values["Опрос"] : null;
  const oldNote = String(values["Результат последнего звонка"] || "").trim();
  const hint = previous ? null : extractPaymentHint(oldNote);
  document.getElementById("surveyDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "surveyDialog"; dialog.className = "callback-dialog survey-dialog";
  dialog.addEventListener("cancel", () => dialog.remove());
  const form = dashboardEl("form", "callback-form"); form.method = "dialog"; form.onsubmit = (event) => event.preventDefault();
  const head = dashboardEl("div"); head.append(dashboardEl("h2", "", "Опрос по звонку"));
  const lead = dashboardEl("p", "subtle student-lead-box"); fillStudentLead(lead, values); head.appendChild(lead);
  form.appendChild(head);
  if (!previous && oldNote) {
    const box = dashboardEl("details", "survey-old");
    box.append(dashboardEl("summary", "", "Прежний комментарий"), dashboardEl("p", "", oldNote));
    form.appendChild(box);
  }
  const block = (title) => { const node = dashboardEl("section", "survey-block"); node.appendChild(dashboardEl("h3", "", title)); form.appendChild(node); return node; };
  const input = (type, value, placeholder, extra = {}) => { const node = document.createElement("input"); node.type = type; node.value = value ?? ""; if (placeholder) node.placeholder = placeholder; node.className = "script-input"; Object.assign(node, extra); return node; };
  const p = previous || {};
  const sectionOutcome = block("Результат звонка");
  const outcome = surveyChips(surveyOptions.outcome, { value: p.outcome, onChange: () => refresh() });
  sectionOutcome.appendChild(outcome.el);
  const meetingWrap = dashboardEl("label", "callback-calendar"); meetingWrap.appendChild(dashboardEl("span", "", "Дата и время встречи"));
  const meeting = input("datetime-local", p.meetingAt ? tashkentInputValue(new Date(p.meetingAt)) : ""); meeting.min = tashkentInputValue(new Date());
  meetingWrap.appendChild(meeting); sectionOutcome.appendChild(meetingWrap);
  const full = dashboardEl("div", "survey-full"); form.appendChild(full);
  const fullBlock = (title) => { const node = dashboardEl("section", "survey-block"); node.appendChild(dashboardEl("h3", "", title)); full.appendChild(node); return node; };
  const who = surveyChips(surveyOptions.who, { value: p.who, onChange: () => refresh() }); fullBlock("1. Кто говорил").appendChild(who.el);
  const childBlock = fullBlock("2. Ребёнок");
  const row = dashboardEl("div", "survey-row");
  const childName = input("text", p.childName || "", "Ismi"); childName.maxLength = 60;
  const childAge = input("number", p.childAge || "", "Yoshi"); childAge.min = 3; childAge.max = 25;
  row.append(childName, childAge); childBlock.appendChild(row);
  const interests = surveyChips(surveyOptions.interests, { multi: true, value: p.interests || [], onChange: () => refresh() }); childBlock.appendChild(interests.el);
  const goalBlock = fullBlock("3. Цель");
  const goal = surveyChips(surveyOptions.goal, { multi: true, value: p.goal || [], onChange: () => refresh() }); goalBlock.appendChild(goal.el);
  const goalText = input("text", p.goalText || "", "Ota-onaning o‘z so‘zlari bilan"); goalText.maxLength = 200; goalBlock.appendChild(goalText);
  const decider = surveyChips(surveyOptions.decider, { value: p.decider, onChange: () => refresh() }); fullBlock("4. Кто решает").appendChild(decider.el);
  const objectionBlock = fullBlock("5. Возражение");
  const objection = surveyChips(surveyOptions.objection, { multi: true, value: p.objection || [], onChange: () => refresh() }); objectionBlock.appendChild(objection.el);
  const objectionAnswer = input("text", p.objectionAnswer || "", "Qanday javob berildi?"); objectionAnswer.maxLength = 300; objectionBlock.appendChild(objectionAnswer);
  const payBlock = fullBlock("7. Оплата");
  const payRow = dashboardEl("div", "survey-row");
  const price = input("text", p.price || (hint?.price ?? "") || rememberedStudentPrice() || "", "Narx (so‘m)"); price.inputMode = "numeric";
  const paid = input("text", p.paid || hint?.paid || "", "To‘langan (so‘m)"); paid.inputMode = "numeric";
  payRow.append(price, paid); payBlock.appendChild(payRow);
  [price, paid].forEach((node) => { formatMoneyInput(node); node.addEventListener("blur", () => { formatMoneyInput(node); refresh(); }); });
  const payDue = input("date", p.payDue || ""); const payDueLabel = dashboardEl("label", "callback-calendar"); payDueLabel.append(dashboardEl("span", "", "Срок оплаты остатка"), payDue); payBlock.appendChild(payDueLabel);
  const payNALabel = dashboardEl("label", "survey-check"); const payNA = document.createElement("input"); payNA.type = "checkbox"; payNA.checked = Boolean(p.payNA);
  payNA.onchange = () => refresh(); payNALabel.append(payNA, document.createTextNode(" Оплата не обсуждалась")); payBlock.appendChild(payNALabel);
  const nextBlock = block("8. Следующий звонок");
  const nextPresets = dashboardEl("div", "callback-presets");
  const next = input("datetime-local", p.nextCallAt ? tashkentInputValue(new Date(p.nextCallAt)) : ""); next.min = tashkentInputValue(new Date());
  [["Через 3 часа", () => new Date(Date.now() + 3 * 3600000)], ["Через 5 часов", () => new Date(Date.now() + 5 * 3600000)], ["Завтра 10:00", () => tashkentDayAt(1, 10)], ["Послезавтра 10:00", () => tashkentDayAt(2, 10)]].forEach(([label, make]) => {
    const button = dashboardEl("button", "", label); button.type = "button"; button.onclick = () => { next.value = tashkentInputValue(make()); refresh(); }; nextPresets.appendChild(button);
  });
  const nextLabel = dashboardEl("label", "callback-calendar"); nextLabel.append(dashboardEl("span", "", "Другая дата и время"), next);
  nextBlock.append(nextPresets, nextLabel);
  const noteBlock = block("Заметка оператора");
  const note = document.createElement("textarea"); note.className = "script-input script-textarea"; note.rows = 3; note.maxLength = 600; note.value = p.note || ""; note.placeholder = "Qo‘shimcha izoh"; noteBlock.appendChild(note);
  const progress = dashboardEl("p", "survey-progress");
  const message = dashboardEl("div", "callback-message hidden"); message.setAttribute("role", "status");
  const actions = dashboardEl("div", "callback-actions");
  const save = dashboardEl("button", "button primary", "Сохранить опрос"); save.type = "button";
  const close = dashboardEl("button", "button secondary", "Закрыть"); close.type = "button";
  actions.append(save, close);
  form.append(progress, message, actions);
  dialog.appendChild(form); document.body.appendChild(dialog);

  const collect = () => {
    const o = outcome.get();
    const toIso = (node) => (node.value ? new Date(node.value + ":00+05:00").toISOString() : "");
    return {
      outcome: o, who: who.get(), childName: childName.value.trim(), childAge: Number(childAge.value) || 0, interests: interests.get(),
      goal: goal.get(), goalText: goalText.value.trim(), decider: decider.get(), objection: objection.get(), objectionAnswer: objectionAnswer.value.trim(),
      meetingAt: o === "Uchrashuv belgilandi" ? toIso(meeting) : "", price: moneyInputValue(price), paid: moneyInputValue(paid), payDue: payDue.value, payNA: payNA.checked,
      nextCallAt: toIso(next), note: note.value.trim(),
    };
  };
  function refresh() {
    message.classList.add("hidden");
    const noAnswer = outcome.get() === "Javob bermadi";
    full.classList.toggle("hidden", noAnswer);
    meetingWrap.classList.toggle("hidden", outcome.get() !== "Uchrashuv belgilandi");
    const state = surveyProgress(collect());
    progress.textContent = "Заполнено " + state.filled + " из " + state.total + (state.missing.length ? " · не хватает: " + state.missing.join(", ") : "");
    progress.classList.toggle("is-full", state.filled === state.total);
  }
  const setBusy = (busy) => dialog.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
  const say = (text) => { message.textContent = text; message.classList.toggle("hidden", !text); };
  const finish = () => { dialog.close(); dialog.remove(); };
  [childName, childAge, goalText, objectionAnswer, meeting, payDue, next, note].forEach((node) => node.addEventListener("input", refresh));
  close.onclick = finish;
  save.onclick = async () => {
    const s = collect();
    if (!s.outcome) { say("Выберите результат звонка."); return; }
    if (s.outcome === "Uchrashuv belgilandi" && !s.meetingAt) { say("Укажите дату и время встречи."); return; }
    if (s.outcome === "Qayta aloqa" && !s.nextCallAt) { say("Укажите время следующего звонка."); return; }
    if (s.nextCallAt && Date.parse(s.nextCallAt) < Date.now() + 30000) { say("Следующий звонок должен быть в будущем."); return; }
    if (s.price && s.paid > s.price) { say("Оплачено больше цены: проверьте суммы."); return; }
    setBusy(true);
    const at = new Date().toISOString();
    const survey = { ...s, at, by: excelLeadEditedBy() };
    const status = String(values["Статус консультации"] || "");
    let nextStatus = status;
    if (status !== "student") {
      if (s.outcome === "Uchrashuv belgilandi") nextStatus = "booked";
      else if (s.outcome === "Qayta aloqa" || (s.outcome === "Javob bermadi" && s.nextCallAt)) nextStatus = "callback";
      else if (s.outcome === "Javob bermadi") nextStatus = "no_answer";
    }
    const nextValues = { ...values, "Опрос": survey, "Результат последнего звонка": composeSurveyText(s), "Статус консультации": nextStatus, "Последний изменивший": excelLeadEditedBy() };
    if (s.nextCallAt) nextValues[callbackTimeField] = s.nextCallAt; else delete nextValues[callbackTimeField];
    await cancelCallbackReminders(record.id);
    if (s.nextCallAt) {
      const inserted = await db.from("lead_callbacks").insert({ record_id: record.id, tab_id: tab.id, due_at: s.nextCallAt, lead_name: String(values["Имя"] || "").slice(0, 120), phone: String(values["Телефон"] || "").slice(0, 60) }).select("id").maybeSingle();
      if (inserted.error || !inserted.data) { setBusy(false); say("Не удалось поставить напоминание. Проверьте права доступа."); return; }
    }
    const updatedAt = new Date().toISOString();
    const updated = await db.from("custom_records").update({ values: nextValues, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle();
    if (updated.error || !updated.data) { setBusy(false); say("Не удалось сохранить. Проверьте права доступа."); return; }
    record.values = nextValues; record.updated_at = updatedAt;
    finish(); toast("Опрос сохранён");
    onChange(nextStatus === "callback" ? "callback" : undefined);
    if (s.outcome === "To‘lov qildi" && !studentSummary.has(record.id)) openStudentDialog(tab, record, onChange);
  };
  refresh();
  dialog.showModal();
}
function customRecordCard(record, fields, canManage, position = 0) {
  const values = record.values || {};
  if (state.selectedCustomTab?.name === excelLeadsTabName) {
    const name = values["Имя"] || "Без имени";
    const phone = values["Телефон"] || "—";
    const createdTime = values.created_time || record.created_at;
    const submissionCount = Math.max(1, Number(values.submission_count) || 1);
    const highIntent = submissionCount > 1;
    const callResult = String(values["Результат последнего звонка"] || "").trim();
    const lastEditor = String(values["Последний изменивший"] || "").trim();
    const updatedTime = record.updated_at || record.created_at;
    const surveyState = surveyProgress(values["Опрос"]);
    const surveyButton = canManage ? '<button class="button secondary lead-survey-action' + (surveyState.started && surveyState.filled === 8 ? ' is-full' : '') + '" type="button" data-record-id="' + escapeHtml(record.id) + '">Опрос' + (surveyState.started ? ' ' + surveyState.filled + '/8' : '') + '</button>' : "";
    const clarityBadge = leadNeedsClarification(values) ? '<span class="lead-unclear-badge">Нужно уточнить</span>' : "";
    const actions = canManage
      ? '<div class="excel-lead-actions">' + surveyButton + '<button class="button secondary custom-record-edit" type="button" data-record-id="' + escapeHtml(record.id) + '">Изменить</button><button class="button danger custom-record-delete" type="button" data-record-id="' + escapeHtml(record.id) + '">Удалить</button></div>'
      : "";
    const consultStatus = String(values["Статус консультации"] || "new");
    const consultStatusClass = consultStatus === "booked" ? " is-consult-booked" : consultStatus === "attended" ? " is-consult-attended" : consultStatus === "no_answer" ? " is-consult-no-answer" : consultStatus === "callback" ? " is-consult-callback" : consultStatus === "student" ? " is-consult-student" : "";
    const callbackAt = String(values[callbackTimeField] || "");
    const callbackButton = canManage && (consultStatus === "no_answer" || consultStatus === "callback")
      ? '<button class="lead-status-action is-callback lead-callback-action' + (consultStatus === "callback" ? " is-selected" : "") + '" type="button" data-record-id="' + escapeHtml(record.id) + '">Перезвонить' + (consultStatus === "callback" && callbackAt ? " · " + escapeHtml(callbackTimeText(callbackAt)) : "") + '</button>'
      : "";
    const studentButton = canManage
      ? '<button class="lead-status-action is-student lead-student-action' + (consultStatus === "student" ? " is-selected" : "") + '" type="button" data-record-id="' + escapeHtml(record.id) + '">' + (consultStatus === "student" ? "Карточка ученика" : "Стал учеником") + '</button>'
      : "";
    const consultActions = canManage
      ? '<div class="lead-consult-actions" aria-label="Отметить результат консультации"><span>Консультация:</span><button class="lead-status-action is-booked' + (consultStatus === "booked" ? " is-selected" : "") + '" type="button" data-record-id="' + escapeHtml(record.id) + '" data-lead-status="booked" aria-pressed="' + (consultStatus === "booked") + '">Записался</button><button class="lead-status-action is-attended' + (consultStatus === "attended" ? " is-selected" : "") + '" type="button" data-record-id="' + escapeHtml(record.id) + '" data-lead-status="attended" aria-pressed="' + (consultStatus === "attended") + '">Пришёл</button><button class="lead-status-action is-no-answer' + (consultStatus === "no_answer" ? " is-selected" : "") + '" type="button" data-record-id="' + escapeHtml(record.id) + '" data-lead-status="no_answer" aria-pressed="' + (consultStatus === "no_answer") + '">Не ответил</button>' + callbackButton + studentButton + '</div>'
      : '<div class="lead-consult-actions"><span class="lead-consult-status ' + (consultStatus === "attended" ? "is-attended" : consultStatus === "booked" ? "is-booked" : consultStatus === "no_answer" ? "is-no-answer" : consultStatus === "callback" ? "is-callback" : consultStatus === "student" ? "is-student" : "") + '">' + (consultStatus === "attended" ? "Пришёл на консультацию" : consultStatus === "booked" ? "Записался на консультацию" : consultStatus === "no_answer" ? "Не ответил на звонок" : consultStatus === "callback" ? "Перезвонить" + (callbackAt ? " · " + callbackTimeText(callbackAt) : "") : consultStatus === "student" ? studentStatusText(record) : "Статус консультации не указан") + '</span></div>';
    const callResultDisplay = callResult
      ? '<p><b>Результат последнего звонка:</b> ' + escapeHtml(callResult) + '</p>'
      : '<p class="excel-lead-call-placeholder">Бу ерда қўнғироқ натижалари ёзилади.</p>';
    const aiComment = callResult ? String(values["ИИ-комментарий"] || "").trim() : "";
    const aiDisplay = aiComment ? '<p class="excel-lead-ai"><b>ИИ-комментарий:</b> ' + escapeHtml(aiComment) + '</p>' : "";
    const callEdit = canManage ? '<button class="excel-lead-call-edit icon-button" type="button" data-record-id="' + escapeHtml(record.id) + '" aria-label="Изменить результат последнего звонка" title="Изменить результат последнего звонка">✎</button>' : "";
    const callMeta = '<div class="excel-lead-meta"><div class="excel-lead-call-row"><div class="excel-lead-call-copy">' + callResultDisplay + aiDisplay + '</div>' + callEdit + '</div><small>Последнее изменение: ' + (lastEditor ? escapeHtml(lastEditor) + ' · ' : '') + escapeHtml(dateTimeText(updatedTime)) + '</small></div>';
    const leadNumber = '<span class="excel-lead-number">' + (position + 1) + '.</span>';
    const intentBadge = (highIntent ? '<span class="lead-intent-badge">Высокое намерение · ' + escapeHtml(leadSubmissionCountText(submissionCount)) + '</span>' : "") + clarityBadge;
    const rowId = "excel-lead-" + String(record.id).replace(/[^a-zA-Z0-9_-]/g, "");
    return '<article id="' + escapeHtml(rowId) + '" class="crm-card excel-lead-row' + (highIntent ? ' is-high-intent' : '') + consultStatusClass + '"><div class="excel-lead-name">' + leadNumber + '<span class="mini-avatar">' + escapeHtml(initials(name)) + '</span><b>' + escapeHtml(name) + '</b>' + intentBadge + '</div><a class="excel-lead-phone" href="' + escapeHtml(phoneHref(phone)) + '">' + escapeHtml(phone) + '</a><time class="excel-lead-date" datetime="' + escapeHtml(createdTime) + '">' + escapeHtml(dateText(createdTime)) + '</time>' + actions + consultActions + callMeta + '</article>';
  }
  const titleField = fields.find((field) => /лид|имя|name/i.test(field.name) && String(values[field.name] || "").trim());
  const title = titleField ? values[titleField.name] : Object.values(values).find((value) => String(value || "").trim());
  const filled = fields.filter((field) => String(values[field.name] ?? "").trim()).length;
  const updated = record.updated_at || record.created_at;
  const cells = fields.map((field) => {
    const raw = String(values[field.name] ?? "").trim();
    const content = /^https?:\/\//i.test(raw)
      ? '<a class="custom-record-link" href="' + escapeHtml(raw) + '" target="_blank" rel="noopener noreferrer">Открыть ссылку ↗</a>'
      : escapeHtml(raw || "—");
    return '<div class="custom-record-field' + (raw ? "" : " is-empty") + '"><span>' + escapeHtml(field.name) + '</span><strong>' + content + '</strong></div>';
  }).join("");
  const actions = canManage
    ? '<div class="custom-record-actions"><button class="button secondary custom-record-edit" type="button" data-record-id="' + escapeHtml(record.id) + '">Изменить</button><button class="button danger custom-record-delete" type="button" data-record-id="' + escapeHtml(record.id) + '">Удалить</button></div>'
    : "";
  return '<article class="crm-card custom-record-card"><header class="custom-record-card-head"><div><p class="eyebrow">ЗАПИСЬ</p><h2>' + escapeHtml(title || "Без имени") + '</h2><small class="subtle">Обновлено: ' + escapeHtml(dateText(updated)) + '</small></div><span class="custom-record-completion">' + filled + ' из ' + fields.length + ' полей</span></header><div class="custom-record-fields">' + cells + '</div>' + actions + '</article>';
}
async function showCustomTab(tab) { const nestedInBloggers = isFargonaTezkorTab(tab); const canManage = canManageCustomTab(tab);
  state.selectedCustomTab = tab;
  saveView({ type: "tab", id: tab.id });
  document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", nestedInBloggers ? node.dataset.view === "bloggers" : node.dataset.view === "custom-" + tab.id));
  openArchiveIfActive();
  let page = document.getElementById("custom-page-" + tab.id);
  if (!page) { page = document.createElement("section"); page.id = "custom-page-" + tab.id; page.className = "page custom-tab-page"; $("workspace").appendChild(page); } page.classList.add("active");
  // Каждая вкладка использует одинаковые id (customRecordList и др.): держим в DOM только открытую страницу, иначе $() находит скрытую.
  document.querySelectorAll(".custom-tab-page").forEach((node) => { if (node !== page) node.innerHTML = ""; });
  if (nestedInBloggers) {
    const sourceRows = state.promos.filter(isFargonaTezkorPromo), sourceProfile = sourceRows[0]?.blogger?.instagram_url || "";
    page.innerHTML = '<div class="source-page-top"><button class="button secondary" id="sourceBack">← Блогеры</button>' + (sourceProfile ? '<a class="button secondary" href="' + escapeHtml(sourceProfile) + '" target="_blank" rel="noopener">Профиль источника ↗</a>' : "") + '</div><header class="source-page-header"><div><p class="eyebrow">ИСТОЧНИК · INSTAGRAM</p><h1>' + escapeHtml(tab.name) + '</h1><p class="subtle">Бизнесы и публикации, найденные через этот профиль.</p></div><div class="source-page-count"><b id="sourceResultCount">0</b><span>НАХОДОК</span></div></header><div id="sourcePromoList" class="source-record-list"></div>';
    $("sourceBack").onclick = () => setPage("bloggers");
  } else {
    const isExcelLeads = tab.name === excelLeadsTabName;
    page.innerHTML = '<div class="custom-record-page-header"><div><p class="eyebrow">CRM · EXCEL</p><h1>' + escapeHtml(tab.name) + '</h1><p class="subtle">Загрузите имя, телефон и исходную дату лида из столбца created_time.</p></div>' + (canManage ? (isExcelLeads ? '<div class="excel-lead-page-actions"><button class="button secondary" id="excelLeadTemplate" type="button">Скачать шаблон</button><button class="button secondary" id="excelLeadUpload" type="button">Загрузить Excel</button><button class="button primary" id="customAddRecord" type="button">＋ Добавить</button><input class="hidden" id="excelLeadFile" type="file" accept=".xlsx,.xls,.csv"></div>' : '<button class="button primary" id="customAddRecord" type="button">＋ Добавить запись</button>') : '') + '</div>' + (isExcelLeads ? '<div id="excelLeadImportMessage" class="message hidden" role="status"></div><section id="highIntentLeads" class="high-intent-panel hidden" aria-live="polite"></section><nav id="leadStatusColumns" class="lead-status-columns" aria-label="Колонки статусов консультации"><button type="button" class="lead-status-column is-active" data-lead-filter="all"><span>Все лиды</span><b data-count="all">0</b></button><button type="button" class="lead-status-column is-booked" data-lead-filter="booked"><span>Записались</span><b data-count="booked">0</b></button><button type="button" class="lead-status-column is-attended" data-lead-filter="attended"><span>Пришли</span><b data-count="attended">0</b></button><button type="button" class="lead-status-column is-no-answer" data-lead-filter="no_answer"><span>Не ответили</span><b data-count="no_answer">0</b></button><button type="button" class="lead-status-column is-callback" data-lead-filter="callback"><span>Перезвонить</span><b data-count="callback">0</b></button><button type="button" class="lead-status-column is-student" data-lead-filter="student"><span>Стал учеником</span><b data-count="student">0</b></button><button type="button" class="lead-status-column is-unclear" data-lead-filter="unclear"><span>Нужно уточнить</span><b data-count="unclear">0</b></button></nav>' : '') + '<div class="custom-record-toolbar"><label class="search-box"><span>⌕</span><input id="customRecordSearch" type="search" placeholder="Поиск по имени и телефону" autocomplete="off"></label><span id="customRecordCount" class="custom-record-count"></span></div>' + (isExcelLeads ? '<div class="excel-lead-list-head"><span>ИМЯ</span><span>ТЕЛЕФОН</span><button class="excel-lead-date-sort" id="excelLeadDateSort" type="button" aria-label="Сортировать по дате создания лида">ДАТА СОЗДАНИЯ ЛИДА <span aria-hidden="true">↓</span></button><span></span></div>' : '') + '<div id="customRecordList" class="crm-list"><div class="loading-row">Загрузка…</div></div>';
  }
  if (nestedInBloggers) {
    const sourceRows = state.promos.filter(isFargonaTezkorPromo);
    $("sourceResultCount").textContent = String(sourceRows.length);
    $("sourcePromoList").innerHTML = sourceRows.map(sourcePromoCard).join("") || '<div class="empty-state">Пока нет находок. Новые результаты появятся здесь после загрузки автопилота.</div>';
    return;
  }
  const result = await db.from("custom_records").select("*").eq("tab_id", tab.id).order("created_at", { ascending: false });
  if (result.error) { if (!nestedInBloggers) $("customRecordList").textContent = result.error.message; return; }
  if (tab.name === excelLeadsTabName) await loadStudentSummaries(tab.id); else studentSummary.clear();
  const fields = Array.isArray(tab.fields) ? tab.fields : [];
  const sourceRows = nestedInBloggers ? state.promos.filter(isFargonaTezkorPromo) : [];
  const sourceUrls = new Set(sourceRows.map((row) => String(row.permalink || "").replace(/\/$/, "").toLowerCase()));
  const customRows = (result.data || []).filter((record) => {
    const post = Object.entries(record.values || {}).find(([name]) => /публикац|пост|permalink|post link/i.test(name))?.[1];
    return !post || !sourceUrls.has(String(post).replace(/\/$/, "").toLowerCase());
  });
  if (nestedInBloggers) {
    const cards = customRows.map((record) => customSourceRecordCard(record, fields)).concat(sourceRows.map(sourcePromoCard));
    $("sourceResultCount").textContent = String(cards.length);
    $("sourcePromoList").innerHTML = cards.join("") || '<div class="empty-state">Пока нет находок. Новые результаты появятся здесь после загрузки автопилота.</div>';
  } else {
    const recordById = new Map(customRows.map((record) => [String(record.id), record]));
    let leadSortAscending = false;
    let leadStatusFilter = "all";
    const renderLeadStatusColumns = () => {
      const columns = $("leadStatusColumns");
      if (!columns) return;
      const counts = { all: customRows.length, booked: 0, attended: 0, no_answer: 0, callback: 0, student: 0, unclear: 0 };
      customRows.forEach((record) => {
        const status = String(record.values?.["Статус консультации"] || "new");
        if (status === "booked") counts.booked++;
        if (status === "attended") counts.attended++;
        if (status === "no_answer") counts.no_answer++;
        if (status === "callback") counts.callback++;
        if (status === "student") counts.student++;
        if (leadNeedsClarification(record.values)) counts.unclear++;
      });
      columns.querySelectorAll("[data-lead-filter]").forEach((button) => {
        const filter = button.dataset.leadFilter;
        button.classList.toggle("is-active", filter === leadStatusFilter);
        button.querySelector("[data-count]").textContent = String(counts[filter] ?? 0);
      });
    };
    const renderCustomRecords = () => {
      const query = $("customRecordSearch").value.trim().toLocaleLowerCase();
      const visible = customRows.filter((record) => {
        const status = String(record.values?.["Статус консультации"] || "new");
        const matchesStatus = leadStatusFilter === "all" || (leadStatusFilter === "unclear" ? leadNeedsClarification(record.values) : status === leadStatusFilter);
        const matchesQuery = !query || Object.values(record.values || {}).some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
        return matchesStatus && matchesQuery;
      });
      renderLeadStatusColumns();
      if (tab.name === excelLeadsTabName) visible.sort((a, b) => {
        const aTime = Date.parse(a.values?.created_time || a.created_at || "") || 0, bTime = Date.parse(b.values?.created_time || b.created_at || "") || 0;
        return leadSortAscending ? aTime - bTime : bTime - aTime;
      });
      if (tab.name === excelLeadsTabName) renderHighIntentLeads(visible);
      $("customRecordCount").textContent = query ? visible.length + " из " + customRows.length + " записей" : customRows.length + " записей";
      $("customRecordList").innerHTML = visible.map((record, index) => customRecordCard(record, fields, canManage, index)).join("") || '<div class="empty-state">' + (query ? "По этому запросу записей нет." : "Записей пока нет.") + '</div>';
      if (String(tab.name).trim().toLowerCase() === "blogerlik leadlari bolalar") attachYbaInviteActions(visible);
      document.querySelectorAll(".custom-record-edit").forEach((button) => button.onclick = () => {
        const record = recordById.get(button.dataset.recordId);
        if (record) openCustomRecordDialog(tab, tab.name === excelLeadsTabName ? excelLeadEditFields(fields) : fields, record);
      });
      document.querySelectorAll(".excel-lead-call-edit").forEach((button) => button.onclick = () => {
        const record = recordById.get(button.dataset.recordId);
        if (record) openCustomRecordDialog(tab, [{ name: "Результат последнего звонка", type: "textarea" }], record);
      });
      document.querySelectorAll(".lead-status-action").forEach((button) => button.onclick = async () => {
        const record = recordById.get(button.dataset.recordId);
        if (!record) return;
        button.disabled = true;
        const status = button.dataset.leadStatus;
        const selectedStatus = String(record.values?.["Статус консультации"] || "new");
        const nextStatus = selectedStatus === status ? "new" : status;
        const values = { ...(record.values || {}), "Статус консультации": nextStatus, "Последний изменивший": excelLeadEditedBy() };
        if (selectedStatus === "callback") delete values[callbackTimeField];
        const updatedAt = new Date().toISOString();
        const { data, error } = await db.from("custom_records").update({ values, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle();
        if (!error && data && selectedStatus === "callback") await cancelCallbackReminders(record.id);
        if (error || !data) {
          button.disabled = false;
          toast(error ? "Не удалось обновить статус. Проверьте права доступа." : "Лид не найден или у вас нет прав на изменение.");
          return;
        }
        record.values = values;
        record.updated_at = updatedAt;
        leadStatusFilter = nextStatus === "new" ? "all" : nextStatus;
        renderCustomRecords();
        toast(nextStatus === "new" ? "Статус консультации отменён" : nextStatus === "attended" ? "Лид отмечен как пришедший на консультацию" : "Лид перенесён в колонку «Записались»");
      });
      document.querySelectorAll(".lead-callback-action").forEach((button) => button.onclick = () => {
        const record = recordById.get(button.dataset.recordId);
        if (!record) return;
        openCallbackDialog(tab, record, () => { leadStatusFilter = "callback"; renderCustomRecords(); });
      });
      document.querySelectorAll(".lead-survey-action").forEach((button) => button.onclick = () => {
        const record = recordById.get(button.dataset.recordId);
        if (record) openSurveyDialog(tab, record, (filter) => { if (filter) leadStatusFilter = filter; renderCustomRecords(); });
      });
      document.querySelectorAll(".lead-student-action").forEach((button) => button.onclick = () => {
        const record = recordById.get(button.dataset.recordId);
        if (!record) return;
        openStudentDialog(tab, record, (filter) => { if (filter) leadStatusFilter = filter; renderCustomRecords(); });
      });
      document.querySelectorAll(".custom-record-delete").forEach((button) => button.onclick = async () => {
        const record = recordById.get(button.dataset.recordId);
        if (!record || !window.confirm(state.language === "uz" ? uzText("Удалить эту запись из CRM? Это действие нельзя отменить.") : "Удалить эту запись из CRM? Это действие нельзя отменить.")) return;
        button.disabled = true;
        const { data, error } = await db.from("custom_records").delete().eq("id", record.id).select("id").maybeSingle();
        if (error || !data) { button.disabled = false; toast(error ? "Не удалось удалить запись. Проверьте права доступа." : "Запись не найдена или у вас нет прав на удаление."); return; }
        toast("Запись удалена");
        await showCustomTab(tab);
      });
    };
    $("customRecordSearch").oninput = renderCustomRecords;
    $("leadStatusColumns")?.querySelectorAll("[data-lead-filter]").forEach((button) => {
      button.onclick = () => { leadStatusFilter = button.dataset.leadFilter; renderCustomRecords(); };
    });
    $("excelLeadDateSort")?.addEventListener("click", () => {
      leadSortAscending = !leadSortAscending;
      const direction = $("excelLeadDateSort").querySelector("span");
      direction.textContent = leadSortAscending ? "↑" : "↓";
      $("excelLeadDateSort").setAttribute("aria-label", leadSortAscending ? "Сначала лиды с более ранней датой создания" : "Сначала лиды с более поздней датой создания");
      renderCustomRecords();
    });
    renderCustomRecords();
    $("customAddRecord")?.addEventListener("click", () => openCustomRecordDialog(tab, tab.name === excelLeadsTabName ? excelLeadEditFields(fields) : fields));
    if (tab.name === excelLeadsTabName && canManage) {
      $("excelLeadUpload").onclick = () => $("excelLeadFile").click();
      $("excelLeadTemplate").onclick = downloadExcelLeadsTemplate;
      $("excelLeadFile").onchange = (event) => importExcelLeads(event, tab, customRows);
    }
  }
}

function downloadExcelLeadsTemplate() {
  if (!window.XLSX) { toast("Модуль Excel пока недоступен"); return; }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Имя", "Телефон", "created_time"]]), "Лиды");
  XLSX.writeFile(workbook, "CRM_лиды_шаблон.xlsx");
}

function normalizeLeadPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("998") && digits.length === 12) digits = digits.slice(3);
  return digits;
}

async function importExcelLeads(event, tab, existingRows) {
  const input = event.target, file = input.files?.[0];
  if (!file) return;
  showMessage("excelLeadImportMessage", "Читаю Excel…", "");
  try {
    if (!window.XLSX) throw new Error("Не загрузился модуль Excel. Обновите страницу и попробуйте снова.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Размер файла больше 5 МБ.");
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    if (matrix.length < 2) throw new Error("В файле нет строк с данными.");
    const normalizeHeader = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zа-яё0-9]+/gi, " ").trim();
    const headers = matrix[0].map(normalizeHeader);
    const nameColumn = headers.findIndex((value) => ["имя", "фио", "имя фамилия", "full name", "name", "ism", "ism familiya"].includes(value));
    const phoneColumn = headers.findIndex((value) => ["телефон", "номер", "номер телефона", "телефон номер", "phone", "phone number", "number", "telefon", "telefon raqami"].includes(value));
    const createdTimeColumn = headers.findIndex((value) => ["created time", "created at", "created date", "lead created", "дата создания", "дата создания лида"].includes(value));
    if (nameColumn < 0 || phoneColumn < 0) throw new Error("Нужны два столбца с заголовками «Имя» и «Телефон». Скачайте шаблон CRM и вставьте данные под заголовки.");
    const dataRows = matrix.slice(1).map((cells, index) => {
      const createdCell = createdTimeColumn < 0 ? null : sheet[XLSX.utils.encode_cell({ r: index + 1, c: createdTimeColumn })];
      return { row: index + 2, name: String(cells[nameColumn] ?? "").trim(), phone: String(cells[phoneColumn] ?? "").trim(), createdTime: createdTimeColumn < 0 ? "" : excelLeadDateValue(createdCell?.v ?? cells[createdTimeColumn]) };
    }).filter((row) => row.name || row.phone);
    if (!dataRows.length) throw new Error("Не найдены заполненные строки с именем и телефоном.");
    if (dataRows.length > 500) throw new Error("В файле больше 500 строк. Разделите таблицу на несколько файлов.");
    const byPhone = new Map();
    for (const record of existingRows) {
      const key = normalizeLeadPhone(record.values?.["Телефон"]);
      if (key && !byPhone.has(key)) byPhone.set(key, record);
    }
    let added = 0, updated = 0, skipped = 0;
    const issues = [];
    for (const row of dataRows) {
      const digits = normalizeLeadPhone(row.phone);
      if (!row.name || digits.length < 7 || digits.length > 15) { skipped++; issues.push("строка " + row.row + ": проверьте имя и номер"); continue; }
      const found = byPhone.get(digits);
      const values = { ...(found?.values || {}), "Имя": row.name, "Телефон": row.phone, "Последний изменивший": excelLeadEditedBy() };
      trackExcelLeadSubmission(values, row.createdTime);
      const updatedAt = new Date().toISOString();
      const saved = found
        ? await db.from("custom_records").update({ values, updated_at: updatedAt }).eq("id", found.id).select("id").maybeSingle()
        : await db.from("custom_records").insert({ tab_id: tab.id, values }).select("id").single();
      if (saved.error || !saved.data) { skipped++; issues.push("строка " + row.row + ": не удалось сохранить"); continue; }
      if (found) { found.values = values; found.updated_at = updatedAt; updated++; }
      else { const created = { id: saved.data.id, tab_id: tab.id, values, created_at: updatedAt, updated_at: updatedAt }; existingRows.unshift(created); byPhone.set(digits, created); added++; }
    }
    const summary = "Excel обработан: добавлено " + added + ", обновлено " + updated + ", пропущено " + skipped + ". Файл не сохранялся в CRM." + (issues.length ? " Примеры: " + issues.slice(0, 3).join("; ") : "");
    await showCustomTab(tab);
    showMessage("excelLeadImportMessage", summary, skipped ? "error" : "success");
  } catch (error) {
    showMessage("excelLeadImportMessage", error.message || "Не удалось прочитать Excel.", "error");
  } finally { input.value = ""; }
}
$("customRecordForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const formValues = Object.fromEntries([...document.querySelectorAll("#customRecordFields [data-field-name]")].map((input) => [input.dataset.fieldName, input.value.trim()]));
  const record = state.selectedCustomRecord;
  const tab = state.selectedCustomTab;
  const callResultChanged = Boolean(record && tab?.name === excelLeadsTabName && formValues["Результат последнего звонка"] && formValues["Результат последнего звонка"] !== String(record.values?.["Результат последнего звонка"] || "").trim());
  const aiBefore = String(record?.values?.["ИИ-комментарий"] || "");
  const values = tab?.name === excelLeadsTabName ? { ...(record?.values || {}), ...formValues, "Последний изменивший": excelLeadEditedBy() } : formValues;
  const updatedAt = new Date().toISOString();
  const result = record
    ? await db.from("custom_records").update({ values, updated_at: updatedAt }).eq("id", record.id).select("id").maybeSingle()
    : await db.from("custom_records").insert({ tab_id: tab?.id, values }).select("id").single();
  button.disabled = false;
  if (result.error || !result.data) { showMessage("customRecordMessage", result.error?.message || "Не удалось сохранить изменения. Проверьте права доступа.", "error"); return; }
  state.selectedCustomRecord = null;
  $("customRecordDialog").close();
  await showCustomTab(tab);
  if (callResultChanged) watchAiComment(record.id, tab, aiBefore);
};
$("customTabForm").onsubmit = async (event) => {
  event.preventDefault(); const rows = $("customTabFields").value.split("\n").map((line) => line.trim()).filter(Boolean);
  const fields = rows.map((line) => { const [name, type = "text"] = line.split("—").map((part) => part.trim()); return { name, type: ["text","phone","date","select","status","link","file"].includes(type) ? type : "text" }; });
  const viewers = $("customTabViewAccess").value.split(",");
  const editors = $("customTabEditAccess").value.split(",");
  const result = await db.from("custom_tabs").insert({ name: $("customTabName").value.trim(), fields, viewer_roles: viewers, editor_roles: editors }).select("*").single();
  if (result.error) { showMessage("customTabMessage", result.error.message || "Не удалось создать вкладку.", "error"); return; }
  state.tabs.push(result.data); $("customTabDialog").close(); event.target.reset(); renderCustomTabs(); toast("Вкладка создана"); showCustomTab(result.data);
};
function apDate(d){const x=new Date(d.getTime()-d.getTimezoneOffset()*60000);return x.toISOString().slice(0,10)}
function apPrompt(){const ru=state.language==="ru",blog=$("autopilotBlogger").value.trim()||"Fargona Tezkor",sizes=[];if($("autopilotSmall").checked)sizes.push(ru?"малые":"kichik");if($("autopilotMedium").checked)sizes.push(ru?"средние":"o‘rta");const n=Math.min(100,Math.max(1,Number($("autopilotCount").value)||10)),from=$("autopilotFrom").value,to=$("autopilotTo").value;if(!sizes.length)return ru?"Выберите хотя бы один размер бизнеса.":"Kamida bitta biznes hajmini tanlang.";if(from>to)return ru?"Дата начала должна быть раньше окончания.":"Boshlanish sanasi tugashdan oldin bo‘lishi kerak.";return ru?`Работай через подключённый Chrome: открой публичный профиль Instagram «${blog}» и проверь публикации за период с ${from} по ${to} включительно. Ищи рекламировавшиеся там местные бизнесы Ферганской области: ${sizes.join(" и ")}, до ${n} разных подтверждённых бизнесов. Не заменяй проверку публикаций в Chrome общим веб-поиском. Если Chrome недоступен, попроси пользователя открыть или подключить его и остановись; не заявляй, что проверил Instagram.

Считай рекламой пост только при явной рекламе, рекомендации, отметке бизнеса или рекламном сотрудничестве. Для каждой находки укажи название, город/район, дату и фактический профиль Instagram, где размещён рекламный пост, в виде ссылки на профиль или @username. Заполни колонку blogger этим профилем — CRM создаст профиль и папку отдельно для каждого значения. Не подменяй фактический источник выбранным в запросе блогером, если публикацию разместил другой профиль. Также укажи ссылку на пост, короткое доказательство рекламы и публичный источник телефона. Если телефон не найден открыто — оставь пустым, не угадывай. Подготовь скачиваемый Excel для импорта в CRM с точными заголовками: business, phone, phone_source, city, blogger, permalink, published_at, evidence. Не дублируй бизнесы и не включай догадки. Не входи в аккаунты. Если потребуется вход, появится CAPTCHA, блокировка или ошибка загрузки Instagram — остановись и сообщи мне, ничего не обходи. При нуле подтверждённых бизнесов не создавай и не прикладывай пустой Excel; объясни, что именно помешало проверке.`:`Ulangan Chrome orqali ishlagin: Instagram’da «${blog}» ochiq profilini ochib, ${from} dan ${to} gacha bo‘lgan postlarni tekshir. Farg‘ona viloyatida shu bloger reklama qilgan mahalliy bizneslarni izla. Hajmi: ${sizes.join(" va ")}. ${n} tagacha tasdiqlangan, takrorlanmaydigan biznes top. Har biri uchun nomi, shahar/tuman, sana va reklama posti joylangan haqiqiy Instagram profilini havola yoki @username ko‘rinishida yoz. blogger ustuniga aynan shu profilni kiriting — CRM har bir profil uchun alohida sahifa va papka yaratadi. Agar postni boshqa profil joylagan bo‘lsa, qidiruvda tanlangan bloger bilan almashtirmang. Post havolasi, reklama dalili va telefonning ochiq manbasini ham yoz. Telefon topilmasa taxmin qilma. CRM uchun aynan business, phone, phone_source, city, blogger, permalink, published_at, evidence ustunlari bilan yuklab olinadigan Excel tayyorla. Faqat ochiq sahifalardan foydalan, akkauntga kirmagin. Kirish, CAPTCHA, bloklash yoki Instagram yuklanish xatosi chiqsa, to‘xtab xabar ber; chetlab o‘tma. Tasdiqlangan biznes topilmasa, bo‘sh Excel yaratma va tekshiruvga nima xalaqit berganini tushuntir.`}
function renderAutopilot(){if(!$("autopilotFrom").value)$("autopilotFrom").value=apDate(new Date(Date.now()-6*86400000));if(!$("autopilotTo").value)$("autopilotTo").value=apDate(new Date());const opts=new Set(["Fargona Tezkor"]);for(const row of state.promos||[]){const n=row.blogger?.display_name||row.blogger?.username;if(n)opts.add(String(n))}$("autopilotBloggerOptions").innerHTML=[...opts].map(n=>'<option value="'+escapeHtml(n)+'"></option>').join("");const p=apPrompt();$("autopilotPrompt").value=p;$("openAutopilotSearch").href="https://chatgpt.com/?q="+encodeURIComponent(p);$("openAutopilotSearch").setAttribute("aria-disabled",!($("autopilotSmall").checked||$("autopilotMedium").checked)||$("autopilotFrom").value>$("autopilotTo").value?"true":"false")}
for(const id of ["autopilotBlogger","autopilotSmall","autopilotMedium","autopilotCount","autopilotFrom","autopilotTo"])$(id).addEventListener("input",renderAutopilot);
$("copyAutopilotPrompt").onclick=async()=>{try{await navigator.clipboard.writeText($("autopilotPrompt").value);toast(state.language==="ru"?"Запрос скопирован":"So‘rov nusxalandi")}catch{$("autopilotPrompt").select();document.execCommand("copy")}};

const i18n = { ru: { navHr: "HR-лиды", navBloggers: "Блогеры", navShows: "Заявки на шоу", navAutopilot: "Автопилот", autopilotTitle: "Автопилот", autopilotSubtitle: "Выберите блогера и параметры — CRM подготовит запрос.", newTab: "Новая вкладка", bloggersTitle: "Блогеры и реклама", bloggersSubtitle: "Автопилот и ресерч сгруппированы по профилю источника.", hrTitle: "HR-лиды по вакансии", hrSubtitle: "Ответы кандидатов и этап найма.", showsTitle: "Заявки на ТВ-шоу", showsSubtitle: "Бренд-фейс и мобилографы в одном списке.", addPromo: "Добавить рекламу", addShow: "Добавить заявку", researchTitle: "Ресерч в Chrome раз в 2 недели", last7: "Последние 7 дней", allTime: "За всё время", allStages: "Все этапы", new: "Новая", contacted: "Связались", interview: "Собеседование", hired: "Принята", rejected: "Отказ", reviewed: "Просмотрена", casting: "Кастинг", chosen: "Выбрана", allCategories: "Все категории", brandFace: "Бренд-фейс", mobileographer: "Мобилограф", promoSearch: "Бизнес, блогер или телефон", searchNamePhone: "Имя или телефон", showSearch: "Имя, телефон или город" }, uz: { navHr: "HR arizalari", navBloggers: "Blogerlar", navShows: "Shou arizalari", navAutopilot: "Avtopilot", autopilotTitle: "Avtopilot", autopilotSubtitle: "Blogerni tanlang — CRM qidiruv so‘rovini tayyorlaydi.", newTab: "Yangi bo‘lim", bloggersTitle: "Blogerlar va reklama", bloggersSubtitle: "Avtopilot natijalari manba profili bo‘yicha guruhlangan.", hrTitle: "Vakansiya bo‘yicha arizalar", hrSubtitle: "Nomzod javoblari va ishga olish bosqichi.", showsTitle: "TV-shou arizalari", showsSubtitle: "Brend-feys va mobilograflar bitta ro‘yxatda.", addPromo: "Reklama qo‘shish", addShow: "Ariza qo‘shish", researchTitle: "Chrome’da har 2 haftada qidiruv", last7: "Oxirgi 7 kun", allTime: "Barcha vaqt", allStages: "Barcha bosqichlar", new: "Yangi", contacted: "Bog‘lanildi", interview: "Suhbat", hired: "Qabul qilindi", rejected: "Rad etildi", reviewed: "Ko‘rib chiqildi", casting: "Kasting", chosen: "Tanlandi", allCategories: "Barcha toifalar", brandFace: "Brend-feys", mobileographer: "Mobilograf", promoSearch: "Biznes, bloger yoki telefon", searchNamePhone: "Ism yoki telefon", showSearch: "Ism, telefon yoki shahar" } };
function applyLanguage() { document.documentElement.lang = state.language === "ru" ? "ru" : "uz-Latn"; document.querySelectorAll("[data-i18n]").forEach((node) => { const value = i18n[state.language][node.dataset.i18n]; if (value) node.textContent = value; }); document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { const value = i18n[state.language][node.dataset.i18nPlaceholder]; if (value) node.placeholder = value; }); applyUzTranslation(); }
$("languageToggle").onclick = () => { state.language = state.language === "ru" ? "uz" : "ru"; localStorage.setItem("crm-language", state.language); applyLanguage(); };
function renderLanguageToggle() {
  const toggle = $("languageToggle");
  toggle.innerHTML = '<b class="' + (state.language === "ru" ? "on" : "") + '">RU</b> / <b class="' + (state.language === "uz" ? "on" : "") + '">UZ</b>';
}
function applyUzTranslation() {
  if (state.language === "uz") translateTree(document.body);
  else restoreTree(document.body);
  renderLanguageToggle();
}
startUzObserver(() => state.language === "uz");
applyLanguage();
$("mobileLogoutBtn").onclick = () => $("logoutBtn").click();
$("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  state.user = null;
  showLogin("Tizimdan chiqdingiz.", false);
};
function setSignedInUser(user) {
  state.user = user;
  const name = user?.user_metadata?.full_name || "CRM";
  $("profileName").textContent = name;
  $("avatar").textContent = initials(name);
  showCRM();
  return loadData();
}
async function verifyLoginToken(tokenHash) {
  const auth = await db.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (auth.error || !auth.data?.user) throw new Error("Не удалось завершить вход. Запросите новую ссылку у бота.");
  await setSignedInUser(auth.data.user);
}
async function managerPinLogin() {
  const pinInput = $("managerPin"), button = $("managerPinLoginBtn");
  const pin = pinInput.value.trim();
  if (!/^\d{4}$/.test(pin)) { showMessage("loginMessage", "Введите четырёхзначный PIN руководителя.", "error"); return; }
  button.disabled = true; button.textContent = "Проверяю…";
  try {
    const response = await fetch(config.url + "/functions/v1/crm-web-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify({ pin })
    });
    const result = await response.json();
    if (!response.ok || !result.token_hash) {
      const errors = { pin_invalid: "Неверный PIN.", too_many_attempts: "Слишком много попыток. Подождите 15 минут.", web_access_disabled: "Вход руководителя отключён.", login_not_configured: "Вход руководителя временно недоступен." };
      throw new Error(errors[result.error] || "Не удалось войти.");
    }
    pinInput.value = "";
    await verifyLoginToken(result.token_hash);
  } catch (error) {
    showMessage("loginMessage", error.message || "Не удалось войти.", "error");
  } finally {
    button.disabled = false; button.textContent = "Войти как руководитель";
  }
}
$("managerPinLoginBtn").onclick = managerPinLogin;
$("managerPin").addEventListener("keydown", (event) => { if (event.key === "Enter") managerPinLogin(); });
async function browserLinkLogin(token) {
  try {
    const response = await fetch(config.url + "/functions/v1/crm-browser-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify({ token })
    });
    const result = await response.json();
    if (!response.ok || !result.token_hash) {
      const errors = { link_invalid: "Ссылка уже использована или устарела. Нажмите /start в боте, чтобы получить новую.", approval_required: "Руководитель ещё не одобрил доступ.", login_unavailable: "Не удалось войти. Запросите новую ссылку через бота." };
      throw new Error(errors[result.error] || "Не удалось проверить ссылку.");
    }
    await verifyLoginToken(result.token_hash);
  } catch (error) {
    showLogin(error.message || "Не удалось проверить ссылку.", true);
  }
}
function renderOwnerOrder(order) {
  $("ownerOrderInfo").innerHTML =
    detailRow("Buyurtma raqami", order.order_number) +
    detailRow("Rahbar", order.owner_name) +
    detailRow("Biznes", order.business_name) +
    detailRow("Telefon", order.phone) +
    detailRow("Paket", order.package_name) +
    detailRow("Xizmat", order.details) +
    detailRow("Kelishilgan summa", money(order.total_amount)) +
    detailRow("Oldindan to‘langan", money(order.paid_amount)) +
    detailRow("Qolgan summa", money(Number(order.total_amount) - Number(order.paid_amount))) +
    detailRow("To‘lov grafigi", order.payment_schedule || "Alohida kelishiladi") +
    detailRow("Topshirish muddati", order.delivery_deadline || "Alohida kelishiladi");
}
async function loadOwnerOrder() {
  $("sidebar").classList.add("hidden");
  $("topbar").classList.add("hidden");
  $("mobileNav").classList.add("hidden");
  $("loginView").classList.add("hidden");
  $("workspace").classList.add("hidden");
  $("ownerPage").classList.remove("hidden");
  const response = await db.functions.invoke("order-link", { body: { action: "load", token: state.ownerToken } });
  if (response.error || response.data?.error) {
    $("ownerOrderInfo").innerHTML = "";
    showMessage("ownerMessage", "Havola yaroqsiz yoki muddati tugagan. Koordinatordan yangisini so‘rang.", "error");
    $("signArea").classList.add("hidden");
    return;
  }
  const order = response.data.order;
  renderOwnerOrder(order);
  if (order.status === "signed") {
    $("signArea").classList.add("hidden");
    $("signedNotice").classList.remove("hidden");
    $("ownerPrint").classList.remove("hidden");
  } else {
    requestAnimationFrame(sizeSignature);
  }
}
const canvas = $("signature");
const ctx = canvas.getContext("2d");
let drawing = false;
let hasSignature = false;
function sizeSignature() {
  const bounds = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * scale));
  canvas.height = Math.floor(180 * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#202123";
}
function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault(); drawing = true; canvas.setPointerCapture(event.pointerId);
  const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drawing) return;
  const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); hasSignature = true;
});
["pointerup", "pointercancel"].forEach((name) => canvas.addEventListener(name, () => drawing = false));
$("clearSignature").onclick = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height); hasSignature = false;
};
$("signOrder").onclick = async () => {
  if (!hasSignature) { showMessage("ownerMessage", "Iltimos, imzo chizing.", "error"); return; }
  if (!$("agreeTerms").checked) { showMessage("ownerMessage", "Davom etishdan oldin shartlarga rozilik bering.", "error"); return; }
  const button = $("signOrder"); button.disabled = true; button.textContent = "Saqlanmoqda…";
  const result = await db.functions.invoke("order-link", {
    body: { action: "sign", token: state.ownerToken, signature: canvas.toDataURL("image/png") }
  });
  if (result.error || result.data?.error) {
    showMessage("ownerMessage", "Imzo saqlanmadi. Internetni tekshirib, qayta urinib ko‘ring.", "error");
  } else {
    $("signArea").classList.add("hidden"); $("signedNotice").classList.remove("hidden"); $("ownerPrint").classList.remove("hidden");
    showMessage("ownerMessage", result.data?.notification_sent === false ? "Buyurtma imzolandi, lekin rahbarga xabar yuborilmadi." : "Buyurtma imzolandi.", result.data?.notification_sent === false ? "error" : "success");
  }
  button.disabled = false; button.textContent = "Qabul qilish va imzolash";
};
$("ownerPrint").onclick = () => window.print();
async function start() {
  if (location.hash.startsWith("#owner=")) {
    state.ownerToken = decodeURIComponent(location.hash.slice(7));
    await loadOwnerOrder();
    return;
  }
  const browserLogin = location.hash.match(/^#crm-login=([A-Za-z0-9_-]{40,64})(?:&|$)/);
  if (browserLogin) {
    const token = decodeURIComponent(browserLogin[1]);
    history.replaceState(null, document.title, location.pathname + location.search);
    await browserLinkLogin(token);
    return;
  }
  const session = await db.auth.getSession();
  state.user = session.data.session?.user || null;
  if (!state.user) {
    showLogin("", false);
    return;
  }
  const name = state.user.user_metadata?.full_name || "Koordinator";
  $("profileName").textContent = name;
  $("avatar").textContent = initials(name);
  showCRM();
  await loadData();
}
start();





