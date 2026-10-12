import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const config = window.SUPABASE_CONFIG || {};
const db = createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
const $ = (id) => document.getElementById(id);
const state = { user: null, leads: [], orders: [], promos: [], shows: [], tabs: [], selectedLead: null, selectedOrder: null, ownerToken: "", leadAccess: false, manager: false, language: localStorage.getItem("crm-language") || "ru" };
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
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("uz-UZ", { day: "numeric", month: "short", year: "numeric" });
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
function setPage(page) {
  if (page === "hr" && !state.manager) { toast("HR-лиды доступны только руководителю"); page = "bloggers"; }
  const pageId = ({ bloggers: "homePage", hr: "leadsPage", shows: "ordersPage" })[page] || page + "Page";
  document.querySelectorAll(".page").forEach((node) => node.classList.toggle("active", node.id === pageId));
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (page === "hr") renderLeads();
  if (page === "bloggers") renderPromos();
  if (page === "shows") renderShows();
}
function showLogin(message, error) {
  $("sidebar").classList.add("hidden");
  $("newCustomTabMobile").classList.add("hidden");
  $("topbar").classList.remove("hidden");
  $("mobileNav").classList.add("hidden");
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
  $("loginView").classList.add("hidden");
  $("ownerPage").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  setPage("bloggers");
}
function leadSearchText(lead) {
  return [lead.full_name, lead.phone, lead.kirgili_answer, lead.study_answer, lead.availability, lead.crm_note]
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
  document.querySelectorAll('[data-view="hr"]').forEach((hr) => hr.classList.toggle("hidden", !state.manager));
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
function renderPromos() {
  const query = $("promoSearch").value.trim().toLowerCase();
  const sevenDays = Date.now() - 7 * 86400000;
  const rows = state.promos.filter((row) => {
    const matchesPeriod = $("promoPeriod").value === "all" || (row.published_at && new Date(row.published_at).getTime() >= sevenDays);
    const haystack = [row.business?.name, row.business?.phone, row.business?.city, row.blogger?.display_name, row.blogger?.username, row.permalink].join(" ").toLowerCase();
    return matchesPeriod && (!query || haystack.includes(query));
  });
  $("promoList").innerHTML = rows.map((row) => '<article class="crm-card"><div class="crm-card-main"><div class="crm-card-title"><b>' + escapeHtml(row.business?.name || "Бизнес") + '</b></div><p>' + escapeHtml(row.blogger?.display_name || row.blogger?.username || "Блогер") + ' · ' + escapeHtml(row.business?.city || "Ферганская область") + '</p><p class="crm-card-meta">' + escapeHtml(row.business?.phone || "Телефон не указан") + ' · ' + escapeHtml(dateText(promoDate(row))) + '</p></div><div class="crm-card-actions"><a class="button secondary" href="' + escapeHtml(row.permalink) + '" target="_blank" rel="noopener">Публикация ↗</a>' + (row.business?.phone ? '<a class="icon-button" href="' + escapeHtml(phoneHref(row.business.phone)) + '">☎</a>' : "") + '<select class="filter-select promo-review" data-id="' + escapeHtml(row.id) + '"><option value="needs_review" ' + (row.review_status === "needs_review" ? "selected" : "") + '>Проверить</option><option value="confirmed" ' + (row.review_status === "confirmed" ? "selected" : "") + '>Подтверждено</option><option value="rejected" ' + (row.review_status === "rejected" ? "selected" : "") + '>Не реклама</option></select></div></article>').join("");
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
  const manager = await db.rpc("crm_is_manager");
  state.manager = !manager.error && manager.data === true;
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
  if (!tabs.error) state.tabs = tabs.data || []; else state.tabs = [];
  if (!runs.error && runs.data) {
    const next = new Date(new Date(runs.data.started_at).getTime() + 14 * 86400000);
    $("researchLastRun").textContent = "Последняя загрузка: " + dateText(runs.data.started_at) + " · найдено строк: " + runs.data.found_count + " · следующий ресерч: " + dateText(next);
  } else $("researchLastRun").textContent = "Excel ещё не загружали · периодичность: раз в 2 недели";
  renderHome(); renderPromos(); renderShows(); renderCustomTabs();
  if (state.manager) {
    const leads = await db.from("meta_admin_leads").select("meta_lead_id,full_name,phone,kirgili_answer,study_answer,availability,meta_created_at,received_at,pipeline_status,crm_note").order("received_at", { ascending: false }).limit(300);
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
  $("leadDialogInfo").innerHTML = detailRow("Telefon", lead.phone) + detailRow("Kirguli", lead.kirgili_answer) +
    detailRow("O‘qish / talabalik", lead.study_answer) + detailRow("Bo‘sh vaqt", lead.availability) +
    detailRow("Ariza kelgan sana", dateText(lead.meta_created_at || lead.received_at));
  $("leadStatus").value = lead.pipeline_status || "new";
  $("leadNote").value = lead.crm_note || "";
  const call = $("leadCall");
  if (lead.phone) {
    call.href = phoneHref(lead.phone);
    call.classList.remove("hidden");
  } else call.classList.add("hidden");
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
    const summary = "Excel обработан: добавлено " + added + ", обновлено " + updated + ", пропущено " + skipped + "." + (issues.length ? " Подробности: " + issues.slice(0, 4).join("; ") : "") + " Исходный файл не сохранялся.";
    showMessage("excelImportMessage", summary, skipped ? "error" : "success");
  } catch (error) { showMessage("excelImportMessage", error.message || "Не удалось прочитать Excel.", "error"); }
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
function renderCustomTabs() {
  const sidebarNav = document.querySelector(".side-nav");
  document.querySelectorAll(".custom-tab-nav,.custom-tab-page").forEach((node) => node.remove());
  for (const tab of state.tabs) {
    const nav = document.createElement("button"); nav.className = "nav-item custom-tab-nav"; nav.dataset.view = "custom-" + tab.id; nav.dataset.bound = "1";
    nav.innerHTML = '<span class="nav-icon">' + escapeHtml(tab.icon || "▤") + '</span><span>' + escapeHtml(tab.name) + '</span>';
    sidebarNav.insertBefore(nav, $("newCustomTab")); nav.onclick = () => showCustomTab(tab);
  }
  document.querySelectorAll("[data-view]").forEach((button) => { if (!button.dataset.bound) { button.dataset.bound = "1"; button.onclick = () => setPage(button.dataset.view); } });
}
async function showCustomTab(tab) {
  document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node.dataset.view === "custom-" + tab.id));
  let page = document.getElementById("custom-page-" + tab.id);
  if (!page) { page = document.createElement("section"); page.id = "custom-page-" + tab.id; page.className = "page active"; $("workspace").appendChild(page); }
  page.innerHTML = '<div class="page-heading"><div><p class="eyebrow">ПОЛЬЗОВАТЕЛЬСКАЯ ВКЛАДКА</p><h1>' + escapeHtml(tab.name) + '</h1></div><button class="button primary" id="customAddRecord">＋ Добавить запись</button></div><div id="customRecordList" class="crm-list"><div class="loading-row">Загрузка…</div></div>';
  const result = await db.from("custom_records").select("*").eq("tab_id", tab.id).order("created_at", { ascending: false });
  if (result.error) { $("customRecordList").textContent = result.error.message; return; }
  const fields = Array.isArray(tab.fields) ? tab.fields : [];
  $("customRecordList").innerHTML = (result.data || []).map((record) => '<article class="crm-card"><div class="crm-card-main">' + fields.map((field) => '<p><b>' + escapeHtml(field.name) + ':</b> ' + escapeHtml(record.values?.[field.name] || "—") + '</p>').join("") + '</div></article>').join("") || '<div class="empty-state">Записей пока нет.</div>';
  $("customAddRecord").onclick = async () => {
    state.selectedCustomTab = tab;
    $("customRecordTitle").textContent = "Новая запись · " + tab.name;
    $("customRecordFields").innerHTML = fields.map((field, index) => {
      const inputType = field.type === "phone" ? "tel" : field.type === "date" ? "date" : field.type === "link" ? "url" : "text";
      const note = field.type === "file" ? '<small class="subtle">Hozircha fayl havolasini kiriting.</small>' : "";
      return '<label class="field-label" for="customField' + index + '">' + escapeHtml(field.name) + '</label><input class="input-control" id="customField' + index + '" data-field-name="' + escapeHtml(field.name) + '" type="' + inputType + '"' + (field.type === "file" ? ' placeholder="https://…"' : "") + '>' + note;
    }).join("");
    showMessage("customRecordMessage", "", ""); $("customRecordDialog").showModal();
  };
}
$("customRecordForm").onsubmit = async (event) => {
  event.preventDefault();
  const values = Object.fromEntries([...document.querySelectorAll("#customRecordFields [data-field-name]")].map((input) => [input.dataset.fieldName, input.value.trim()]));
  const result = await db.from("custom_records").insert({ tab_id: state.selectedCustomTab?.id, values });
  if (result.error) { showMessage("customRecordMessage", result.error.message || "Не удалось сохранить запись.", "error"); return; }
  $("customRecordDialog").close(); await showCustomTab(state.selectedCustomTab);
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
const i18n = { ru: { navHr: "HR-лиды", navBloggers: "Блогеры", navShows: "Заявки на шоу", newTab: "Новая вкладка", bloggersTitle: "Блогеры и реклама", bloggersSubtitle: "Местные блогеры и реклама бизнеса за 7 дней.", hrTitle: "HR-лиды по вакансии", hrSubtitle: "Ответы кандидатов и этап найма.", showsTitle: "Заявки на ТВ-шоу", showsSubtitle: "Бренд-фейс и мобилографы в одном списке.", addPromo: "Добавить рекламу", addShow: "Добавить заявку", researchTitle: "Ресерч в Chrome раз в 2 недели", last7: "Последние 7 дней", allTime: "За всё время", allStages: "Все этапы", new: "Новая", contacted: "Связались", interview: "Собеседование", hired: "Принята", rejected: "Отказ", reviewed: "Просмотрена", casting: "Кастинг", chosen: "Выбрана", allCategories: "Все категории", brandFace: "Бренд-фейс", mobileographer: "Мобилограф", promoSearch: "Бизнес, блогер или телефон", searchNamePhone: "Имя или телефон", showSearch: "Имя, телефон или город" }, uz: { navHr: "HR arizalari", navBloggers: "Blogerlar", navShows: "Shou arizalari", newTab: "Yangi bo‘lim", bloggersTitle: "Blogerlar va reklama", bloggersSubtitle: "Mahalliy blogerlar va oxirgi 7 kundagi reklama.", hrTitle: "Vakansiya bo‘yicha arizalar", hrSubtitle: "Nomzod javoblari va ishga olish bosqichi.", showsTitle: "TV-shou arizalari", showsSubtitle: "Brend-feys va mobilograflar bitta ro‘yxatda.", addPromo: "Reklama qo‘shish", addShow: "Ariza qo‘shish", researchTitle: "Chrome’da har 2 haftada qidiruv", last7: "Oxirgi 7 kun", allTime: "Barcha vaqt", allStages: "Barcha bosqichlar", new: "Yangi", contacted: "Bog‘lanildi", interview: "Suhbat", hired: "Qabul qilindi", rejected: "Rad etildi", reviewed: "Ko‘rib chiqildi", casting: "Kasting", chosen: "Tanlandi", allCategories: "Barcha toifalar", brandFace: "Brend-feys", mobileographer: "Mobilograf", promoSearch: "Biznes, bloger yoki telefon", searchNamePhone: "Ism yoki telefon", showSearch: "Ism, telefon yoki shahar" } };
function applyLanguage() { document.documentElement.lang = state.language === "ru" ? "ru" : "uz-Latn"; document.querySelectorAll("[data-i18n]").forEach((node) => { const value = i18n[state.language][node.dataset.i18n]; if (value) node.textContent = value; }); document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { const value = i18n[state.language][node.dataset.i18nPlaceholder]; if (value) node.placeholder = value; }); }
$("languageToggle").onclick = () => { state.language = state.language === "ru" ? "uz" : "ru"; localStorage.setItem("crm-language", state.language); applyLanguage(); };
applyLanguage();
$("mobileLogoutBtn").onclick = () => $("logoutBtn").click();
$("logoutBtn").onclick = async () => {
  await db.auth.signOut();
  state.user = null;
  showLogin("Tizimdan chiqdingiz.", false);
};
async function telegramLogin() {
  const initData = window.Telegram?.WebApp?.initData || "";
  if (!initData) {
    showMessage("loginMessage", "CRM’ni Telegram botdagi sayt tugmasi orqali oching.", "error");
    return;
  }
  const button = $("loginBtn");
  button.disabled = true; button.textContent = "Tekshirilmoqda…";
  try {
    const response = await fetch(config.url + "/functions/v1/crm-telegram-login", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.publishableKey },
      body: JSON.stringify({ initData })
    });
    const result = await response.json();
    if (!response.ok || !result.token_hash) {
      const errors = { approval_required: "Kirish uchun CRM egasidan ruxsat oling.", login_not_configured: "Telegram orqali kirish sozlanmagan." };
      throw new Error(errors[result.error] || "Telegram orqali kirib bo‘lmadi.");
    }
    const auth = await db.auth.verifyOtp({ token_hash: result.token_hash, type: "magiclink" });
    if (auth.error) throw new Error("Kirishni yakunlab bo‘lmadi.");
    state.user = auth.data.user;
    showCRM();
    await loadData();
  } catch (error) {
    showMessage("loginMessage", error.message || "Kirish amalga oshmadi.", "error");
  } finally {
    button.disabled = false; button.textContent = "Telegram orqali kirish";
  }
}
$("loginBtn").onclick = telegramLogin;
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
  const session = await db.auth.getSession();
  state.user = session.data.session?.user || null;
  if (!state.user) {
    showLogin("", false);
    window.Telegram?.WebApp?.ready();
    return;
  }
  const name = state.user.user_metadata?.full_name || "Koordinator";
  $("profileName").textContent = name;
  $("avatar").textContent = initials(name);
  showCRM();
  await loadData();
  window.Telegram?.WebApp?.ready();
}
start();




