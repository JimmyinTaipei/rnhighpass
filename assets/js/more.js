/**
 * 更多考題：分章詳解 / 分章題本 / 歷年考題。
 *
 *   - 分章詳解、分章題本：左側 11 科（可展開，展開後顯示該科合訂本封面），右側列出章節。
 *   - 歷年考題：左側學期清單，右側是該學期 5 份考卷的封面。
 *
 * 目前位置記在網址 hash：#explanations/05、#workbooks/02、#past/115-2，
 * 可以直接分享連結，重新整理也會停在同一個地方。
 */
(function () {
  "use strict";

  var RN = window.RN;
  var el = RN.el;
  var sideEl = document.getElementById("more-side");
  var mainEl = document.getElementById("more-main");
  var bulkCards = document.querySelectorAll("[data-bulk]");

  var TYPE_BY_TAB = { explanations: "詳解", workbooks: "題本" };
  var TAB_LABEL = { explanations: "分章詳解", workbooks: "分章題本", past: "歷年考題" };
  var ICON_PM = '<path d="M5 12h14"/><path d="M12 5v14"/>';

  var manifest = null;
  var chaptersBySubject = {}; // "詳解|05" → [章節…]
  var termList = []; // [{ term, termSort, exams: [...] }]，由新到舊

  var state = { tab: null, subject: null, term: null };
  var tabs = RN.setupTabs(document.getElementById("more-tabs"), function (id) {
    go({ tab: id });
  });

  /* ------------------------------ 路由 ------------------------------ */

  function parseHash() {
    var parts = location.hash.slice(1).split("/");
    var tab = TAB_LABEL[parts[0]] ? parts[0] : "explanations";
    var rest = "";
    try {
      rest = decodeURIComponent(parts[1] || "");
    } catch (e) {
      rest = "";
    }
    return tab === "past" ? { tab: tab, term: rest } : { tab: tab, subject: rest };
  }

  function writeHash() {
    var tail = state.tab === "past" ? state.term : state.subject;
    var hash = "#" + state.tab + "/" + encodeURIComponent(tail);
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }

  /** 切換到新的位置；沒指定或不存在的科目/學期會退回第一個。 */
  function go(next) {
    var tabChanged = next.tab !== state.tab;
    state.tab = next.tab;

    if (state.tab === "past") {
      var term = next.term || state.term;
      if (!termList.some(function (t) { return t.term === term; })) term = termList[0].term;
      state.term = term;
    } else {
      var no = next.subject || state.subject;
      if (!manifest.subjects.some(function (s) { return s.no === no; })) no = manifest.subjects[0].no;
      state.subject = no;
    }

    tabs.select(state.tab);
    Array.prototype.forEach.call(bulkCards, function (card) {
      card.classList.toggle("is-inactive", card.dataset.bulk !== state.tab);
    });

    // 換分頁時整個側欄重畫（詳解與題本的封面不同）；
    // 同一分頁內換科目則只切換 class，才看得到展開動畫。
    if (tabChanged) renderSide();
    else updateSide();
    renderMain();
    writeHash();
  }

  /* ------------------------------ 側欄 ------------------------------ */

  function renderSide() {
    sideEl.textContent = "";
    var list = el("ul", "side-list");
    if (state.tab === "past") {
      sideEl.setAttribute("aria-label", "學期");
      var lastYear = null;
      termList.forEach(function (t) {
        var year = t.term.slice(0, 3);
        if (year !== lastYear) {
          list.appendChild(el("li", "side-year", year + " 年"));
          lastYear = year;
        }
        var li = el("li", "side-item");
        var btn = el("button", "side-term");
        btn.type = "button";
        btn.dataset.term = t.term;
        btn.appendChild(el("span", null, t.term.replace("補考", " 補考")));
        btn.appendChild(el("small", null, t.exams.length + " 份"));
        btn.addEventListener("click", function () {
          go({ tab: "past", term: t.term });
        });
        li.appendChild(btn);
        list.appendChild(li);
      });
    } else {
      sideEl.setAttribute("aria-label", "科目");
      var type = TYPE_BY_TAB[state.tab];
      manifest.subjects.forEach(function (s) {
        list.appendChild(renderSubjectItem(s, type));
      });
    }
    sideEl.appendChild(list);
    updateSide();
  }

  function renderSubjectItem(s, type) {
    var li = el("li", "side-item");
    li.dataset.group = RN.subjectGroup(s.no);
    li.dataset.no = s.no;

    var panelId = "side-panel-" + s.no;
    var btn = el("button", "side-trigger");
    btn.type = "button";
    btn.setAttribute("aria-controls", panelId);
    btn.appendChild(RN.svg(ICON_PM, "pm"));
    var chip = el("span", "side-chip");
    chip.appendChild(RN.subjectIcon(s.name));
    btn.appendChild(chip);
    btn.appendChild(el("span", "side-name", s.fullName));
    btn.addEventListener("click", function () {
      if (state.subject === s.no) {
        // 再點一次已選的科目：只收合/展開封面，右側章節不變
        setOpen(li, !li.classList.contains("is-open"));
      } else {
        go({ tab: state.tab, subject: s.no });
      }
    });
    li.appendChild(btn);

    var panel = el("div", "side-panel");
    panel.id = panelId;
    var inner = el("div", "side-panel-inner");
    var bundle = manifest.bundles.find(function (b) {
      return b.subjectNo === s.no && b.type === type;
    });
    if (bundle) {
      var card = RN.coverCard({
        key: bundle.key,
        fileName: bundle.name,
        size: bundle.size,
        cover: s.covers[type],
        title: "整本合訂本",
        sub: "全部章節合併成一本",
      });
      card.classList.add("side-cover");
      inner.appendChild(card);
    }
    panel.appendChild(inner);
    li.appendChild(panel);
    return li;
  }

  function setOpen(li, open) {
    li.classList.toggle("is-open", open);
    li.querySelector(".side-trigger").setAttribute("aria-expanded", open ? "true" : "false");
    // 收合時裡面的下載連結不該被 Tab 鍵選到
    var panel = li.querySelector(".side-panel");
    if (open) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
  }

  function updateSide() {
    if (state.tab === "past") {
      Array.prototype.forEach.call(sideEl.querySelectorAll(".side-term"), function (btn) {
        var on = btn.dataset.term === state.term;
        if (on) btn.setAttribute("aria-current", "true");
        else btn.removeAttribute("aria-current");
      });
    } else {
      Array.prototype.forEach.call(sideEl.querySelectorAll(".side-item"), function (li) {
        var on = li.dataset.no === state.subject;
        li.classList.toggle("is-active", on);
        setOpen(li, on);
      });
    }
    // 手機版側欄是橫向捲動的標籤列：把選到的那顆捲進畫面
    var current = sideEl.querySelector(".side-item.is-active, .side-term[aria-current]");
    if (current && window.matchMedia("(max-width: 720px)").matches) {
      current.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  /* ------------------------------ 右側內容 ------------------------------ */

  function renderMain() {
    mainEl.textContent = "";
    mainEl.setAttribute("aria-labelledby", "tab-" + state.tab);
    if (state.tab === "past") renderTerm();
    else renderChapters();

    // 在長頁面下方點了側欄時，把內容開頭帶回畫面裡
    var top = mainEl.getBoundingClientRect().top;
    if (top < 0) mainEl.scrollIntoView({ block: "start" });
  }

  function renderChapters() {
    var type = TYPE_BY_TAB[state.tab];
    var s = manifest.subjects.find(function (x) { return x.no === state.subject; });
    var chapters = chaptersBySubject[type + "|" + s.no] || [];
    mainEl.dataset.group = RN.subjectGroup(s.no);

    var head = el("div", "panel-head");
    var chip = el("span", "side-chip");
    chip.appendChild(RN.subjectIcon(s.name));
    head.appendChild(chip);
    head.appendChild(el("h3", null, s.no + "　" + s.fullName));
    head.appendChild(el("small", null, TAB_LABEL[state.tab] + "・共 " + chapters.length + " 章"));
    mainEl.appendChild(head);

    if (!chapters.length) {
      mainEl.appendChild(el("p", "dl-empty", "這一科目前沒有分章檔案。"));
      return;
    }

    var grid = el("div", "ch-grid");
    chapters.forEach(function (c) {
      var card = el("a", "ch-card");
      card.href = RN.fileUrl(c.key);
      card.setAttribute("download", c.name);
      card.title = c.name;
      card.setAttribute("aria-label", "下載 " + c.name + "（" + RN.formatSize(c.size) + "）");

      card.appendChild(el("span", "ch-no", c.ch));
      card.appendChild(el("span", "ch-bar"));
      card.appendChild(el("span", "ch-title", c.chapterTitle));

      var meta = el("span", "ch-meta");
      meta.appendChild(el("span", null, RN.formatSize(c.size)));
      meta.appendChild(RN.svg(RN.ICON_DOWNLOAD));
      card.appendChild(meta);
      grid.appendChild(card);
    });
    mainEl.appendChild(grid);
  }

  function renderTerm() {
    delete mainEl.dataset.group;
    var t = termList.find(function (x) { return x.term === state.term; });

    var head = el("div", "panel-head");
    head.appendChild(el("h3", null, t.term.replace("補考", " 補考") + "　歷年考題"));
    head.appendChild(el("small", null, "共 " + t.exams.length + " 份"));
    mainEl.appendChild(head);

    var grid = el("div", "cover-grid cover-grid--5");
    t.exams.forEach(function (e) {
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
    mainEl.appendChild(grid);
  }

  /* ------------------------------ 初始化 ------------------------------ */

  RN.loadManifest()
    .then(function (data) {
      manifest = data;
      manifest.chapters.forEach(function (c) {
        var k = c.type + "|" + c.subjectNo;
        (chaptersBySubject[k] = chaptersBySubject[k] || []).push(c);
      });
      Object.keys(chaptersBySubject).forEach(function (k) {
        chaptersBySubject[k].sort(function (a, b) { return a.ch.localeCompare(b.ch); });
      });

      // manifest 的考古題已經由新到舊排好（補考在同學期正試之後），依出現順序分組
      var byTerm = {};
      manifest.pastExams.forEach(function (e) {
        if (!byTerm[e.term]) {
          byTerm[e.term] = { term: e.term, termSort: e.termSort, exams: [] };
          termList.push(byTerm[e.term]);
        }
        byTerm[e.term].exams.push(e);
      });

      go(parseHash());
      window.addEventListener("hashchange", function () {
        go(parseHash());
      });
    })
    .catch(function (err) {
      RN.loadError(mainEl, err, "檔案清單");
      sideEl.textContent = "";
    });
})();
