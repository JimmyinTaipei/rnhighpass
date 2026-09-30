/**
 * 神經解剖學：連結的預覽卡片。
 *
 * 所有 <a data-neuro="type:id"> 連結，滑鼠停上去（或鍵盤 focus）會跳出簡介；
 * 觸控裝置上第一次點只顯示卡片，卡片裡有「前往」，第二次點同一個連結才跳頁。
 * 資料來自 build-neuro.mjs 產生的 neuro-index.json，第一次需要時才載入。
 */
var INDEX_URL = "/assets/data/neuro/neuro-index.json";
var TYPE_ZH = { tract: "傳導路徑", structure: "結構", lesion: "常考病灶", level: "切面", region: "區域", nerve: "腦神經" };

var index = null, loading = null;
function load() {
  if (index) return Promise.resolve(index);
  if (!loading) {
    loading = fetch(INDEX_URL).then(function (r) { return r.json(); }).then(function (j) { index = j; return j; })
      .catch(function () { loading = null; return null; });
  }
  return loading;
}

var card = document.createElement("div");
card.className = "nx-pv";
card.hidden = true;
card.setAttribute("role", "tooltip");
card.id = "nx-pv";
document.body.appendChild(card);

var current = null, showTimer = 0, hideTimer = 0, touchArmed = null;
var isTouch = window.matchMedia && window.matchMedia("(hover: none)").matches;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
}

function render(e, href) {
  var h = [];
  if (e.svg) h.push(e.svg);
  h.push('<p class="nx-pv-type">' + (TYPE_ZH[e.t] || "") + (e.t === "tract" ? "・" + (e.k === "ascending" ? "上行" : e.k === "descending" ? "下行" : e.k === "visual" ? "視覺" : e.k === "cerebellar" ? "小腦" : e.k === "auditory" ? "聽覺" : e.k === "vestibular" ? "前庭" : "腦幹") : "") +
    (e.hy ? ' <span class="nx-hy">' + "★".repeat(e.hy) + "</span>" : "") + "</p>");
  h.push('<p class="nx-pv-title">' + esc(e.zh) + (e.ab ? ' <span class="nx-abbr">' + esc(e.ab) + "</span>" : "") + "</p>");
  if (e.en) h.push('<p class="nx-pv-en">' + esc(e.en) + "</p>");
  if (e.s) h.push('<p class="nx-pv-s">' + esc(e.s) + "</p>");
  if (e.ch) h.push('<p class="nx-pv-chain">' + e.ch.map(esc).join(e.t === "nerve" ? "、" : " → ") + "</p>");
  if (e.x) h.push('<p class="nx-pv-al">' + (e.t === "nerve" ? "" : "交叉：") + esc(e.x) + "</p>");
  if (e.al && e.al.length) h.push('<p class="nx-pv-al">也叫：' + e.al.slice(0, 5).map(esc).join("、") + "</p>");
  h.push('<a class="nx-pv-go" href="' + esc(href || e.u) + '">前往 →</a>');
  card.innerHTML = h.join("");
}

function place(a) {
  var r = a.getBoundingClientRect();
  card.hidden = false;
  var cw = card.offsetWidth, ch = card.offsetHeight;
  var sx = window.scrollX, sy = window.scrollY;
  var left = Math.min(Math.max(8, r.left), document.documentElement.clientWidth - cw - 8);
  var top = r.bottom + 8;
  if (top + ch > window.innerHeight - 8 && r.top - ch - 8 > 0) top = r.top - ch - 8;
  card.style.left = (left + sx) + "px";
  card.style.top = (top + sy) + "px";
}

function show(a) {
  var key = a.getAttribute("data-neuro");
  current = a;
  load().then(function (idx) {
    if (!idx || current !== a) return;
    var e = idx[key];
    if (!e) return;
    render(e, a.getAttribute("href"));
    card.classList.toggle("is-touch", isTouch);
    a.setAttribute("aria-describedby", "nx-pv");
    place(a);
  });
}

function hide() {
  if (current) current.removeAttribute("aria-describedby");
  current = null;
  touchArmed = null;
  card.hidden = true;
}

function linkFrom(t) {
  return t && t.closest ? t.closest("a[data-neuro]") : null;
}

document.addEventListener("mouseover", function (ev) {
  if (isTouch) return;
  var a = linkFrom(ev.target);
  if (a) {
    clearTimeout(hideTimer);
    if (a === current) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(function () { show(a); }, 180);
    load();
  } else if (!card.contains(ev.target)) {
    clearTimeout(showTimer);
    if (current) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 160); }
  } else {
    clearTimeout(hideTimer);
  }
});

document.addEventListener("focusin", function (ev) {
  var a = linkFrom(ev.target);
  if (a) show(a);
});
document.addEventListener("focusout", function (ev) {
  if (linkFrom(ev.target) && !card.contains(ev.relatedTarget)) hideTimer = setTimeout(hide, 120);
});
document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hide(); });

// 觸控：第一次點顯示卡片，第二次點（或按「前往」）才跳頁
document.addEventListener("click", function (ev) {
  if (!isTouch) return;
  var a = linkFrom(ev.target);
  if (!a) {
    if (!card.contains(ev.target)) hide();
    return;
  }
  if (touchArmed === a) return;   // 第二次點：照常跳頁
  ev.preventDefault();
  touchArmed = a;
  show(a);
}, true);

window.addEventListener("resize", function () { if (current && !card.hidden) place(current); });
