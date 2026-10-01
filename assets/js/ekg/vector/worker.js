/**
 * 在背景執行緒跑心電向量運算，主畫面不會卡住。
 * 收到 { type: "run", id, params } → 回傳 { type: "result", id, ...結果 }。
 * 第一次執行先算一次正常拍當作振幅校正，之後所有情境都用同一組校正，振幅才能互相比較。
 */
import { createModel, simulate, ecg, LEADS } from "./engine.js";

var model = null, cal = null, ready = null;

function load(url) {
  ready = ready || fetch(url).then(function (r) { return r.json(); }).then(function (data) {
    model = createModel(data);
    cal = ecg(model, simulate(model, {}), 1).cal;
  });
  return ready;
}

self.onmessage = function (ev) {
  var msg = ev.data;
  if (msg.type !== "run") return;
  load(msg.url).then(function () {
    var sim = simulate(model, msg.params);
    var e = ecg(model, sim, 1, cal);
    var leads = LEADS.map(function (k) { return Float32Array.from(e.leads[k]); });
    var at = Float32Array.from(sim.at), rt = Float32Array.from(sim.rt), vec = Float32Array.from(e.vector);
    self.postMessage({
      type: "result", id: msg.id, rr: sim.rr, events: sim.events,
      at: at, rt: rt, vector: vec, leads: leads
    }, [at.buffer, rt.buffer, vec.buffer].concat(leads.map(function (x) { return x.buffer; })));
  }).catch(function (err) {
    self.postMessage({ type: "error", id: msg.id, message: String(err && err.message || err) });
  });
};
