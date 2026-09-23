/**
 * 全站共用：手機版漢堡選單、回到頂端按鈕，以及下載頁共用的小工具（window.RN）。
 *
 * 每一頁都會載入這支檔案；首頁（home.js）與更多考題（more.js）依賴 window.RN，
 * 所以這支一定要排在它們前面（都用 defer，會照 <script> 的順序執行）。
 */
(function () {
  "use strict";

  /* ------------------------------ 工具函式 ------------------------------ */

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

  /** 內嵌 SVG（字串來自本站寫死的 icon，不含使用者輸入）。 */
  function svg(inner, className, viewBox) {
    var span = document.createElement("span");
    span.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (viewBox || "0 0 24 24") +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
      ' stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
    var node = span.firstChild;
    if (className) node.setAttribute("class", className);
    return node;
  }

  var ICON_DOWNLOAD =
    '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>';

  var manifestPromise = null;
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch("/assets/data/manifest.json").then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    }
    return manifestPromise;
  }

  /** 國考 11 科分 5 大類，配色比照多保命測驗（subject-groups.ts）。 */
  function subjectGroup(no) {
    var i = Number(no);
    if (i <= 4) return "BM";
    if (i <= 6) return "FA";
    if (i === 7) return "MS";
    if (i <= 9) return "OP";
    return "PC";
  }

  /**
   * 封面下載卡：有滑鼠時 hover 變暗、正中央出現下載鈕；
   * 觸控裝置下載鈕常駐在封面下緣（樣式見 downloads.css 的 .cover-card）。
   */
  function coverCard(opts) {
    var card = el("a", "cover-card");
    card.href = fileUrl(opts.key);
    card.setAttribute("download", opts.fileName);
    card.title = opts.fileName;
    card.setAttribute("aria-label", "下載 " + opts.fileName + "（" + formatSize(opts.size) + "）");

    var media = el("span", "cover-media");
    var img = el("img", "cover-img");
    img.src = "/" + opts.cover;
    img.alt = "";
    img.loading = "lazy";
    img.width = 600;
    img.height = 852;
    media.appendChild(img);

    var btn = el("span", "cover-btn");
    btn.appendChild(svg(ICON_DOWNLOAD));
    btn.appendChild(el("span", null, "下載 " + formatSize(opts.size)));
    media.appendChild(btn);
    card.appendChild(media);

    var meta = el("span", "cover-meta");
    meta.appendChild(el("span", "cover-title", opts.title));
    if (opts.sub) meta.appendChild(el("span", "cover-sub", opts.sub));
    card.appendChild(meta);
    return card;
  }

  /**
   * 分頁列（仿 antd 水平 Menu）：點擊或方向鍵切換。
   * tab 按鈕要有 data-tab；onSelect(id) 由呼叫端負責切換內容。
   */
  function setupTabs(tablist, onSelect) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll("[role=tab]"));

    function select(id) {
      tabs.forEach(function (t) {
        var on = t.dataset.tab === id;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () {
        onSelect(tab.dataset.tab);
      });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        next.focus();
        onSelect(next.dataset.tab);
      });
    });
    return { select: select, ids: tabs.map(function (t) { return t.dataset.tab; }) };
  }

  function loadError(target, err, what) {
    target.textContent = "";
    target.appendChild(el("p", "dl-empty", what + "載入失敗（" + err.message + "），請重新整理頁面試試。"));
  }

  window.RN = {
    formatSize: formatSize,
    fileUrl: fileUrl,
    el: el,
    svg: svg,
    ICON_DOWNLOAD: ICON_DOWNLOAD,
    loadManifest: loadManifest,
    subjectGroup: subjectGroup,
    coverCard: coverCard,
    setupTabs: setupTabs,
    loadError: loadError,
  };

  /* ------------------------------ 漢堡選單 ------------------------------ */

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    function setOpen(open) {
      header.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "關閉選單" : "開啟選單");
    }
    toggle.addEventListener("click", function () {
      setOpen(!header.classList.contains("is-open"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    Array.prototype.forEach.call(header.querySelectorAll(".main-nav a"), function (a) {
      a.addEventListener("click", function () {
        setOpen(false);
      });
    });
  }

  /* ------------------------------ 回到頂端 ------------------------------ */

  var topBtn = el("button", "to-top");
  topBtn.type = "button";
  topBtn.setAttribute("aria-label", "回到頂端");
  topBtn.appendChild(svg('<path d="m18 15-6-6-6 6"/>'));
  document.body.appendChild(topBtn);

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  topBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
  });

  var ticking = false;
  function updateTopBtn() {
    topBtn.classList.toggle("is-visible", window.scrollY > 600);
    ticking = false;
  }
  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(updateTopBtn);
      }
    },
    { passive: true }
  );
  updateTopBtn();
})();
