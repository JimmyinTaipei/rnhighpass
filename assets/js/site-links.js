/**
 * 把 assets/data/links.json 裡的外部連結填進頁面。
 *
 * 用法：在元素上標 data-link="drive.explanations" 或 data-link="social.threads"。
 *   - 有填網址 → 設成 href
 *   - 沒填（空字串或缺欄位）→ 把該元素連同它的 [data-link-wrap] 容器一起隱藏
 *
 * 這樣社群網址還沒補之前不會出現死連結；補上去只要改 JSON，不用動程式。
 */
(function () {
  "use strict";

  /** 用 "drive.explanations" 這種路徑取值。 */
  function pick(obj, path) {
    return path.split(".").reduce(function (acc, k) {
      return acc && typeof acc === "object" ? acc[k] : undefined;
    }, obj);
  }

  /** 找出要一起隱藏的外層容器（沒標就隱藏元素本身）。 */
  function wrapperOf(el) {
    return el.closest("[data-link-wrap]") || el;
  }

  function apply(links) {
    var nodes = document.querySelectorAll("[data-link]");

    Array.prototype.forEach.call(nodes, function (el) {
      var url = pick(links, el.dataset.link);
      if (typeof url === "string" && url.trim()) {
        el.href = url.trim();
        el.hidden = false;
      } else {
        wrapperOf(el).hidden = true;
      }
    });

    // 整個區塊的連結都沒填就把區塊收掉，免得留下一個空標題。
    Array.prototype.forEach.call(document.querySelectorAll("[data-link-section]"), function (section) {
      var alive = section.querySelectorAll("[data-link]:not([hidden])");
      var visible = Array.prototype.filter.call(alive, function (el) {
        return !wrapperOf(el).hidden;
      });
      if (visible.length === 0) section.hidden = true;
    });
  }

  fetch("/assets/data/links.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(apply)
    .catch(function () {
      // 讀不到設定就把所有外部連結藏起來，不要留下壞掉的按鈕。
      Array.prototype.forEach.call(document.querySelectorAll("[data-link]"), function (el) {
        wrapperOf(el).hidden = true;
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-link-section]"), function (s) {
        s.hidden = true;
      });
    });
})();
