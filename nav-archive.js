// Боковое меню: «Архив», порядок пунктов и свои названия. Всё делается мышью:
// перетаскивание пункта (на «Архив», в меню, вверх-вниз) и правая кнопка («В архив», «Переименовать»).
// Выбор хранится в браузере (localStorage). По умолчанию в меню остаётся «Загрузка лидов через Excel».
const KEY_ARCHIVE = "crm.navArchive.v1";
const KEY_ORDER = "crm.navOrder.v1";
const KEY_NAMES = "crm.navNames.v1";
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
const keyOf = (el) => el.dataset.view || el.id || "";
const items = () => [...nav.querySelectorAll(".nav-item")].filter((el) => el !== newTab && keyOf(el));
const mainItems = () => [...nav.querySelectorAll(":scope > .nav-item")].filter((el) => el !== newTab && keyOf(el));
const archiveItems = () => [...list.querySelectorAll(":scope > .nav-item")].filter((el) => keyOf(el));
function wantsArchive(el, map) {
  const saved = map[keyOf(el)];
  return typeof saved === "boolean" ? saved : el.dataset.excel !== "1";
}
const isLabel = (node) => node.tagName === "SPAN" && !node.classList.contains("nav-icon") && !node.classList.contains("nav-count") && !node.classList.contains("nav-custom-label");

function sortZone(zoneItems, order, place, misplaced = () => false) {
  const rank = (el) => { const i = order.indexOf(keyOf(el)); return i < 0 ? Infinity : i; };
  const wanted = [...zoneItems].sort((a, b) => rank(a) - rank(b));
  if (wanted.some((el, i) => el !== zoneItems[i]) || zoneItems.some(misplaced)) wanted.forEach(place);
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
    if (!toArchive && el.parentNode !== nav) nav.insertBefore(el, archive);
    el.draggable = true;
  }
  const order = readJson(KEY_ORDER, []);
  // Пункты меню всегда выше «Архива» (вкладки из базы приходят в конец списка, после него).
  sortZone(mainItems(), order, (el) => nav.insertBefore(el, archive), (el) => Boolean(archive.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  sortZone(archiveItems(), order, (el) => list.appendChild(el));
  applyNames(readJson(KEY_NAMES, {}));
  document.querySelectorAll(".excel-leads-mobile-nav").forEach((button) => {
    const source = items().find((el) => keyOf(el) === button.dataset.view);
    button.classList.toggle("hidden", Boolean(source && wantsArchive(source, map)));
  });
}

// Переносит пункт в меню или архив и ставит его рядом с refKey (до или после); без refKey — в конец.
function moveItem(key, toArchive, refKey = "", after = false) {
  const map = readJson(KEY_ARCHIVE, {});
  map[key] = toArchive;
  writeJson(KEY_ARCHIVE, map);
  apply();
  const main = mainItems().map(keyOf).filter((k) => k !== key);
  const arch = archiveItems().map(keyOf).filter((k) => k !== key);
  const zone = toArchive ? arch : main;
  const at = refKey && zone.includes(refKey) ? zone.indexOf(refKey) + (after ? 1 : 0) : zone.length;
  zone.splice(at, 0, key);
  writeJson(KEY_ORDER, main.concat(arch));
  apply();
  if (toArchive && list.querySelector(".nav-item.active")) archive.open = true;
}

if (nav && archive && list) {
  apply();
  // Пункты добавляются позже (вкладки из базы, панели результатов), поэтому следим за меню.
  new MutationObserver(apply).observe(nav, { childList: true, subtree: true });

  // Перетаскивание.
  let dragKey = "";
  const clearDrop = () => {
    archive.classList.remove("drop-target", "drop-above");
    nav.classList.remove("drop-main");
    items().forEach((el) => el.classList.remove("drop-before", "drop-after"));
  };
  const overInfo = (event) => {
    const over = event.target.closest(".nav-item");
    if (!over || over === newTab || !keyOf(over) || keyOf(over) === dragKey) return null;
    const rect = over.getBoundingClientRect();
    return { el: over, after: event.clientY > rect.top + rect.height / 2 };
  };
  nav.addEventListener("dragstart", (event) => {
    const el = event.target.closest?.(".nav-item");
    if (!el || !keyOf(el)) return;
    dragKey = keyOf(el);
    event.dataTransfer.setData("text/plain", dragKey);
    event.dataTransfer.effectAllowed = "move";
  });
  // Верхняя треть строки «Архив» — поставить пункт в меню над архивом, остальное — убрать в архив.
  const archiveZone = (event) => {
    const summary = archive.querySelector(".nav-archive-summary");
    if (!event.target.closest("#navArchive")) return "";
    if (event.target.closest("#navArchiveList")) return "list";
    const rect = summary.getBoundingClientRect();
    return event.clientY < rect.top + rect.height * 0.33 ? "above" : "into";
  };
  // Слушаем всю боковую панель: пункт можно бросить и на пустое место под меню.
  const dropArea = document.getElementById("sidebar") || nav;
  dropArea.addEventListener("dragover", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    clearDrop();
    const over = overInfo(event);
    const zone = archiveZone(event);
    const dragged = items().find((el) => keyOf(el) === dragKey);
    if (over) over.el.classList.add(over.after ? "drop-after" : "drop-before");
    else if (zone === "above" || (zone === "into" && dragged && dragged.parentNode === list)) archive.classList.add("drop-above");
    else if (zone === "into" || zone === "list") archive.classList.add("drop-target");
    else nav.classList.add("drop-main");
  });
  dropArea.addEventListener("drop", (event) => {
    if (!dragKey) return;
    event.preventDefault();
    const over = overInfo(event);
    const dragged = items().find((el) => keyOf(el) === dragKey);
    const fromArchive = Boolean(dragged && dragged.parentNode === list);
    if (over) moveItem(dragKey, over.el.parentNode === list, keyOf(over.el), over.after);
    // Строка «Архив»: пункт из архива вынимается в меню, пункт из меню убирается в архив.
    else {
      const zone = archiveZone(event);
      moveItem(dragKey, zone === "list" || (zone === "into" && !fromArchive));
    }
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
