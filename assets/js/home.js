/**
 * 首頁「題目下載」：分章詳解 / 分章題本 / 歷年考題（最新一期）三個分頁的封面牆。
 *
 * 全部由 manifest 產生，不在 HTML 寫死 key —— key 帶內容雜湊，
 * 檔案一更新就會變，寫死在頁面上很容易留下失效的連結。
 * 目前分頁記在網址 hash（#workbooks），重新整理或返回時不會跳回第一頁。
 */
(function () {
  "use strict";

  var RN = window.RN;
  var tablist = document.getElementById("dl-tabs");
  var panels = {
    explanations: document.getElementById("panel-explanations"),
    workbooks: document.getElementById("panel-workbooks"),
    past: document.getElementById("panel-past"),
  };
  var TYPE_BY_TAB = { explanations: "詳解", workbooks: "題本" };

  var tabs = RN.setupTabs(tablist, show);

  function show(id) {
    if (!panels[id]) id = "explanations";
    tabs.select(id);
    Object.keys(panels).forEach(function (k) {
      panels[k].hidden = k !== id;
    });
    if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);
  }

  function renderBundles(manifest, type) {
    var grid = RN.el("div", "cover-grid cover-grid--4");
    manifest.subjects.forEach(function (s) {
      var bundle = manifest.bundles.find(function (b) {
        return b.subjectNo === s.no && b.type === type;
      });
      if (!bundle) return;
      grid.appendChild(
        RN.coverCard({
          key: bundle.key,
          fileName: bundle.name,
          size: bundle.size,
          cover: s.covers[type],
          title: s.fullName,
          sub: s.no + "　" + s.name + "・" + type + "合訂本",
        })
      );
    });
    return grid;
  }

  /** 首頁顯示最近幾期的考古題；更早的在「更多考題」。 */
  var LATEST_TERMS = 2;

  function renderLatestTerms(manifest, panel) {
    // manifest 的考古題已經由新到舊排好，依出現順序取前幾個學期
    var terms = [];
    manifest.pastExams.forEach(function (e) {
      if (terms.indexOf(e.term) === -1) terms.push(e.term);
    });
    terms = terms.slice(0, LATEST_TERMS);
    if (!terms.length) return;

    panel.appendChild(RN.el("p", "tab-note", "最近兩期的考題，更早的學期請到「更多考題」。"));
    terms.forEach(function (term) {
      panel.appendChild(RN.el("h3", "term-head", term.replace("補考", " 補考")));
      var grid = RN.el("div", "cover-grid cover-grid--5");
      manifest.pastExams
        .filter(function (e) {
          return e.term === term;
        })
        .forEach(function (e) {
          grid.appendChild(
            RN.coverCard({
              key: e.key,
              fileName: e.name,
              size: e.size,
              cover: e.cover,
              title: e.paper,
              sub: e.term,
            })
          );
        });
      panel.appendChild(grid);
    });
  }

  var initial = location.hash.slice(1);
  show(panels[initial] ? initial : "explanations");
  window.addEventListener("hashchange", function () {
    if (panels[location.hash.slice(1)]) show(location.hash.slice(1));
  });

  RN.loadManifest()
    .then(function (manifest) {
      Object.keys(TYPE_BY_TAB).forEach(function (id) {
        panels[id].textContent = "";
        panels[id].appendChild(renderBundles(manifest, TYPE_BY_TAB[id]));
      });
      panels.past.textContent = "";
      renderLatestTerms(manifest, panels.past);
    })
    .catch(function (err) {
      Object.keys(panels).forEach(function (id) {
        RN.loadError(panels[id], err, "檔案清單");
      });
    });
})();
