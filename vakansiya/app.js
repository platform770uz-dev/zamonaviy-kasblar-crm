Warning: truncated output (original token count: 8086)
Total output lines: 172

const SITE_CONFIG = {
  supabaseUrl: "https://uzivivmrixstxjvzkksz.supabase.co",
  publishableKey: "sb_publishable_8z5WQbInjqHDvigfDSOcuQ_Foq7LQWJ",
  submitFunction: "vacancy-assessment"
};

const copy = {
  uz: {
    roleChip: "Ochiq vakansiya", pathLabel: "YO‘LINGIZ", sideNote: "Bu yerda ish qanday ko‘rinishini bilib olasiz. Yosh emas, mijoz bilan ishlash va o‘rganishga tayyorlik muhim.", sideFoot: "Shoshilmasdan o‘ting", footerNote: "Savdo — bu avval tinglash va tushunish.",
    steps: ["Vakansiya", "Siz haqingizda", "3 ta dars", "Test"], progress: ["Boshlanish", "Qisqa anketa", "O‘rganish", "5 savol"],
    welcomeEyebrow: "B2B VAKILI · FARG‘ONA", welcomeTitle: "Yangi bizneslar bilan tanishing. Kelishuvlarni o‘zingiz olib boring.", welcomeLead: "Bu ish telefon orqali uzoq tushuntirishni talab qilmaydi. Avval rolni ko‘rib chiqing, uchta qisqa darsni o‘ting va beshta savolda o‘zingizni sinab ko‘ring.",
    introTitle1: "Nima taklif qilasiz?", introText1: "Bizneslar uchun qisqa Reels videolari va kompaniyada bir kunlik kontent suratga olish kampaniyasi.", introTitle2: "Ish nimadan iborat?", introText2: "Bizneslarga shaxsiy mashinada borish, tadbirkorlarni topish, ehtiyojini tinglash, xizmatni tushuntirish va shartnoma bo‘yicha kelishish.",
    conditions: "ISH SHAROITLARI", condition1: "Ish joyi", value1: "Farg‘ona", condition2: "Ish vaqti", value2: "Du–Ju 09:00–17:00 · Sha 09:00–14:30", condition3: "Daromad", value3: "2 mln so‘m + to‘langan shartnoma marjasidan 30%", travel: "Oldindan kelishilgan xizmat safarlari qoplanadi.", estimate: "Taxminan 7 daqiqa", start: "Vakansiya bilan tanishish", roleFooter: "Kerak: shaxsiy avtomobil. Yakuniy qaror suhbatda birga qabul qilinadi.",
    profileEyebrow: "QISQA ANKETA", profileTitle: "Avval ish sharoitlarini solishtiraylik", profileLead: "Quyidagilar bu ishga mos keladimi? Ism va telefon raqamini faqat oxirida so‘raymiz.", city: "Qaysi shahardansiz?", cityHint: "Hozir yashayotgan shaharingiz", cityPlaceholder: "Shaharni tanlang", cityOptions: ["Farg‘ona", "Marg‘ilon", "Qo‘qon", "Boshqa shahar"], license: "B toifali haydovchilik guvohnomangiz bormi?", yes: "Ha", no: "Yo‘q", car: "O‘zingizning mashinangiz bormi?", fuel: "Yoqilg‘i turi", fuelPlaceholder: "Tanlang", fuelOptions: ["Benzin", "Metan", "Propan", "Elektr", "Boshqa"], noCar: "Mashinangiz yo‘q", schedule: "Ko‘rsatilgan ish grafigida ishlay olasizmi?", can: "Ha, mos keladi", discuss: "Ba’zi kunlarini kelishib olish kerak", cannot: "Hozircha mos kelmaydi", next: "Darslarga o‘tish", back: "Orqaga", completeProfile: "Davom etish uchun har bir bandni belgilang.",
    lessonHeading: "Ishni uchta qisqa darsda ko‘rib chiqing", lessonSub: "Asosiy vazifalar va mijoz bilan ishlash tartibi.", lessonOf: "DARS", lessonNext: "Keyingi dars", startTest: "5 savolli testni boshlash", lessonTitles: ["Xizmat nimadan iborat?", "Uchrashuvni qanday boshlash?", "Mijozga aniq va halol taklif"], lessonBodies: ["Kampaniya biznes haqida qisqa intervyu va ijtimoiy tarmoqlar uchun Reels roliklarini o‘z ichiga oladi. Pullik paket 2 500 000 so‘mdan boshlanadi. Aniq tarkib, narx va to‘lov jadvali uchrashuvdan so‘ng kelishiladi.", "Avval biznes egasidan nimani rivojlantirmoqchi ekanini so‘rang. Javobini bo‘lmasdan tinglang, keyin xizmat tarkibini aynan shu ehtiyojga bog‘lab tushuntiring. Har bir biznes uchun bir xil matnni yoddan aytish shart emas.", "Aniq son va xizmatlarni tushuntiring, narxni yashirmang. Ko‘rishlar, mijozlar oqimi yoki savdoni kafolatlamang. Tadbirkor o‘ylab ko‘rmoqchi bo‘lsa, bosim o‘tkazmay, ma’lumot yuborish yoki keyinroq bog‘lanish vaqtini kelishing."], lessonCallouts: ["Siz videoni suratga olmaysiz — loyihani tushuntirib, biznes bilan kelishuvga kelasiz.", "Tadbirkor bilan umumiy til topish uchun savollar bering va uni diqqat bilan tinglang.", "Yaxshi vakil ishonchni saqlaydi: shartlar aniq va aytilgan gaplar tekshiriladi."],
    quizEyebrow: "VAZIYATLI TEST", quizTitle: "Ishda qanday yo‘l tutardingiz?", quizIntro: "Har bir savolda o‘zingizga eng yaqin javobni tanlang.", question: "Savol", quizNext: "Keyingi savol", seeResult: "Natijani ko‘rish", chooseAnswer: "Davom etishdan oldin javobni tanlang.",
    qs: [
      { tag: "ROLNI TUSHUNISH", text: "B2B vakilning asosiy vazifasi nima?", answers: ["Videolarni o‘zi suratga olib, montaj qilish", "Tadbirkorlarni topish, ehtiyojini tushunish va kampaniya bo‘yicha kelishish", "Ijtimoiy tarmoqlarda izoh yozish", "Mijozga qancha ko‘rish yig‘ilishini va’da qilish"], correct: 1 },
      { tag: "MULOQOT · VAZIYAT 1", text: "Tadbirkor hozir bandligini aytdi. Nima qilasiz?", answers: ["Paketning barcha shartlarini hozir aytib chiqaman", "Qachon qisqa gaplashish qulayligini so‘rayman yoki qulay vaqtda qayta bog‘lanaman", "Qayta qo‘ng‘iroq qilmayman", "Darhol shartnomaga imzo qo‘yishini so‘rayman"], correct: 1 },
      { tag: "MOSLASHUVCHANLIK", text: "Kutilmagan mijoz uchrashuvi sabab kunlik yo‘nalish o‘zgardi. Qanday javob berasiz?", answers: ["Ustuvor vazifalarni qayta rejalashtirib, tegishli odamlarga xabar beraman", "Har qanday o‘zgarishdan bosh tortaman", "Boshqalarga aytmay, qolgan uchrashuvlarni o‘tkazib yuboraman", "Ishni tashlab ketaman"], correct: 0 },
      { tag: "ISH SHARTLARI", text: "30% komissiya qachon hisoblanadi?", answers: ["Istalgan uchrashuvdan keyin", "Kelishilgan marjadan, shartnoma tuzilib to‘lov tushganidan keyin", "Har bir telefon qo‘ng‘irog‘i uchun", "Har oy qat’iy qo‘shimcha to‘lov sifatida"], correct: 1 },
      { tag: "MULOQOT · VAZIYAT 2", text: "Tadbirkor: «Narxi qimmat ekan», dedi. Eng yaxshi keyingi qadam qaysi?", answers: ["Narxni darhol yashirib, paket arzon deb aytaman", "E’tirozini aniqlashtiraman, biznes maqsadini so‘rayman va mos qismini bosimsiz tushuntiraman", "Ko‘p ko‘rish va savdoni kafolatlayman", "Suhbatni shu zahoti tugataman"], correct: 1 }
    ],
    resultEyebrow: "SIZNING NATIJANGIZ", resultTitle: "Test yakunlandi", totalScore: "Umumiy ball", communication: "Muloqot", flexibility: "Moslashuvchanlik", strong: "Kuchli natija", middle: "Aniqlashtirib suhbatlashish", low: "Darslarni qayta ko‘rib chiqish", resultStrong: "Siz rolning asosiy qismlarini va mijoz bilan muloqot vaziyatlarini yaxshi tushundingiz. Keyingi qadam — jonli suhbatda o‘zaro tanishish.", resultMiddle: "Boshlanish yaxshi. Javoblaringizni qisqa suhbatda, ayniqsa moslashuvchanlik va mijoz bilan aloqa bo‘yicha aniqlashtirish mumkin.", resultLow: "Kerakli darslarni takrorlab, testni qayta topshirishingiz mumkin.", scoreNote: "Test natijasi tanишувga yordam beradi; yakuniy qaror faqat test balli bilan qabul qilinmaydi.",
    contactTitle: "Natijangizni saqlash uchun aloqa qoldiring", contactLead: "Ism, telefon va javoblaringiz Zamonaviy Kasb HR CRM’iga yuboriladi. Ma’lumotlar Germaniyaning Frankfurt shahridagi serverda saqlanadi va faqat vakansiya bo‘yicha bog‘lanish uchun ishlatiladi.", name: "Ism-familiya", phone: "Telefon raqami", namePlaceholder: "Masalan, Ali Valiyev", phonePlaceholder: "+998 __ ___ __ __", consent: "Roziman: ismim, telefonim va javoblarim vakansiya bo‘yicha bog‘lanish uchun HR CRM’da qayta ishlanadi va Germaniyaning Frankfurt shahridagi serverda saqlanadi.", submit: "Natijani saqlash", sending: "Saqlanmoqda…", sentTitle: "Tayyor — javoblaringiz CRM’ga tushdi", sentText: "Rahmat! Natijangiz va aloqa ma’lumotlaringiz vakansiya jamoasiga yuborildi.", fail: "Hozir saqlab bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.", required: "Ism, to‘g‘ri telefon raqami va rozilik kerak.", home: "Bosh sahifaga",
  },
  ru: {
    roleChip: "Открытая вакансия", pathLabel: "ВАШ ПУТЬ", sideNote: "Здесь вы узнаете, как устроена работа. Важны не возраст, а готовность общаться с клиентами и учиться.", sideFoot:…4086 tokens truncated…ile.schedule) { $("#profileError").textContent = t("completeProfile"); return; }
    state.step = "lessons"; state.lesson = 0; render();
  };
}
function renderLesson() {
  const i = state.lesson;
  paint(`<p class="eyebrow">${t("lessonHeading")}</p><h2 class="section-heading">${t("lessonSub")}</h2><article class="lesson-card"><span class="lesson-number">${t("lessonOf")} 0${i + 1} / 03</span><h3 class="lesson-title">${t("lessonTitles")[i]}</h3><p class="lesson-text">${t("lessonBodies")[i]}</p><div class="lesson-callout">${t("lessonCallouts")[i]}</div><div class="lesson-dots">${[0,1,2].map((x) => `<span class="${x === i ? "active" : ""}"></span>`).join("")}</div></article><div class="action-row"><button class="btn secondary" id="back">← ${t("back")}</button><button class="btn" id="continue">${i === 2 ? t("startTest") : t("lessonNext")} <span class="btn-arrow">→</span></button></div>`);
  $("#back").onclick = () => { if (state.lesson > 0) state.lesson--; else state.step = "profile"; render(); };
  $("#continue").onclick = () => { if (i < 2) state.lesson++; else { state.step = "quiz"; state.question = 0; } render(); };
}
function renderQuestion() {
  const i = state.question, q = t("qs")[i];
  const letters = ["A", "B", "C", "D"];
  paint(`<p class="eyebrow">${t("quizEyebrow")}</p><h2 class="section-heading">${t("quizTitle")}</h2><p class="section-sub">${t("quizIntro")}</p><span class="question-count">${t("question")} 0${i + 1} / 05 · ${q.tag}</span><h3 class="question-title">${q.text}</h3><div class="answers">${q.answers.map((answer, n) => `<label class="answer-card"><input type="radio" name="quizAnswer" value="${n}" ${state.answers[i] === n ? "checked" : ""}><span class="answer-letter">${letters[n]}</span><span>${esc(answer)}</span></label>`).join("")}</div><div id="answerError" class="error-note"></div><div class="action-row"><button class="btn secondary" id="back">← ${t("back")}</button><button class="btn" id="continue">${i === 4 ? t("seeResult") : t("quizNext")} <span class="btn-arrow">→</span></button></div>`);
  document.querySelectorAll('input[name="quizAnswer"]').forEach((el) => el.onchange = (e) => state.answers[i] = Number(e.target.value));
  $("#back").onclick = () => { if (i > 0) state.question--; else state.step = "lessons"; render(); };
  $("#continue").onclick = () => {
    if (!Number.isInteger(state.answers[i])) { $("#answerError").textContent = t("chooseAnswer"); return; }
    if (i < 4) state.question++; else state.step = "contact";
    render();
  };
}
function scores() {
  const correct = t("qs").map((q, i) => state.answers[i] === q.correct);
  const total = correct.filter(Boolean).length;
  return { total, communication: Number(correct[1]) + Number(correct[4]), flexibility: Number(correct[2]) + Number(correct[4]), correct };
}
function band(total) { return total === 5 ? "strong" : total >= 3 ? "middle" : "low"; }
function renderContact() {
  const s = scores(), b = band(s.total);
  paint(`<p class="eyebrow">${t("resultEyebrow")}</p><h2 class="section-heading">${t("resultTitle")}</h2><div class="results-grid"><div class="score-card primary-score"><div class="score-label">${t("totalScore")}</div><div class="score-value">${s.total}<span class="score-denom">/ 5</span></div><span class="result-badge ${b}">${t(b)}</span></div><div class="score-card"><div class="score-label">${t("communication")}</div><div class="score-value">${s.communication}<span class="score-denom">/ 2</span></div></div><div class="score-card"><div class="score-label">${t("flexibility")}</div><div class="score-value">${s.flexibility}<span class="score-denom">/ 2</span></div></div></div><div class="result-note">${t("result" + b.charAt(0).toUpperCase() + b.slice(1))}<br><br>${t("scoreNote")}</div>
    <div class="contact-wrap"><p class="eyebrow">${t("contactTitle")}</p><p class="section-sub">${t("contactLead")}</p><form id="contactForm"><div class="contact-grid"><div><label class="field-label" for="candidateName">${t("name")}</label><input class="text-input" id="candidateName" name="name" autocomplete="name" maxlength="80" required placeholder="${t("namePlaceholder")}"></div><div><label class="field-label" for="candidatePhone">${t("phone")}</label><input class="text-input" id="candidatePhone" name="phone" type="tel" autocomplete="tel" maxlength="30" required placeholder="${t("phonePlaceholder")}"></div></div><label class="privacy-check"><input id="consent" type="checkbox" required><span>${t("consent")}</span></label><div id="contactError" class="error-note" role="status"></div><div class="action-row"><button type="button" class="btn secondary" id="back">← ${t("back")}</button><button type="submit" class="btn" id="submit">${t("submit")} <span class="btn-arrow">→</span></button></div></form></div>`);
  $("#back").onclick = () => { state.step = "quiz"; state.question = 4; render(); };
  $("#contactForm").onsubmit = submitCandidate;
}
async function submitCandidate(event) {
  event.preventDefault();
  if (state.saving) return;
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  if (name.length < 2 || phone.replace(/\D/g, "").length < 9 || !$("#consent").checked) { $("#contactError").textContent = t("required"); return; }
  const button = $("#submit");
  state.saving = true; button.disabled = true; button.innerHTML = `${t("sending")} <span class="btn-arrow">…</span>`; $("#contactError").textContent = "";
  const s = scores();
  const payload = { full_name: name, phone, city: state.profile.city, license: state.profile.license, car: state.profile.car, fuel: state.profile.fuel, schedule: state.profile.schedule, answers: state.answers, language: state.lang, started_at: new Date(state.startedAt).toISOString(), consent: $("#consent").checked, honeypot: "" };
  try {
    const response = await fetch(`${SITE_CONFIG.supabaseUrl}/functions/v1/${SITE_CONFIG.submitFunction}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: SITE_CONFIG.publishableKey }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("submit failed");
    const result = await response.json();
    if (result?.ok !== true || result?.score !== s.total) throw new Error("invalid result");
    state.step = "done"; render();
  } catch {
    $("#contactError").textContent = t("fail"); state.saving = false; button.disabled = false; button.innerHTML = `${t("submit")} <span class="btn-arrow">→</span>`;
  }
}
function renderDone() {
  const s = scores(), b = band(s.total);
  paint(`<p class="eyebrow">${t("resultEyebrow")}</p><h2 class="section-heading">${t("resultTitle")}</h2><div class="results-grid"><div class="score-card primary-score"><div class="score-label">${t("totalScore")}</div><div class="score-value">${s.total}<span class="score-denom">/ 5</span></div><span class="result-badge ${b}">${t(b)}</span></div><div class="score-card"><div class="score-label">${t("communication")}</div><div class="score-value">${s.communication}<span class="score-denom">/ 2</span></div></div><div class="score-card"><div class="score-label">${t("flexibility")}</div><div class="score-value">${s.flexibility}<span class="score-denom">/ 2</span></div></div></div><div class="success-panel"><span class="success-icon">✓</span><h3>${t("sentTitle")}</h3><p>${t("sentText")}</p></div><div class="action-row"><span class="fineprint">${t("scoreNote")}</span><button class="btn secondary" id="reset">${t("home")}</button></div>`);
  $("#reset").onclick = () => { state.step = "welcome"; state.lesson = 0; state.question = 0; state.answers = []; state.startedAt = Date.now(); state.profile = { city: "", license: "", car: "", fuel: "", schedule: "" }; state.saving = false; render(); };
}

document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => { state.lang = button.dataset.lang; localStorage.setItem("zk-lang", state.lang); render(); }));
render();

