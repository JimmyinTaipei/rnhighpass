/**
 * 神經解剖學：3D 整合頁（/resources/neuro/3d.html）。
 *
 * 上方的按鈕切換區域（脊髓、腦幹、小腦、間腦、視覺、聽覺…），每次切換：
 *   1. 更新網址 ?region=…（其他參數屬於前一個區域，一起清掉），瀏覽器的上一頁可以回到前一個區域
 *   2. 拆掉舊的 3D（停止動畫、釋放 WebGL），換上新的 .nx-viewer 骨架
 *   3. 依區域載入 viewer.js 或 visual-viewer.js 並掛上
 * 從別頁連過來時可以帶其他參數，例如 3d.html?region=brainstem&lesion=wallenberg。
 */
var BASE = "/resources/neuro";
var tabs = [].slice.call(document.querySelectorAll(".nx-hub-tab"));
var holder = document.querySelector(".nx-hub-stage");
var infos = [].slice.call(document.querySelectorAll(".nx-hub-info"));
var IDS = tabs.map(function (b) { return b.dataset.region; });
var current = null, handle = null, seq = 0;

function skeleton(region) {
  var visual = region === "visual";
  return '<div class="nx-viewer" data-mode="region" data-region="' + region + '" data-hub="1"' + (visual ? ' data-engine="visual"' : "") + ">" +
    '<div class="nx-stage-wrap"><div class="nx-stage" aria-label="3D 模型，可拖曳旋轉、滾輪或雙指縮放"></div>' +
    '<div class="nx-labels" aria-hidden="true"></div><div class="nx-tip" hidden></div><p class="nx-loading">3D 模型載入中…</p></div>' +
    '<div class="nx-panel"></div></div>';
}

function regionFromUrl() {
  var r = new URLSearchParams(location.search).get("region");
  return IDS.indexOf(r) >= 0 ? r : IDS[0];
}

function show(region) {
  if (region === current && handle) return;
  current = region;
  var my = ++seq;
  tabs.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.region === region)); });
  infos.forEach(function (s) { s.hidden = s.dataset.for !== region; });
  var tab = tabs[IDS.indexOf(region)];
  document.title = (tab ? tab.dataset.title : "3D 模型") + "｜多保命 RN High Pass";
  if (handle) { handle.destroy(); handle = null; }
  holder.innerHTML = skeleton(region);
  var el = holder.firstChild;
  import(region === "visual" ? "./visual-viewer.js" : "./viewer.js").then(function (m) {
    if (my !== seq) return;   // 載入期間又切到別的區域
    handle = m.mount(el);
  }).catch(function (e) {
    var p = el.querySelector(".nx-loading");
    if (p) p.textContent = "3D 模型載入失敗，請重新整理頁面。";
    console.error(e);
  });
}

tabs.forEach(function (b) {
  b.addEventListener("click", function () {
    var r = b.dataset.region;
    if (r === current) return;
    history.pushState({ region: r }, "", BASE + "/3d.html?region=" + r);
    show(r);
  });
});
window.addEventListener("popstate", function () { current = null; show(regionFromUrl()); });

show(regionFromUrl());
