/**
 * 神經解剖學：一般頁面的互動（搜尋名稱、橫切面上的路徑可以點）。
 * 3D 在 viewer.js；預覽卡片在 preview.js。
 */
var BASE = "/resources/neuro";

/* ---------- 橫切面：點色塊前往路徑頁，並和旁邊的圖例互相標示 ---------- */
document.addEventListener("click", function (ev) {
  var el = ev.target.closest && ev.target.closest(".nx-section .nx-tract[data-tract]");
  if (!el || el.closest("a")) return;
  location.href = BASE + "/tract/" + el.getAttribute("data-tract") + ".html";
});

function legendItems(tid) {
  return document.querySelectorAll('.nx-section-legend a[href$="/tract/' + tid + '.html"]');
}
document.addEventListener("mouseover", function (ev) {
  var el = ev.target.closest && ev.target.closest(".nx-section .nx-tract[data-tract]");
  var a = ev.target.closest && ev.target.closest(".nx-section-legend a[data-neuro^='tract:']");
  document.querySelectorAll(".nx-tract.is-hot").forEach(function (n) { n.classList.remove("is-hot"); });
  document.querySelectorAll(".nx-section-legend li.is-hot").forEach(function (n) { n.classList.remove("is-hot"); });
  var tid = el ? el.getAttribute("data-tract") : a ? a.getAttribute("data-neuro").slice(6) : null;
  if (!tid) return;
  document.querySelectorAll('.nx-big .nx-tract[data-tract="' + tid + '"]').forEach(function (n) { n.classList.add("is-hot"); });
  legendItems(tid).forEach(function (n) { n.closest("li").classList.add("is-hot"); });
});

/* ---------- 名稱搜尋（總覽頁） ---------- */
var q = document.getElementById("nx-q");
if (q) {
  var box = document.getElementById("nx-results");
  var idx = null;
  var TYPE_ZH = { tract: "路徑", structure: "結構", lesion: "病灶", level: "切面", region: "區域", nerve: "腦神經" };
  var norm = function (s) { return String(s || "").toLowerCase().replace(/[\s\-–—_'’()（）]/g, ""); };
  fetch("/assets/data/neuro/neuro-index.json").then(function (r) { return r.json(); }).then(function (j) {
    idx = Object.keys(j).map(function (k) {
      var e = j[k];
      var names = [e.zh, e.en, e.ab].concat(e.al || []).filter(Boolean);
      // 「全名 (縮寫)」：縮寫也當成一個名字，搜 LSTT 一樣是完全符合
      (e.al || []).forEach(function (a) { var m = /\(([A-Za-z0-9]{2,8})\)$/.exec(a); if (m) names.push(m[1]); });
      return { k: k, e: e, names: names, hay: names.map(norm) };
    });
    if (q.value) run();
  });
  var run = function () {
    var v = norm(q.value);
    if (!v || !idx) { box.hidden = true; box.innerHTML = ""; return; }
    var hits = [];
    idx.forEach(function (it) {
      var best = -1, via = "";
      it.hay.forEach(function (h, i) {
        var p = h.indexOf(v);
        if (p < 0) return;
        var score = (p === 0 ? 3 : 1) + (h === v ? 5 : 0) + (it.e.t === "tract" ? 1 : 0) + (it.e.t === "level" ? -1 : 0);
        if (score > best) { best = score; via = i >= 2 ? it.names[i] : ""; }
      });
      if (best >= 0) hits.push({ it: it, s: best, via: via });
    });
    hits.sort(function (a, b) { return b.s - a.s; });
    box.innerHTML = hits.slice(0, 12).map(function (h) {
      var e = h.it.e;
      return '<li><a href="' + e.u + '" data-neuro="' + h.it.k + '">' + e.zh.replace(/[<&]/g, "") +
        "<small>" + TYPE_ZH[e.t] + (h.via && h.via !== e.zh ? "・" + h.via.replace(/[<&]/g, "") : "") + "</small></a></li>";
    }).join("") || '<li><a>找不到符合的名稱</a></li>';
    box.hidden = false;
  };
  q.addEventListener("input", run);
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      var first = box.querySelector("a[href]");
      if (first) location.href = first.getAttribute("href");
    }
  });
}
