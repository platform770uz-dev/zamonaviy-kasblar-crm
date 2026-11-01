// Архив бокового меню: пункт переносится в «Архив» перетаскиванием или через правую кнопку мыши.
// Выбор хранится в браузере (localStorage). По умолчанию в меню остаётся только «Загрузка лидов через Excel».
const STORE = "crm.navArchive.v1";
const nav = document.querySelector(".side-nav");
const archive = document.getElementById("navArchive");
const list = document.getElementById("navArchiveList");
const newTab = document.getElementById("newCustomTab");

function loadMap() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}
function saveMap(map) {
  try { localStorage.setItem(STORE, JSON.stringify(map)); } catch { /* память браузера недоступна */ }
}
const keyOf = (el) => el.dataset.view || el.id || "";
const items = () => [...nav.querySelectorAll(".nav-item")].filter((el) => el !== newTab && keyOf(el));
function wantsArchive(el, map) {
  const saved = map[keyOf(el)];
  return typeof saved === "boolean" ? saved : el.dataset.excel !== "1";
}

function apply() {
  const map = loadMap();
  for (const el of items()) {
    const toArchive = wantsArchive(el, map);
    if (toArchive && el.parentNode !== list) list.appendChild(el);
    if (!toArchive && el.parentNode !== nav) nav.insertBefore(el, archive);
    el.draggable = true;
  }
  document.querySelectorAll(".excel-leads-mobile-nav").forEach((button) => {
    const source = items().find((el) => keyOf(el) === button.dataset.view);
    button.classList.toggle("hidden", Boolean(source && wantsArchive(source, map)));
  });
}

function setArchived(key, value) {
  const map = loadMap();
  map[key] = value;
  saveMap(map);
  apply();
  if (value && list.querySelector(".nav-item.active")) archive.open = true;
}

if (nav && archive && list) {
  apply();
  // Пункты добавляются позже (вкладки из базы, панели результатов), поэтому следим за меню.
  new MutationObserver(apply).observe(nav, { childList: true, subtree: true });

  // Перетаскивание: на «Архив» — убрать в архив, в остальную область меню — вернуть.
  let dragKey = "";
  const clearDrop = () => { archive.classList.remove("drop-target"); nav.classList.remove("drop-main"); };
  nav.addEventListener("dragstart", (event) => {
    const el = event.target.closest?.(".nav-item");
    if (!el || !keyOf(el)) return;
    dragKey = keyOf(el);
    event.dataTransfer.setData("text/plain", dragKey);
    event.dataTransfer.effectAllowed = "move";
  });
  nav.addEventListener("dragover", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    const toArchive = Boolean(event.target.closest("#navArchive"));
    archive.classList.toggle("drop-target", toArchive);
    nav.classList.toggle("drop-main", !toArchive);
  });
  nav.addEventListener("drop", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    setArchived(dragKey, Boolean(event.target.closest("#navArchive")));
    dragKey = ""; clearDrop();
  });
  nav.addEventListener("dragend", () => { dragKey = ""; clearDrop(); });

  // Правая кнопка мыши (на телефоне — долгое нажатие): «В архив» / «Вернуть из архива».
  const menu = document.createElement("div");
  menu.className = "nav-context-menu hidden";
  menu.setAttribute("role", "menu");
  const action = document.createElement("button");
  action.type = "button"; action.setAttribute("role", "menuitem");
  menu.appendChild(action);
  document.body.appendChild(menu);
  let target = null;
  const hideMenu = () => { menu.classList.add("hidden"); target = null; };
  nav.addEventListener("contextmenu", (event) => {
    const el = event.target.closest(".nav-item");
    if (!el || el === newTab || !keyOf(el)) return;
    event.preventDefault();
    target = el;
    action.textContent = el.parentNode === list ? "Вернуть из архива" : "В архив";
    menu.classList.remove("hidden");
    const x = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top = Math.max(8, y) + "px";
  });
  action.addEventListener("click", () => {
    if (target) setArchived(keyOf(target), target.parentNode !== list);
    hideMenu();
  });
  document.addEventListener("pointerdown", (event) => { if (!menu.contains(event.target)) hideMenu(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") hideMenu(); });
  window.addEventListener("scroll", hideMenu, true);
  window.addEventListener("resize", hideMenu);
}
