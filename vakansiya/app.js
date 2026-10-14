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
    roleChip: "Открытая вакансия", pathLabel: "ВАШ ПУТЬ", sideNote: "Здесь вы узнаете, как устроена работа. Важны не возраст, а готовность общаться с клиентами и учиться.", sideFoot: "Проходите в своём темпе", footerNote: "Продажа начинается с умения слушать.",
    steps: ["Вакансия", "О вас", "3 урока", "Тест"], progress: ["Старт", "Короткая анкета", "Обучение", "5 вопросов"],
    welcomeEyebrow: "B2B-ПРЕДСТАВИТЕЛЬ · ФЕРГАНА", welcomeTitle: "Знакомьтесь с бизнесами. Ведите переговоры сами.", welcomeLead: "Эту работу не нужно долго объяснять по телефону. Сначала посмотрите, в чём она заключается, пройдите три коротких урока и ответьте на пять вопросов.",
    introTitle1: "Что вы предлагаете?", introText1: "Короткие Reels-видео для бизнеса и контент-съёмку в компании в формате кампании.", introTitle2: "Что нужно делать?", introText2: "Ездить к бизнесам на личном автомобиле, находить предпринимателей и узнавать их задачи, представлять услугу и договариваться о сотрудничестве.",
    conditions: "УСЛОВИЯ РАБОТЫ", condition1: "Место работы", value1: "Фергана", condition2: "График", value2: "Пн–Пт 09:00–17:00 · Сб 09:00–14:30", condition3: "Доход", value3: "2 млн сум + 30% маржи по оплаченному договору", travel: "Согласованные рабочие поездки компенсируются.", estimate: "Около 7 минут", start: "Познакомиться с вакансией", roleFooter: "Нужен личный автомобиль. Окончательное решение принимается вместе после собеседования.",
    profileEyebrow: "КОРОТКАЯ АНКЕТА", profileTitle: "Сначала сверим рабочие условия", profileLead: "Подходят ли вам эти требования? Имя и телефон спросим только в конце.", city: "В каком городе вы живёте?", cityHint: "Укажите город проживания", cityPlaceholder: "Выберите город", cityOptions: ["Фергана", "Маргилан", "Коканд", "Другой город"], license: "Есть водительское удостоверение категории B?", yes: "Да", no: "Нет", car: "Есть личный автомобиль?", fuel: "Тип топлива", fuelPlaceholder: "Выберите", fuelOptions: ["Бензин", "Метан", "Пропан", "Электро", "Другое"], noCar: "Личного автомобиля нет", schedule: "Подходит указанный рабочий график?", can: "Да, подходит", discuss: "Нужно обсудить отдельные дни", cannot: "Пока не подходит", next: "Перейти к урокам", back: "Назад", completeProfile: "Выберите ответ в каждом пункте.",
    lessonHeading: "Три коротких урока о работе", lessonSub: "Основные задачи и порядок общения с клиентом.", lessonOf: "УРОК", lessonNext: "Следующий урок", startTest: "Начать тест из 5 вопросов", lessonTitles: ["Что входит в услугу?", "Как начать встречу?", "Честное и точное предложение"], lessonBodies: ["Кампания включает короткое интервью о бизнесе и Reels для соцсетей. Платный пакет начинается от 2 500 000 сум. Точный состав, цена и график оплаты согласуются после встречи.", "Сначала спросите владельца бизнеса, что он хочет развивать. Выслушайте, не перебивая, а затем свяжите состав услуги с его задачей. Необязательно повторять один и тот же текст каждому клиенту.", "Объясняйте точный объём услуг и не скрывайте цену. Не обещайте просмотры, поток клиентов или продажи. Если предприниматель хочет подумать, не давите: предложите отправить информацию и договоритесь, когда связаться снова."], lessonCallouts: ["Siz videoni suratga olmaysiz — loyihani tushuntirib, biznes bilan kelishuvga kelasiz.", "Tadbirkor bilan umumiy til topish uchun savollar bering va uni diqqat bilan tinglang.", "Yaxshi vakil ishonchni saqlaydi: shartlar aniq va aytilgan gaplar tekshiriladi."],
    quizEyebrow: "СИТУАЦИОННЫЙ ТЕСТ", quizTitle: "Как бы вы поступили в работе?", quizIntro: "В каждом вопросе выберите ответ, который кажется вам лучшим.", question: "Вопрос", quizNext: "Следующий вопрос", seeResult: "Посмотреть результат", chooseAnswer: "Выберите ответ, чтобы продолжить.",
    qs: [
      { tag: "ПОНИМАНИЕ РОЛИ", text: "В чём главная задача B2B-представителя?", answers: ["Самому снимать и монтировать видео", "Находить предпринимателей, выяснять их задачи и договариваться о кампании", "Писать комментарии в соцсетях", "Обещать клиенту определённое число просмотров"], correct: 1 },
      { tag: "ОБЩЕНИЕ · СИТУАЦИЯ 1", text: "Предприниматель говорит, что сейчас занят. Что вы сделаете?", answers: ["Сразу подробно расскажу все условия пакета", "Спрошу, когда удобно коротко поговорить, или свяжусь позже в подходящее время", "Больше не буду звонить", "Попрошу сразу подписать договор"], correct: 1 },
      { tag: "ГИБКОСТЬ", text: "Из-за встречи с клиентом изменился маршрут на день. Как вы поступите?", answers: ["Перепланирую приоритеты и предупрежу тех, кого касается изменение", "Откажусь от любых изменений", "Ничего никому не скажу и пропущу остальные встречи", "Просто закончу рабочий день"], correct: 0 },
      { tag: "УСЛОВИЯ РАБОТЫ", text: "Когда начисляется комиссия 30%?", answers: ["После любой встречи", "От согласованной маржи, когда договор заключён и оплата получена", "За каждый телефонный звонок", "Как фиксированная доплата каждый месяц"], correct: 1 },
      { tag: "ОБЩЕНИЕ · СИТУАЦИЯ 2", text: "Предприниматель говорит: «Для нас это дорого». Как лучше продолжить?", answers: ["Скрою цену и скажу, что пакет дешёвый", "Уточню возражение и задачу бизнеса, затем спокойно расскажу о подходящей части услуги", "Пообещаю много просмотров и продаж", "Сразу закончу разговор"], correct: 1 }
    ],
    resultEyebrow: "ВАШ РЕЗУЛЬТАТ", resultTitle: "Тест завершён", totalScore: "Общий балл", communication: "Общение", flexibility: "Гибкость", strong: "Сильный результат", middle: "Нужно уточнить на беседе", low: "Повторить уроки", resultStrong: "Вы хорошо поняли основные задачи и ситуации общения с клиентом. Следующий шаг — познакомиться на коротком разговоре.", resultMiddle: "Хорошее начало. На коротком разговоре можно уточнить ответы, особенно про гибкость и контакт с клиентом.", resultLow: "Kerakli darslarni takrorlab, testni qayta topshirishingiz mumkin.", scoreNote: "Тест помогает начать знакомство; решение не принимается только по баллу.",
    contactTitle: "Оставьте контакт, чтобы сохранить результат", contactLead: "Имя, телефон и ответы будут переданы в HR CRM Zamonaviy Kasb. Сервер проекта расположен во Франкфурте, Германия. Данные используются только для связи по вакансии.", name: "Имя и фамилия", phone: "Номер телефона", namePlaceholder: "Например, Али Валиев", phonePlaceholder: "+998 __ ___ __ __", consent: "Согласен(на): имя, телефон и ответы будут обработаны в HR CRM для связи по вакансии и сохранены на сервере во Франкфурте, Германия.", submit: "Сохранить результат", sending: "Сохраняем…", sentTitle: "Готово — ответы сохранены в CRM", sentText: "Спасибо! Ваш результат и контакты отправлены команде по вакансии.", fail: "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.", required: "Укажите имя, корректный номер и согласие.", home: "На главную"
  }
};

const steps = ["welcome", "profile", "lessons", "quiz", "contact", "done"];
const state = { lang: localStorage.getItem("zk-lang") || "uz", step: "welcome", lesson: 0, question: 0, profile: { city: "", license: "", car: "", fuel: "", schedule: "" }, answers: [], startedAt: Date.now(), saving: false };
const $ = (selector) => document.querySelector(selector);
const view = $("#view");
const t = (key) => copy[state.lang][key];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function refreshChrome() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => { const key = el.dataset.i18n; if (t(key)) el.textContent = t(key); });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    const active = button.dataset.lang === state.lang;
    button.classList.toggle("selected", active); button.setAttribute("aria-pressed", String(active));
  });
  const stepNum = Math.min(steps.indexOf(state.step), 3);
  $("#stepList").innerHTML = t("steps").map((label, i) => `<div class="step-item ${i === stepNum ? "active" : i < stepNum ? "done" : ""}"><span class="step-number">${i < stepNum ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${esc(label)}</span></div>`).join("");
  $("#progressLabel").textContent = t("progress")[stepNum];
  $("#progressFill").style.width = `${Math.max(9, [0, 26, 51, 77, 100, 100][steps.indexOf(state.step)] || 9)}%`;
  $("#year").textContent = new Date().getFullYear();
}

function paint(html) { refreshChrome(); view.innerHTML = html; view.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

function render() {
  refreshChrome();
  if (state.step === "welcome") renderWelcome();
  if (state.step === "profile") renderProfile();
  if (state.step === "lessons") renderLesson();
  if (state.step === "quiz") renderQuestion();
  if (state.step === "contact") renderContact();
  if (state.step === "done") renderDone();
}

function renderWelcome() {
  paint(`<p class="eyebrow">${t("welcomeEyebrow")}</p><h1>${t("welcomeTitle")}</h1><p class="lead">${t("welcomeLead")}</p>
    <div class="intro-grid"><article class="intro-card"><div class="intro-card-head"><span class="mini-icon">◉</span>${t("introTitle1")}</div><p>${t("introText1")}</p></article><article class="intro-card"><div class="intro-card-head"><span class="mini-icon">↗</span>${t("introTitle2")}</div><p>${t("introText2")}</p></article></div>
    <div class="condition-strip"><p class="condition-title">${t("conditions")}</p><div class="condition-grid"><div><span>${t("condition1")}</span><b>${t("value1")}</b></div><div><span>${t("condition2")}</span><b>${t("value2")}</b></div><div><span>${t("condition3")}</span><b>${t("value3")}</b></div></div><p class="condition-title" style="margin-top:12px;letter-spacing:.2px;text-transform:none">${t("travel")}</p></div>
    <div class="time-estimate"><span>◷</span>${t("estimate")}</div><div class="action-row"><span class="fineprint">${t("roleFooter")}</span><button class="btn" id="begin">${t("start")} <span class="btn-arrow">→</span></button></div>`);
  $("#begin").onclick = () => { state.step = "profile"; render(); };
}

function radioGroup(name, values, selected, labels) {
  return `<div class="choice-grid">${values.map((value, i) => `<label class="choice-card"><input type="radio" name="${name}" value="${esc(value)}" ${selected === value ? "checked" : ""}><span class="radio-mark"></span><span>${esc(labels[i])}</span></label>`).join("")}</div>`;
}
function renderProfile() {
  const cities = t("cityOptions"), fuels = t("fuelOptions");
  paint(`<p class="eyebrow">${t("profileEyebrow")}</p><h2 class="section-heading">${t("profileTitle")}</h2><p class="section-sub">${t("profileLead")}</p>
    <div class="profile-form"><div><label class="field-label" for="city">${t("city")}</label><p class="field-hint">${t("cityHint")}</p><select class="select-input" id="city"><option value="">${t("cityPlaceholder")}</option>${cities.map((x) => `<option ${state.profile.city === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
    <div><p class="field-label">${t("license")}</p>${radioGroup("license", ["yes", "no"], state.profile.license, [t("yes"), t("no")])}</div>
    <div><p class="field-label">${t("car")}</p>${radioGroup("car", ["yes", "no"], state.profile.car, [t("yes"), t("no")])}</div>
    <div><label class="field-label" for="fuel">${t("fuel")}</label><select class="select-input" id="fuel"><option value="">${t("fuelPlaceholder")}</option>${[...fuels, t("noCar")].map((x) => `<option ${state.profile.fuel === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
    <div><p class="field-label">${t("schedule")}</p>${radioGroup("schedule", ["yes", "discuss", "no"], state.profile.schedule, [t("can"), t("discuss"), t("cannot")])}</div></div>
    <div id="profileError" class="error-note"></div><div class="action-row"><button class="btn secondary" id="back">← ${t("back")}</button><button class="btn" id="continue">${t("next")} <span class="btn-arrow">→</span></button></div>`);
  $("#city").onchange = (e) => state.profile.city = e.target.value;
  $("#fuel").onchange = (e) => state.profile.fuel = e.target.value;
  document.querySelectorAll('input[name="license"]').forEach((el) => el.onchange = (e) => state.profile.license = e.target.value);
  document.querySelectorAll('input[name="car"]').forEach((el) => el.onchange = (e) => state.profile.car = e.target.value);
  document.querySelectorAll('input[name="schedule"]').forEach((el) => el.onchange = (e) => state.profile.schedule = e.target.value);
  $("#back").onclick = () => { state.step = "welcome"; render(); };
  $("#continue").onclick = () => {
    if (!state.profile.city || !state.profile.license || !state.profile.car || !state.profile.fuel || !state.profile.schedule) { $("#profileError").textContent = t("completeProfile"); return; }
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

