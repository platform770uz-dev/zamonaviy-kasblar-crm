// Worksheets «O'quvchi varaqasi» for the «Dars yoʻli» course lessons, in the layout of «3-dars: Murodjon suratga oladi».
// Each lesson is an entry of LESSONS below (scenes are inline SVG in SCENES). A sheet fits one A4 page: the print scale
// shrinks until it does. Usage (Playwright with its Chromium must be installed):
//   NODE_PATH=$(npm root -g) node tools/varaqa/gen.js 6     -> dars-yoli/varaqalar/6-dars.pdf (+ html/png previews in /tmp)
// After a new sheet: add the lesson row to tez_aytish_course_lessons (sheet_url = the GitHub Pages address of the PDF).
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const OUT = process.env.OUT || path.join(__dirname, "../../dars-yoli/varaqalar");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "varaqa-"));

const C = { ink: "#1E2235", orange: "#F28C28", orangeD: "#E0701A", skin: "#F2C094", hair: "#5B3A29", cream: "#FFF1DF", blue: "#E6EDF8", mint: "#E2F2E8", pink: "#FBE7E4", red: "#D93A2B", green: "#2E9E5B", gray: "#9AA1AE" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- drawing helpers (SVG strings) ----------
function murodjon(x, y, s = 1, mood = "happy", arm = false) {
  const eyes = mood === "happy"
    ? `<path d="M35 39 Q38 35 41 39" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/><path d="M49 39 Q52 35 55 39" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
    : `<circle cx="38" cy="38" r="2.6" fill="${C.ink}"/><circle cx="52" cy="38" r="2.6" fill="${C.ink}"/><path d="M33 31 L41 30" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/><path d="M49 30 L57 31" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>`;
  const mouth = mood === "happy"
    ? `<path d="M37 46 Q45 54 53 46" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
    : mood === "worry"
      ? `<path d="M39 50 Q45 46 51 50" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`
      : `<path d="M40 49 L50 48" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/>`;
  const raised = arm
    ? `<path d="M74 84 Q86 70 88 50" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/><path d="M74 84 Q86 70 88 50" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round"/><circle cx="88" cy="47" r="6" fill="${C.skin}" stroke="${C.ink}" stroke-width="2"/>`
    : "";
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${raised}
    <path d="M8 112 Q8 70 45 66 Q82 70 82 112 Z" fill="#fff" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M27 112 L27 80 Q45 73 63 80 L63 112 Z" fill="${C.orange}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="37" y="91" width="16" height="11" rx="2.5" fill="${C.orangeD}" stroke="${C.ink}" stroke-width="2"/>
    <rect x="39" y="55" width="12" height="13" fill="${C.skin}" stroke="${C.ink}" stroke-width="2"/>
    <circle cx="45" cy="38" r="22" fill="${C.skin}" stroke="${C.ink}" stroke-width="2.5"/>
    <path d="M23 37 Q20 13 45 13 Q70 13 67 37 Q62 23 46 25 Q31 24 23 37 Z" fill="${C.hair}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
    ${eyes}${mouth}
  </g>`;
}
function bubble(x, y, w, h, text, tailX, fs = 12.5) {
  const tx = tailX ?? x + 26;
  return `<g><path d="M${tx - 8} ${y + h - 1} L${tx - 2} ${y + h + 13} L${tx + 10} ${y + h - 1}" fill="#fff" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#fff" stroke="${C.ink}" stroke-width="2"/>
    <rect x="${tx - 7}" y="${y + h - 4}" width="16" height="5" fill="#fff"/>
    <text x="${x + w / 2}" y="${y + h / 2 + fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${C.ink}">${esc(text)}</text></g>`;
}
function phone(x, y, w, h, inner = "") {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.ink}"/><rect x="${x + 5}" y="${y + 9}" width="${w - 10}" height="${h - 18}" rx="4" fill="#fff"/>${inner}</g>`;
}
const check = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="9" fill="${C.green}"/><path d="M-4.5 0 L-1 3.5 L5 -3.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const cross = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="9" fill="${C.red}"/><path d="M-3.8 -3.8 L3.8 3.8 M3.8 -3.8 L-3.8 3.8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></g>`;
const samsa = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 22 L14 0 L28 22 Z" fill="#E9A54A" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/><circle cx="10" cy="15" r="1.4" fill="${C.ink}"/><circle cx="17" cy="12" r="1.4" fill="${C.ink}"/></g>`;
const heart = (x, y, s = 1, fill = C.red) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -3 C-3 -9 -12 -7 -12 0 C-12 6 -4 10 0 14 C4 10 12 6 12 0 C12 -7 3 -9 0 -3 Z" fill="${fill}"/>`;
const lines = (x, y, w, n, gap = 9, color = "#C9CED8") => Array.from({ length: n }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i === n - 1 ? w * 0.6 : w}" height="4" rx="2" fill="${color}"/>`).join("");
const chip = (x, y, text, ok) => `<g><rect x="${x}" y="${y}" width="${text.length * 7.6 + 34}" height="24" rx="12" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><text x="${x + 11}" y="${y + 16.5}" font-size="12.5" font-weight="700" fill="${C.ink}">${esc(text)}</text>${ok ? check(x + text.length * 7.6 + 21, y + 12, 0.8) : cross(x + text.length * 7.6 + 21, y + 12, 0.8)}</g>`;
const comment = (x, y, w, name, text, color = "#7AA7E0") => `<g><rect x="${x}" y="${y}" width="${w}" height="30" rx="8" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><circle cx="${x + 15}" cy="${y + 15}" r="8" fill="${color}" stroke="${C.ink}" stroke-width="1.5"/><text x="${x + 29}" y="${y + 12.5}" font-size="8.5" font-weight="700" fill="${C.gray}">${esc(name)}</text><text x="${x + 29}" y="${y + 24}" font-size="10.5" font-weight="700" fill="${C.ink}">${esc(text)}</text></g>`;

// Each scene: viewBox 0 0 360 150.
const SCENES = {
  hero4: () => `${murodjon(28, 34, 1, "happy", true)}${bubble(14, 8, 186, 28, "Bugun reelsni joylaymiz!", 70)}
    ${phone(232, 10, 86, 132, `${samsa(250, 44, 1.1)}${samsa(276, 50, 0.9)}<rect x="244" y="82" width="62" height="5" rx="2.5" fill="#C9CED8"/><rect x="244" y="92" width="44" height="5" rx="2.5" fill="#C9CED8"/><rect x="247" y="108" width="56" height="20" rx="10" fill="${C.orange}"/><text x="275" y="122" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">Joylash</text>`)}`,
  t4_1: () => `${murodjon(18, 40, 0.95, "think")}${bubble(34, 8, 188, 28, "Qanday sarlavha yozaman?", 60)}
    ${phone(236, 8, 92, 134, `<rect x="246" y="24" width="72" height="56" rx="4" fill="${C.cream}"/>${samsa(268, 38, 1.1)}<text x="246" y="98" font-size="10" font-weight="700" fill="${C.ink}">Sarlavha:</text><rect x="246" y="104" width="72" height="20" rx="4" fill="#fff" stroke="${C.orange}" stroke-width="2" stroke-dasharray="4 3"/><text x="282" y="118" text-anchor="middle" font-size="12" font-weight="700" fill="${C.orange}">?</text>`)}`,
  t4_2: () => `${murodjon(14, 40, 0.95, "think")}${bubble(34, 8, 150, 28, "Qaysi heshteg mos?", 56)}
    ${chip(200, 40, "#samsa", true)}${chip(218, 68, "#oshxona", true)}${chip(200, 96, "#toshkent", true)}${chip(226, 124, "#futbol", false)}`,
  t4_3: () => `${murodjon(10, 40, 0.95, "think")}${bubble(34, 8, 156, 28, "Qaysi muqova yaxshi?", 56)}
    ${phone(200, 46, 62, 100, `<rect x="205" y="55" width="52" height="82" rx="4" fill="#5E6470"/><circle cx="226" cy="88" r="13" fill="#767C88"/><circle cx="240" cy="108" r="9" fill="#6B717D"/>`)}<text x="231" y="42" text-anchor="middle" font-size="12" font-weight="800" fill="${C.ink}">A</text>
    ${phone(280, 46, 62, 100, `<rect x="285" y="55" width="52" height="82" rx="4" fill="#FFD9A8"/>${samsa(296, 70, 1.05)}<rect x="288" y="102" width="46" height="24" rx="4" fill="${C.ink}"/><text x="311" y="113" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">SAMSA</text><text x="311" y="123" text-anchor="middle" font-size="9" font-weight="800" fill="${C.orange}">60 s</text>`)}<text x="311" y="42" text-anchor="middle" font-size="12" font-weight="800" fill="${C.ink}">B</text>`,
  t4_4: () => `${murodjon(10, 40, 0.95, "think")}${bubble(34, 8, 150, 28, "Qachon joylayman?", 56)}
    <text x="244" y="24" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.ink}">Onlayn obunachilar</text>
    <line x1="192" y1="128" x2="336" y2="128" stroke="${C.ink}" stroke-width="2"/>
    <rect x="200" y="${128 - 15}" width="34" height="15" fill="#AFC3E6" stroke="${C.ink}" stroke-width="1.5"/><text x="217" y="${128 - 19}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">15</text><text x="217" y="142" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">08:00</text>
    <rect x="246" y="${128 - 40}" width="34" height="40" fill="#AFC3E6" stroke="${C.ink}" stroke-width="1.5"/><text x="263" y="${128 - 44}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">40</text><text x="263" y="142" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">14:00</text>
    <rect x="292" y="${128 - 90}" width="34" height="90" fill="${C.orange}" stroke="${C.ink}" stroke-width="1.5"/><text x="309" y="${128 - 94}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">90</text><text x="309" y="142" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}">20:00</text>`,
  t4_5: () => `${murodjon(10, 40, 0.95, "worry")}${bubble(34, 8, 172, 28, "Buni yozsa bo'ladimi?", 56)}
    ${phone(214, 8, 112, 134, `<text x="226" y="34" font-size="9.5" font-weight="700" fill="${C.ink}">Men 5-maktabda</text><text x="226" y="46" font-size="9.5" font-weight="700" fill="${C.ink}">o'qiyman.</text><rect x="223" y="54" width="95" height="17" rx="3" fill="#FCD7D2"/><text x="226" y="66" font-size="9.5" font-weight="700" fill="${C.red}">Tel: 90 123 45 67</text>${lines(226, 82, 84, 2, 10)}
      <path d="M270 104 L286 132 L254 132 Z" fill="#FFD43B" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/><rect x="268.6" y="112" width="3" height="11" rx="1.5" fill="${C.ink}"/><circle cx="270" cy="127" r="1.8" fill="${C.ink}"/>`)}`,
  hero5: () => `${murodjon(28, 34, 1, "happy", true)}${bubble(14, 8, 150, 28, "Izohlar kelyapti!", 70)}
    ${phone(232, 10, 86, 132, `${comment(238, 24, 74, "Ali", "Zo'r!")}${comment(238, 60, 74, "Malika", "Mazali!", "#E58FB0")}${comment(238, 96, 74, "Sardor", "Yana!", "#8FD19E")}`)}
    ${heart(205, 40, 0.9)}${heart(196, 70, 0.7)}${heart(214, 96, 0.6)}`,
  t5_1: () => `${murodjon(10, 40, 0.95, "think")}${bubble(34, 8, 196, 28, "Nima deb javob beraman?", 56)}
    ${comment(154, 58, 196, "Ali", "Zo'r! Qanday pishirasan?")}${heart(330, 106, 0.8)}
    <rect x="178" y="100" width="136" height="26" rx="8" fill="${C.cream}" stroke="${C.orange}" stroke-width="2" stroke-dasharray="4 3"/><text x="246" y="117" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.orangeD}">Javob: ...</text>`,
  t5_2: () => `${murodjon(8, 40, 0.95, "think")}${bubble(34, 8, 200, 28, "Keyingi reels nima haqida?", 56)}
    ${comment(150, 46, 170, "Ali", "Xamirni qanday qilasan?")}${comment(150, 80, 170, "Dilnoza", "Xamirni qanday qilasan?", "#E58FB0")}${comment(150, 114, 170, "Jasur", "Narxi qancha?", "#8FD19E")}
    <g transform="translate(336 76)"><circle r="13" fill="#FFE27A" stroke="${C.ink}" stroke-width="2"/><rect x="-5" y="12" width="10" height="7" rx="1.5" fill="${C.gray}" stroke="${C.ink}" stroke-width="1.5"/></g>`,
  t5_3: () => `${murodjon(10, 40, 0.95, "think")}${bubble(34, 8, 140, 28, "Javob beraymi?", 56)}
    ${comment(160, 52, 180, "Noma'lum", "Zerikarli video! O'chir buni!", "#B9B9B9")}
    <g transform="translate(250 112)"><rect x="-74" y="-14" width="70" height="26" rx="13" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><text x="-39" y="3" text-anchor="middle" font-size="10.5" font-weight="700" fill="${C.ink}">Yashirish</text><rect x="4" y="-14" width="70" height="26" rx="13" fill="${C.red}" stroke="${C.ink}" stroke-width="1.8"/><text x="39" y="3" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">O'chirish</text></g>`,
  t5_4: () => `${murodjon(10, 40, 0.95, "worry")}${bubble(34, 8, 100, 28, "Yozaymi?", 56)}
    <rect x="150" y="18" width="196" height="122" rx="10" fill="#fff" stroke="${C.ink}" stroke-width="2"/><rect x="150" y="18" width="196" height="24" rx="10" fill="#DDE3EE"/><rect x="150" y="32" width="196" height="10" fill="#DDE3EE"/><circle cx="166" cy="30" r="7" fill="#B9B9B9" stroke="${C.ink}" stroke-width="1.5"/><text x="180" y="34" font-size="10.5" font-weight="700" fill="${C.ink}">Begona</text>
    <rect x="158" y="52" width="182" height="40" rx="9" fill="#EEF1F6"/><text x="168" y="68" font-size="10" font-weight="700" fill="${C.ink}">Qaysi maktabda o'qiysan?</text><text x="168" y="83" font-size="10" font-weight="700" fill="${C.red}">Raqamingni yoz, sovg'a beraman</text>
    <g transform="translate(318 114)"><path d="M-9 -16 L9 -16 L16 -9 L16 9 L9 16 L-9 16 L-16 9 L-16 -9 Z" fill="${C.red}" stroke="${C.ink}" stroke-width="1.8"/><text y="4" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">STOP</text></g>`,
  t5_5: () => `${murodjon(10, 40, 0.95, "think")}${bubble(34, 8, 160, 28, "Qaysi parol kuchli?", 56)}
    <g transform="translate(196 44)"><rect x="0" y="0" width="120" height="26" rx="6" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><text x="10" y="17.5" font-size="11.5" font-weight="700" fill="${C.ink}">123456</text>${cross(140, 13)}
      <rect x="0" y="34" width="120" height="26" rx="6" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><text x="10" y="51.5" font-size="11.5" font-weight="700" fill="${C.ink}">murodjon</text>${cross(140, 47)}
      <rect x="0" y="68" width="120" height="26" rx="6" fill="#fff" stroke="${C.ink}" stroke-width="1.8"/><text x="10" y="85.5" font-size="11.5" font-weight="700" fill="${C.ink}">Samsa#60soniya</text>${check(140, 81)}</g>`,
};

// ---------- lesson content ----------
const LESSONS = {
  4: {
    series: "Blogging", title: "4-dars: Murodjon reelsni joylaydi",
    hero: { scene: "hero4", bg: C.cream, cap: "Murodjon birinchi reelsini joylashga tayyorlanmoqda." },
    rulesLabel: "Joylash qoidalari:",
    rules: "sarlavha qisqa va qiziq; heshteg 3–5 ta, mavzuga mos; muqova yorqin; manzil, telefon va maktab yozilmaydi; joylashdan oldin ota-onangga ko'rsat!",
    story: "<b>Murodjon</b> samsa haqidagi reelsni suratga oldi. Endi uni joylaydi. Keling, unga yordam beramiz!",
    tasks: [
      { scene: "t4_1", bg: C.blue, cap: "Sarlavha — reelsning birinchi gapi.",
        ex: "Reels: Murodjon 60 soniyada samsa pishiradi. Qaysi sarlavha yaxshi? A) «Video» B) «Samsa 60 soniyada! Sir oxirida»",
        sol: "B — qisqa, qiziq va nima bo'lishini aytadi.",
        q: "Reels: Murodjonning singlisi kek pishiradi. Qisqa va qiziq sarlavha yozing (7 so'zgacha)." },
      { scene: "t4_2", bg: C.mint, cap: "Heshteg reelsni kerakli odamlarga olib boradi.",
        ex: "Samsa reelsi uchun qaysi heshteglar mos? #samsa #futbol #oshxona #toshkent",
        sol: "#samsa, #oshxona, #toshkent — mos; #futbol — mavzuga aloqasi yo'q.",
        q: "Kek reelsi uchun 3 ta mos heshtegni doiraga oling: #kek #mashina #shirinlik #futbol #uydapishiramiz" },
      { scene: "t4_3", bg: C.cream, cap: "Odamlar avval muqovani ko'radi.",
        ex: "A — qorong'i va xira, yozuvi yo'q. B — yorqin, samsa aniq ko'rinadi, yozuv «SAMSA 60 s». Qaysi muqova yaxshi?",
        sol: "B — yorqin va aniq, odam bir qarashda tushunadi.",
        q: "Kek reelsi: C — kek chetda, yarmi ko'rinmaydi. D — kek o'rtada, yorqin, yozuv «KEK 5 DAQIQADA». Qaysi biri yaxshi va nega?" },
      { scene: "t4_4", bg: C.blue, cap: "Obunachilar ko'p paytda joyla.",
        ex: "Onlayn obunachilar: 08:00 da 15, 14:00 da 40, 20:00 da 90 kishi. Qachon joylagan yaxshi?",
        sol: "20:00 da — eng ko'p obunachi onlayn (90 kishi).",
        q: "Singlisining obunachilari: 09:00 da 20, 13:00 da 80, 18:00 da 40 kishi. Qachon joylagan yaxshi? 13:00 da 18:00 dagidan nechta kishi ko'p?" },
      { scene: "t4_5", bg: C.pink, cap: "Shaxsiy ma'lumot — faqat oilang uchun.",
        ex: "Murodjon yozdi: «Men 5-maktabda o'qiyman, telefonim 90 123 45 67». Nima xato?",
        sol: "Maktab va telefon — shaxsiy ma'lumot. To'g'ri: «Men samsani yaxshi ko'raman!»",
        q: "«Uyimiz Yunusobodda, 7-mavze 12-uy. Ertaga oilam bilan Samarqandga ketamiz, uy bo'sh qoladi!» Xavfli joylarning tagiga chizing, xavfsiz variantini yozing." },
    ],
    whyTitle: "Nega bizga bu kerak?",
    why: [
      ["Birinchi soniya:", "odamlar muqova va sarlavhaga qarab reelsni ochadi yoki o'tkazib yuboradi."],
      ["To'g'ri tomoshabin:", "heshteg va to'g'ri vaqt reelsni uni kutayotgan odamlarga yetkazadi."],
      ["Xavfsizlik:", "internetga yozilgan narsa abadiy qoladi. Manzil, telefon, maktabni yozma — avval ota-onangdan so'ra."],
    ],
    next: "5-dars — Murodjon izohlarga javob beradi.",
  },
  5: {
    series: "Blogging", title: "5-dars: Murodjon izohlarga javob beradi",
    hero: { scene: "hero5", bg: C.cream, cap: "Murodjon reelsni joyladi — birinchi izohlar keldi." },
    rulesLabel: "Izoh qoidalari:",
    rules: "hurmat bilan yoz; yaxshi izohga rahmat ayt; haqoratga javob berma — yashir yoki o'chir; begonaga shaxsiy ma'lumot berma; qo'rqsang yoki tushunmasang, ota-onangga ayt!",
    story: "<b>Murodjon</b> reelsni joyladi. Endi izohlar kelmoqda. Keling, qaysi izohga qanday javob berishni o'rganamiz!",
    tasks: [
      { scene: "t5_1", bg: C.blue, cap: "Yaxshi izohga — rahmat.",
        ex: "Izoh: «Zo'r chiqibdi! Samsani qanday pishirasan?» Qanday javob beramiz?",
        sol: "«Rahmat! Keyingi reelsda ko'rsataman.» — qisqa, xushmuomala, yana ko'rishga chaqiradi.",
        q: "Izoh: «Samsangiz juda mazali ekan, ertaga yana kelaman!» Xushmuomala javob yozing." },
      { scene: "t5_2", bg: C.mint, cap: "Ko'p so'ralgan savol — tayyor g'oya.",
        ex: "Izohlar: «Xamirni qanday qilasan?» — 2 marta, «Narxi qancha?» — 1 marta. Keyingi reels nima haqida?",
        sol: "Xamirni 2 kishi so'radi. Keyingi reels: «Samsa xamiri 30 soniyada».",
        q: "Kek reelsiga izohlar: «Qaysi do'konda?» — 1 marta, «Kremni qanday qilasiz?» — 3 marta. Keyingi reels mavzusini yozing. Nega aynan shu?" },
      { scene: "t5_3", bg: C.cream, cap: "Haqoratga javob bermaymiz.",
        ex: "Izoh: «Zerikarli video, sen blogger bo'lolmaysan!» Murodjon nima qiladi?",
        sol: "Janjallashmaydi: izohni yashiradi yoki o'chiradi, kerak bo'lsa bloklaydi va ota-onasiga aytadi.",
        q: "Izoh: «Kulgili emas, o'chir buni!» To'g'ri javobni doiraga oling: A) Javob yozib urishaman. B) Izohni yashiraman yoki o'chiraman. C) Blogni tashlayman." },
      { scene: "t5_4", bg: C.pink, cap: "Begonaga shaxsiy ma'lumot bermaymiz.",
        ex: "Begona yozdi: «Qaysi maktabda o'qiysan? Raqamingni yoz, sovg'a beraman.» Murodjon nima qiladi?",
        sol: "Javob bermaydi, xabarni ota-onasiga ko'rsatadi va begonani bloklaydi.",
        q: "Begona yozdi: «Men ham bloggerman, kel uchrashamiz! Manzilingni yoz.» Nima qilasiz? Uch qadamda yozing." },
      { scene: "t5_5", bg: C.blue, cap: "Kuchli parol — blog qulfi.",
        ex: "Qaysi parol kuchli: «123456», «murodjon», «Samsa#60soniya»?",
        sol: "«Samsa#60soniya» — uzun, katta va kichik harf, raqam va belgi bor. Parolni faqat ota-onang biladi.",
        q: "Qaysi parol kuchli: A) 11111111 B) kek2026 C) Kek#Shirin7Qatlam? Nega? Parolni kimga aytish mumkin?" },
    ],
    whyTitle: "Nega bizga bu kerak?",
    why: [
      ["Auditoriya:", "izohga javob bersang, obunachilar qaytib keladi va blog o'sadi."],
      ["G'oyalar:", "izohlardagi savollar — keyingi reels uchun tayyor g'oya."],
      ["Xavfsizlik:", "yomon izoh yoki begonaning xabari haqida ota-onangga ayt. Bu qo'rqoqlik emas — aqllilik."],
    ],
    next: "keyingi hafta matematika haftasi: Murodjon reels natijalarini hisoblaydi.",
  },
};

// ---------- page ----------
function panel(scene, bg, cap, n) {
  return `<div class="panel" style="background:${bg}">${n ? `<div class="num">${n}</div>` : ""}<svg viewBox="0 0 360 150" class="scene" xmlns="http://www.w3.org/2000/svg" font-family="Liberation Sans, Arial, sans-serif">${SCENES[scene]()}</svg><div class="cap">${esc(cap)}</div></div>`;
}
function page(L) {
  const head = `<div class="cell">${panel(L.hero.scene, L.hero.bg, L.hero.cap)}
    <h1>${esc(L.series)}</h1><h2>${esc(L.title)}</h2>
    <div class="fields"><span><b>Ismi:</b> <i class="ln w1"></i></span><span><b>Yoshi:</b> <i class="ln w2"></i></span><span><b>Sana:</b> <i class="ln w3"></i></span><span><b>Ball:</b> <i class="ln w4"></i> / 5</span></div>
    <div class="rules"><b class="o">${esc(L.rulesLabel)}</b> ${esc(L.rules)}<br>${L.story}</div></div>`;
  const tasks = L.tasks.map((t, i) => `<div class="cell">${panel(t.scene, t.bg, t.cap, i + 1)}
    <div class="ex"><b>Misol:</b> ${esc(t.ex)}<br><b>Yechim:</b> ${esc(t.sol)}</div>
    <div class="q"><b>Savol ${i + 1}:</b> ${esc(t.q)}</div>
    <div class="ans"><b>Yechim va javob:</b> <i class="ln"></i></div><div class="ans2"><i class="ln"></i></div></div>`).join("");
  const foot = `<div class="why"><h3>${esc(L.whyTitle)}</h3>${L.why.map(([a, b], i) => `<p><b>${i + 1}. ${esc(a)}</b> ${esc(b)}</p>`).join("")}<p><b class="o">Keyingi qadam:</b> ${esc(L.next)}</p></div>`;
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>${esc(L.title)}</title><style>
  @page{size:A4;margin:8mm 9mm}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Liberation Sans",Arial,sans-serif;color:${C.ink};font-size:10.4px;line-height:1.32}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:9px 16px}
  .panel{position:relative;border:1.6px solid ${C.ink};border-radius:5px;overflow:hidden}
  .scene{display:block;width:100%;height:auto}
  .cap{background:${C.ink};color:#fff;font-weight:700;font-size:9.6px;text-align:center;padding:4px 6px}
  .num{position:absolute;left:6px;top:6px;width:21px;height:21px;border-radius:50%;background:${C.orange};color:#fff;font-weight:800;font-size:12px;display:grid;place-items:center;border:1.6px solid ${C.ink}}
  h1{font-size:20px;margin:7px 0 0;line-height:1.1}
  h2{font-size:13.5px;margin:2px 0 6px;color:${C.orangeD};border-bottom:2px solid ${C.orange};padding-bottom:4px}
  .fields{display:grid;grid-template-columns:1.6fr 1fr;gap:6px 10px;margin-bottom:6px;font-size:11px}
  .ln{display:inline-block;border-bottom:1.2px solid ${C.ink};height:10px;vertical-align:baseline;width:100%}
  .fields span{display:flex;gap:4px;align-items:baseline;white-space:nowrap}.fields .ln{flex:1}
  .fields span:last-child .ln{flex:0 0 34px}
  .rules{background:#FFF4E6;border-bottom:2px solid ${C.orange};padding:5px 6px}
  .o{color:${C.orangeD}}
  .ex{background:#FFF4E6;border-bottom:2px solid ${C.orange};padding:4px 6px;margin-top:5px}
  .q{margin-top:5px}
  .ans{display:flex;gap:4px;align-items:baseline;margin-top:9px;white-space:nowrap}.ans .ln{flex:1}
  .ans2{margin-top:9px}.ans2 .ln{width:100%}
  .why{grid-column:1/-1;background:${C.ink};color:#fff;border-radius:4px;padding:8px 12px}
  .why h3{margin:0 0 4px;color:${C.orange};font-size:14px}
  .why p{margin:2px 0}
  .why .o{color:${C.orange}}
  </style></head><body><div class="grid">${head}${tasks}${foot}</div></body></html>`;
}

(async () => {
  const which = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [4, 5];
  const browser = await chromium.launch();
  for (const n of which) {
    const html = page(LESSONS[n]);
    const base = path.join(TMP, `${n}-dars`);
    fs.writeFileSync(base + ".html", html);
    const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto("file://" + base + ".html");
    await p.emulateMedia({ media: "print" });
    const PRINT_W = 726, PRINT_H = 1050; // A4 minus 9 mm side and 8 mm top/bottom margins, at 96 dpi
    let scale = 1;
    for (let s = 1; s >= 0.7; s -= 0.01) {
      await p.setViewportSize({ width: Math.round(PRINT_W / s), height: 1123 });
      const hh = await p.evaluate(() => document.querySelector(".grid").getBoundingClientRect().height);
      if (hh * s <= PRINT_H) { scale = Math.round(s * 100) / 100; break; }
    }
    await p.pdf({ path: path.join(OUT, `${n}-dars.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true, scale });
    console.log(`${n}-dars: print scale ${scale}`);
    await p.emulateMedia({ media: "screen" });
    await p.setViewportSize({ width: 794, height: 1123 });
    // Preview of the printed page: render the PDF size in CSS pixels (A4 at 96 dpi minus margins).
    const h = await p.evaluate(() => document.body.scrollHeight);
    await p.screenshot({ path: base + ".png", fullPage: true });
    console.log(`${n}-dars: ${path.join(OUT, `${n}-dars.pdf`)} (preview ${base}.png, screen height ${h}px)`);
    await ctx.close();
  }
  await browser.close();
})();
