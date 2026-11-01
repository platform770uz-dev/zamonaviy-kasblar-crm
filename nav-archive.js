// Боковое меню: «Архив», порядок пунктов и свои названия. Всё делается мышью:
// перетаскивание пункта (на «Архив», в меню, вверх-вниз, выше и ниже «Архива»; сам «Архив» тоже двигается)
// и правая кнопка («В архив», «Переименовать»). Выбор хранится в браузере (localStorage).
// По умолчанию в меню остаётся «Загрузка лидов через Excel», остальное лежит в «Архиве».
const KEY_ARCHIVE = "crm.navArchive.v1";
const KEY_ORDER = "crm.navOrder.v1";
const KEY_NAMES = "crm.navNames.v1";
const ARCH = "__archive__"; // положение самой папки «Архив» в общем порядке
const END = "__end__"; // «в конец меню»
const nav = document.querySelector(".side-nav");
const archive = document.getElementById("navArchive");
const list = document.getElementById("navArchiveList");
const newTab = document.getElementById("newCustomTab");

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === typeof fallback ? value : fallback;
  } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* память браузера недоступна */ }
}
const keyOf = (el) => (el === archive ? ARCH : el.dataset.view || el.id || "");
const items = () => [...nav.querySelectorAll(".nav-item")].filter((el) => el !== newTab && keyOf(el));
// Основное меню: пункты и папка «Архив» в том порядке, как они стоят в панели.
const mainSeq = () => [...nav.children].filter((el) => el === archive || (el.classList.contains("nav-item") && el !== newTab && keyOf(el)));
const archiveItems = () => [...list.querySelectorAll(":scope > .nav-item")].filter((el) => keyOf(el));
function wantsArchive(el, map) {
  const saved = map[keyOf(el)];
  return typeof saved === "boolean" ? saved : el.dataset.excel !== "1";
}
const isLabel = (node) => node.tagName === "SPAN" && !node.classList.contains("nav-icon") && !node.classList.contains("nav-count") && !node.classList.contains("nav-custom-label");

// Новые пункты (ещё без сохранённого места) идут в конец меню, но выше «Архива», пока тот не двигали.
function sortZone(zoneItems, order, place) {
  const rank = (el) => {
    const i = order.indexOf(keyOf(el));
    if (i >= 0) return i;
    return el === archive ? 1e9 : 1e8;
  };
  const wanted = [...zoneItems].sort((a, b) => rank(a) - rank(b));
  if (wanted.some((el, i) => el !== zoneItems[i])) wanted.forEach(place);
}

function applyNames(names) {
  for (const el of items()) {
    const name = typeof names[keyOf(el)] === "string" ? names[keyOf(el)].trim() : "";
    let custom = el.querySelector(":scope > .nav-custom-label");
    if (!name) {
      custom?.remove();
      el.removeAttribute("data-renamed");
      continue;
    }
    if (!custom) {
      custom = document.createElement("span");
      custom.className = "nav-custom-label";
      const label = [...el.children].find(isLabel);
      if (label) label.after(custom); else el.appendChild(custom);
    }
    if (custom.textContent !== name) custom.textContent = name;
    el.dataset.renamed = "1";
  }
}

function apply() {
  const map = readJson(KEY_ARCHIVE, {});
  for (const el of items()) {
    const toArchive = wantsArchive(el, map);
    if (toArchive && el.parentNode !== list) list.appendChild(el);
    if (!toArchive && el.parentNode !== nav) nav.insertBefore(el, newTab);
    el.draggable = true;
  }
  const summary = archive.querySelector(".nav-archive-summary");
  if (summary) summary.draggable = true;
  const order = readJson(KEY_ORDER, []);
  sortZone(mainSeq(), order, (el) => nav.insertBefore(el, newTab));
  sortZone(archiveItems(), order, (el) => list.appendChild(el));
  applyNames(readJson(KEY_NAMES, {}));
  document.querySelectorAll(".excel-leads-mobile-nav").forEach((button) => {
    const source = items().find((el) => keyOf(el) === button.dataset.view);
    button.classList.toggle("hidden", Boolean(source && wantsArchive(source, map)));
  });
}

// Ставит пункт (или саму папку «Архив») в меню или в архив рядом с refKey (до или после).
// Без refKey: в архив — в конец архива; в меню — прямо над «Архивом». refKey END — в конец меню.
function moveItem(key, toArchive, refKey = "", after = false) {
  if (key !== ARCH) {
    const map = readJson(KEY_ARCHIVE, {});
    map[key] = toArchive;
    writeJson(KEY_ARCHIVE, map);
  }
  apply();
  const main = mainSeq().map(keyOf).filter((k) => k !== key);
  const arch = archiveItems().map(keyOf).filter((k) => k !== key);
  const zone = toArchive ? arch : main;
  let at;
  if (refKey === END) at = zone.length;
  else if (refKey && zone.includes(refKey)) at = zone.indexOf(refKey) + (after ? 1 : 0);
  else if (!toArchive) at = main.includes(ARCH) ? main.indexOf(ARCH) : main.length;
  else at = zone.length;
  zone.splice(at, 0, key);
  writeJson(KEY_ORDER, main.concat(arch));
  apply();
  if (toArchive && list.querySelector(".nav-item.active")) archive.open = true;
}

if (nav && archive && list && newTab) {
  apply();
  // Пункты добавляются позже (вкладки из базы, панели результатов), поэтому следим за меню.
  new MutationObserver(apply).observe(nav, { childList: true, subtree: true });

  // Перетаскивание.
  let dragKey = "";
  const clearDrop = () => {
    archive.classList.remove("drop-target", "drop-above", "drop-below");
    nav.classList.remove("drop-main");
    items().forEach((el) => el.classList.remove("drop-before", "drop-after"));
  };
  const overInfo = (event) => {
    const over = event.target.closest(".nav-item");
    if (!over || over === newTab || !keyOf(over) || keyOf(over) === dragKey) return null;
    // Папку «Архив» нельзя положить внутрь самой себя.
    if (dragKey === ARCH && over.parentNode === list) return null;
    const rect = over.getBoundingClientRect();
    return { el: over, after: event.clientY > rect.top + rect.height / 2 };
  };
  // Строка «Архив»: верхняя треть — поставить выше, нижняя — ниже, середина — убрать в архив / вынуть из архива.
  const archiveZone = (event) => {
    if (!event.target.closest("#navArchive")) return "";
    if (event.target.closest("#navArchiveList")) return "list";
    const rect = archive.querySelector(".nav-archive-summary").getBoundingClientRect();
    if (event.clientY < rect.top + rect.height * 0.3) return "above";
    if (event.clientY > rect.bottom - rect.height * 0.3) return "below";
    return "into";
  };
  const draggedEl = () => items().find((el) => keyOf(el) === dragKey);
  nav.addEventListener("dragstart", (event) => {
    const el = event.target.closest?.(".nav-item, .nav-archive-summary");
    if (!el) return;
    const key = el.classList.contains("nav-archive-summary") ? ARCH : keyOf(el);
    if (!key) return;
    dragKey = key;
    event.dataTransfer.setData("text/plain", dragKey);
    event.dataTransfer.effectAllowed = "move";
  });
  // Слушаем всю боковую панель: пункт можно бросить и на пустое место под меню.
  const dropArea = document.getElementById("sidebar") || nav;
  dropArea.addEventListener("dragover", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    clearDrop();
    const over = overInfo(event);
    const zone = archiveZone(event);
    if (over) over.el.classList.add(over.after ? "drop-after" : "drop-before");
    else if (dragKey === ARCH) {
      if (!zone) nav.classList.add("drop-main");
    } else if (zone === "above") archive.classList.add("drop-above");
    else if (zone === "below") archive.classList.add("drop-below");
    else if (zone === "into") {
      const fromArchive = draggedEl()?.parentNode === list;
      archive.classList.add(fromArchive ? "drop-above" : "drop-target");
    } else if (zone === "list") archive.classList.add("drop-target");
    else nav.classList.add("drop-main");
  });
  dropArea.addEventListener("drop", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    const over = overInfo(event);
    const zone = archiveZone(event);
    if (dragKey === ARCH) {
      if (over) moveItem(ARCH, false, keyOf(over.el), over.after);
      else if (!zone) moveItem(ARCH, false, END);
    } else if (over) moveItem(dragKey, over.el.parentNode === list, keyOf(over.el), over.after);
    else if (zone === "above") moveItem(dragKey, false, ARCH, false);
    else if (zone === "below") moveItem(dragKey, false, ARCH, true);
    else if (zone === "into") moveItem(dragKey, draggedEl()?.parentNode !== list);
    else if (zone === "list") moveItem(dragKey, true);
    else moveItem(dragKey, false, END);
    dragKey = ""; clearDrop();
  });
  nav.addEventListener("dragend", () => { dragKey = ""; clearDrop(); });

  // Правая кнопка мыши: «В архив» / «Вернуть из архива» и «Переименовать».
  const menu = document.createElement("div");
  menu.className = "nav-context-menu hidden";
  menu.setAttribute("role", "menu");
  const makeButton = () => {
    const button = document.createElement("button");
    button.type = "button"; button.setAttribute("role", "menuitem");
    menu.appendChild(button);
    return button;
  };
  const archiveButton = makeButton();
  const renameButton = makeButton();
  renameButton.textContent = "Переименовать";
  document.body.appendChild(menu);

  const panel = document.createElement("form");
  panel.className = "nav-rename-panel hidden";
  panel.innerHTML = '<input type="text" maxlength="60" autocomplete="off" aria-label="Nomi / Название"><div><button type="submit" class="button primary">Сохранить</button><button type="button" class="button secondary" data-reset>Сбросить</button></div>';
  document.body.appendChild(panel);
  const input = panel.querySelector("input");

  let target = null;
  const hideMenu = () => { menu.classList.add("hidden"); };
  const closeAll = () => { menu.classList.add("hidden"); panel.classList.add("hidden"); target = null; };
  const place = (box, x, y) => {
    box.style.left = Math.max(8, Math.min(x, window.innerWidth - box.offsetWidth - 8)) + "px";
    box.style.top = Math.max(8, Math.min(y, window.innerHeight - box.offsetHeight - 8)) + "px";
  };
  nav.addEventListener("contextmenu", (event) => {
    const el = event.target.closest(".nav-item");
    if (!el || el === newTab || !keyOf(el)) return;
    event.preventDefault();
    closeAll();
    target = el;
    archiveButton.textContent = el.parentNode === list ? "Вернуть из архива" : "В архив";
    menu.classList.remove("hidden");
    place(menu, event.clientX, event.clientY);
  });
  archiveButton.addEventListener("click", () => {
    if (target) moveItem(keyOf(target), target.parentNode !== list);
    closeAll();
  });
  renameButton.addEventListener("click", () => {
    if (!target) return;
    const names = readJson(KEY_NAMES, {});
    const custom = target.querySelector(":scope > .nav-custom-label");
    const label = [...target.children].find(isLabel);
    input.value = names[keyOf(target)] || custom?.textContent || label?.textContent.trim() || "";
    hideMenu();
    const rect = target.getBoundingClientRect();
    panel.classList.remove("hidden");
    place(panel, rect.left + 12, rect.bottom + 6);
    input.focus(); input.select();
  });
  panel.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!target) return;
    const names = readJson(KEY_NAMES, {});
    const name = input.value.trim();
    if (name) names[keyOf(target)] = name; else delete names[keyOf(target)];
    writeJson(KEY_NAMES, names);
    apply(); closeAll();
  });
  panel.querySelector("[data-reset]").addEventListener("click", () => { input.value = ""; panel.requestSubmit(); });

  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target) && !panel.contains(event.target)) closeAll();
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAll(); });
  window.addEventListener("scroll", (event) => { if (!panel.contains(event.target)) closeAll(); }, true);
  window.addEventListener("resize", closeAll);
}
