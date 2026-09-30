/**
 * 相關資源／醫事國考生化：依 assets/data/extras.json 產生 4 冊詳解與題本的封面下載卡。
 * 目前分頁記在網址 hash（#explanations / #workbooks）。
 */
(function () {
  "use strict";

  var RN = window.RN;
  var main = document.getElementById("biochem-main");
  var TYPES = { explanations: "詳解", workbooks: "題本" };

  var items = null;
  var current = null;

  var tabs = RN.setupTabs(document.getElementById("biochem-tabs"), function (id) {
    show(id);
  });

  function show(id) {
    if (!TYPES[id]) id = "explanations";
    current = id;
    tabs.select(id);
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    if (items) render();
  }

  function render() {
    var type = TYPES[current];
    var list = items
      .filter(function (i) { return i.type === type; })
      .sort(function (a, b) { return a.book - b.book; });

    main.textContent = "";
    if (!list.length) {
      main.appendChild(RN.el("p", "dl-empty", "目前沒有檔案。"));
      return;
    }
    var grid = RN.el("div", "cover-grid cover-grid--4");
    list.forEach(function (item, idx) {
      grid.appendChild(RN.coverCard({
        key: item.key,
        fileName: item.name,
        size: item.size,
        cover: item.cover,
        title: "Book " + item.book + "　" + type,
        sub: item.bookName,
        eager: idx < 4,
      }));
    });
    main.appendChild(grid);
  }

  window.addEventListener("hashchange", function () {
    show(location.hash.slice(1));
  });

  show(location.hash.slice(1));

  fetch("/assets/data/extras.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      items = data.biochem || [];
      render();
    })
    .catch(function (err) {
      RN.loadError(main, err, "檔案清單");
    });
})();
