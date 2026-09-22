/**
 * 考古題頁：依學期分組列出可直接下載的考卷。
 *
 * 網站上只放 manifest.pastExamMinTerm（含）之後的學期，更早的導去 Google Drive。
 * 資料全部來自 assets/data/manifest.json，這裡不寫死任何檔名。
 */
(function () {
  "use strict";

  var listEl = document.getElementById("pe-list");
  var searchEl = document.getElementById("pe-search");
  var sortBtn = document.getElementById("pe-sort");
  var toggleBtn = document.getElementById("pe-toggle");

  var items = [];
  var sortAsc = false; // false = 由新到舊
  var query = "";

  function formatSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function fileUrl(key) {
    return "/api/file/" + key.split("/").map(encodeURIComponent).join("/");
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function searchText(item) {
    return (item.name + " " + item.term + " " + item.paper).toLowerCase();
  }

  /* ---------------------------- 建立清單 ---------------------------- */

  function renderItem(item) {
    var row = el("div", "dl-item");
    row.dataset.search = searchText(item);

    var label = el("span", "dl-item-label");
    label.appendChild(el("span", "dl-ch", item.paper));
    label.appendChild(el("span", "dl-size", formatSize(item.size)));

    var link = el("a", "btn-sm is-solid", "下載");
    link.href = fileUrl(item.key);

    var actions = el("div", "dl-item-actions");
    actions.appendChild(link);

    row.appendChild(label);
    row.appendChild(actions);
    return row;
  }

  function render() {
    listEl.textContent = "";

    // items 已經排序好，依出現順序分組即可
    var groups = [];
    var byTerm = {};
    items.forEach(function (item) {
      if (!byTerm[item.term]) {
        byTerm[item.term] = { term: item.term, items: [] };
        groups.push(byTerm[item.term]);
      }
      byTerm[item.term].items.push(item);
    });

    groups.forEach(function (group) {
      var details = el("details", "dl-group");
      details.open = true;
      details.dataset.groupId = "term-" + group.term;

      var summary = el("summary", "dl-group-head");
      summary.appendChild(el("span", "dl-chevron", "▶"));
      var title = el("span", "dl-group-title", group.term);
      title.appendChild(el("small", null, group.items.length + " 份"));
      summary.appendChild(title);
      details.appendChild(summary);

      group.items.forEach(function (item) {
        details.appendChild(renderItem(item));
      });
      listEl.appendChild(details);
    });
  }

  function applyFilter() {
    var shown = 0;
    Array.prototype.forEach.call(listEl.querySelectorAll(".dl-group"), function (groupEl) {
      var groupShown = 0;
      Array.prototype.forEach.call(groupEl.querySelectorAll(".dl-item"), function (row) {
        var ok = !query || row.dataset.search.indexOf(query) !== -1;
        row.hidden = !ok;
        if (ok) groupShown++;
      });
      groupEl.hidden = groupShown === 0;
      if (query && groupShown > 0) groupEl.open = true;
      shown += groupShown;
    });

    var empty = listEl.querySelector(".dl-empty");
    if (shown === 0 && !empty) {
      listEl.appendChild(el("p", "dl-empty", "找不到符合「" + query + "」的考卷。"));
    } else if (shown > 0 && empty) {
      empty.remove();
    }
  }

  function applySort() {
    items.sort(function (a, b) {
      return sortAsc ? a.termSort - b.termSort : b.termSort - a.termSort;
    });
    sortBtn.textContent = sortAsc ? "由舊到新 ↑" : "由新到舊 ↓";
  }

  /* ------------------------------ 初始化 ----------------------------- */

  fetch("/assets/data/manifest.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (manifest) {
      items = manifest.pastExams || [];
      applySort();
      render();

      searchEl.addEventListener("input", function () {
        query = searchEl.value.trim().toLowerCase();
        applyFilter();
      });

      sortBtn.addEventListener("click", function () {
        sortAsc = !sortAsc;
        applySort();
        render();
        applyFilter();
      });

      toggleBtn.addEventListener("click", function () {
        var open = toggleBtn.dataset.state !== "open";
        Array.prototype.forEach.call(listEl.querySelectorAll(".dl-group"), function (g) {
          g.open = open;
        });
        toggleBtn.dataset.state = open ? "open" : "closed";
        toggleBtn.textContent = open ? "全部收合" : "全部展開";
      });
    })
    .catch(function (err) {
      listEl.textContent = "";
      listEl.appendChild(
        el("p", "dl-empty", "考卷清單載入失敗（" + err.message + "），請重新整理頁面試試。")
      );
    });
})();
