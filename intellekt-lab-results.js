const config = window.SUPABASE_CONFIG || {};
const endpoint = String(config.url || "").replace(/\/$/, "");
const authStorageKey = "sb-uzivivmrixstxjvzkksz-auth-token";
const questions = ["Sonlar ketma-ketligini davom ettiring: 2, 4, 6, 8, ?","Sardorda 5 ta qalam bor edi. U yana 3 ta qalam oldi va 2 tasini do‘stiga berdi. Unda nechta qalam qoldi?","Ranglar ketma-ketligida qaysi rang keyingi bo‘ladi?","To‘rtta qutining har birida 3 tadan olma bor. Jami nechta olma bor?","Aziza Loladan balandroq. Lola esa Maftunadan balandroq. Eng baland kim?","Yetishmayotgan sonni toping: 1, 3, 6, 10, 15, ?","Xonada 4 nafar bola bor. Har biri boshqa bolalarning har biri bilan faqat bir martadan qo‘l berib ko‘rishdi. Jami nechta qo‘l berib ko‘rishish bo‘ldi?","Qopda 4 ta qizil va 4 ta ko‘k shar bor. Qorong‘ida qopdan ko‘rmasdan kamida nechta shar olish kerakki, albatta ikkita bir xil rangli shar chiqsin?","Soat 09:45 bo‘lsa, 30 daqiqadan keyin soat nechchi bo‘ladi?","Aziza, Kamron va Farhodning har biri bittadan turli rangdagi futbolka kiygan: qizil, ko‘k va yashil. Kamron qizil kiygan. Aziza yashil kiymagan. Farhodning futbolkasi qanday rangda?","Ali ikki nafar do‘stidan shaxmatni yoqtirishini so‘radi. Ikkalasi ham «ha» dedi. Ali: «Demak, sinfimizdagi hamma shaxmatni yaxshi ko‘radi», dedi. Uning xulosasini qanday tekshirish mumkin?","Telegramda «Ertaga maktabda dars bo‘lmaydi» degan xabar tarqaldi. Lekin maktab tomonidan hech qanday rasmiy e’lon berilmadi. Nima qilish kerak?","Dilshod yangi ruchka sotib oldi va ertasi kuni matematikadan 5 baho oldi. U: «Yangi ruchkam sababli 5 oldim», dedi. Qaysi fikr mantiqan to‘g‘riroq?","Quyidagi gaplardan qaysi biri shaxsiy fikr emas, tekshiriladigan fakt hisoblanadi?","Maktabda 400 nafar o‘quvchi bor. Bir bola ulardan faqat 6 nafari bilan suhbatlashdi. Oltitasi ham futbolni yoqtirishini aytdi. Bola «Maktabimizdagi hamma futbolni yaxshi ko‘radi», dedi. Bu xulosada qanday muammo bor?","Agar yomg‘ir yog‘sa, hovlidagi yer ho‘l bo‘ladi. Ertalab yer ho‘l ekanini ko‘rdingiz. Bu albatta yomg‘ir yog‘ganini anglatadimi?","Asal bitta matematik masalani 5 daqiqada, Sardor esa 7 daqiqada yechdi. Bundan Asal barcha fanlarda Sardordan aqlliroq degan xulosa chiqarish mumkinmi?","Siz ikki xil suvning o‘simlik o‘sishiga ta’sirini solishtirmoqchisiz. Qaysi tajriba usuli eng adolatli?","Internetda o‘qituvchi o‘quvchiga baland ovozda gapirayotgan 10 soniyalik video tarqaldi. Nima qilish to‘g‘riroq?","Internetda bir mavzu bo‘yicha turli ma’lumotlar berilgan. Qaysi ma’lumotga ishonish uchun kuchliroq asos bor?","Oddiy qutining yangi hayoti","Yomg‘irli kun","Aqlli maktab sumkasi","Jonlangan kitob","Yangi do‘st","Kichik ixtirochi","Sehrli kutubxona","Elektrsiz dars","Ikki narsadan bitta ixtiro","Kelajak maktabi"];

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

function addText(parent, label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("b");
  strong.textContent = label + ": ";
  row.append(strong, document.createTextNode(value || "—"));
  parent.appendChild(row);
}

function makePage() {
  if (document.getElementById("intellektLabResultsPage")) return;
  const page = document.createElement("section");
  page.id = "intellektLabResultsPage";
  page.className = "page";
  const heading = document.createElement("div");
  heading.className = "page-heading";
  const intro = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "INTELLEKT LAB";
  const title = document.createElement("h1");
  title.textContent = "Bolalar testlari";
  const subtitle = document.createElement("p");
  subtitle.className = "subtle";
  subtitle.textContent = "Faqat ota-ona yoki qonuniy vakil rozilik bergan natijalar. Kreativ javoblar ochiq matn ko‘rinishida saqlanadi.";
  intro.append(eyebrow, title, subtitle);
  const refresh = document.createElement("button");
  refresh.className = "button secondary";
  refresh.type = "button";
  refresh.textContent = "Yangilash";
  refresh.addEventListener("click", renderResults);
  heading.append(intro, refresh);
  const list = document.createElement("div");
  list.id = "intellektLabResultsList";
  list.className = "crm-list";
  list.textContent = "Rozilik bilan yuborilgan test natijalari hozircha yo‘q.";
  page.append(heading, list);
  document.getElementById("workspace")?.appendChild(page);
}

function makeNav() {
  const nav = document.querySelector(".side-nav");
  if (!nav || document.getElementById("intellektLabResultsNav")) return;
  const button = document.createElement("button");
  button.id = "intellektLabResultsNav";
  button.className = "nav-item";
  button.innerHTML = '<span class="nav-icon">🧠</span><span>Intellekt Lab</span>';
  button.addEventListener("click", async () => {
    if (!(await isManager())) {
      button.remove();
      document.getElementById("intellektLabResultsPage")?.remove();
      return;
    }
    makePage();
    document.querySelectorAll(".page").forEach((node) => node.classList.remove("active"));
    document.querySelectorAll("[data-view]").forEach((node) => node.classList.remove("active"));
    button.classList.add("active");
    document.getElementById("intellektLabResultsPage").classList.add("active");
    await renderResults();
  });
  const anchor = document.getElementById("newCustomTab");
  if (anchor?.parentNode === nav) nav.insertBefore(button, anchor);
  else nav.appendChild(button);
}

function makeAnswerList(answers) {
  const details = document.createElement("details");
  details.className = "review";
  const summary = document.createElement("summary");
  summary.textContent = "Barcha 30 javobni ko‘rish";
  details.appendChild(summary);
  const list = document.createElement("div");
  list.className = "custom-record-fields";
  questions.forEach((question, i) => {
    const row = document.createElement("div");
    row.className = "custom-record-field";
    const label = document.createElement("span");
    label.textContent = String(i + 1).padStart(2, "0") + ". " + question;
    const value = document.createElement("strong");
    const answer = answers?.[i];
    value.textContent = i < 20
      ? (Number.isInteger(answer) && answer >= 0 && answer < 4 ? "Javob varianti " + String.fromCharCode(65 + answer) : "Javobsiz")
      : (typeof answer === "string" && answer.trim() ? answer : "Javobsiz");
    row.append(label, value);
    list.appendChild(row);
  });
  details.appendChild(list);
  return details;
}

function makeCard(item) {
  const card = document.createElement("article");
  card.className = "crm-card";
  const body = document.createElement("div");
  body.className = "crm-card-main";
  const title = document.createElement("h2");
  title.textContent = item.child_name || "Ism yoki taxallus kiritilmagan";
  body.appendChild(title);
  addText(body, "Yosh guruhi", item.age_group === "7-10" ? "7–10" : "11–14");
  addText(body, "Mantiqiy fikrlash", String(item.logic_score) + "/10");
  addText(body, "Tanqidiy fikrlash", String(item.critical_score) + "/10");
  addText(body, "Avtomatik jami", String(item.logic_score + item.critical_score) + "/20");
  addText(body, "Rozilik matni versiyasi", item.consent_version);
  addText(body, "Rozilik vaqti", item.consent_at ? new Date(item.consent_at).toLocaleString("uz-UZ") : "—");
  addText(body, "Yuborilgan", item.created_at ? new Date(item.created_at).toLocaleString("uz-UZ") : "—");
  card.append(body, makeAnswerList(item.answers || []));
  return card;
}

async function renderResults() {
  const list = document.getElementById("intellektLabResultsList");
  if (!list || !(await isManager())) {
    if (list) list.textContent = "Rahbar ruxsati topilmadi.";
    return;
  }
  list.textContent = "Yuklanmoqda…";
  try {
    const response = await managerRequest("/rest/v1/intellekt_lab_results?select=id,child_name,age_group,answers,logic_score,critical_score,consent_version,consent_at,created_at&order=created_at.desc&limit=300");
    if (!response.ok) throw new Error("read_failed");
    const rows = await response.json();
    list.replaceChildren();
    if (!rows.length) {
      list.textContent = "Rozilik bilan yuborilgan test natijalari hozircha yo‘q.";
      return;
    }
    rows.forEach((item) => list.appendChild(makeCard(item)));
  } catch {
    list.textContent = "Test natijalarini yuklab bo‘lmadi. Bo‘lim yoki rahbar ruxsati hali ulanmagan bo‘lishi mumkin.";
  }
}

let checks = 0;
const timer = setInterval(async () => {
  checks++;
  if (sessionToken()) {
    clearInterval(timer);
    if (await isManager()) {
      makePage();
      makeNav();
    }
  }
  if (checks >= 30) clearInterval(timer);
}, 1000);
