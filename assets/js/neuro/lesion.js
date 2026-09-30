/**
 * 神經解剖學：從病灶範圍推導症狀（瀏覽器與 build／檢查腳本共用）。
 *
 * 規則全部來自路徑資料（哪一條路徑在哪個索、在脊髓同側還是對側），不是針對每個病灶寫死：
 *   後柱（同側未交叉）      → 同側、病灶以下的本體覺、震動覺、精細觸覺喪失
 *   前外側系統（已交叉）    → 對側、約病灶下方兩節以下的痛溫覺喪失（交叉要上升 1–3 節）
 *   外側皮質脊髓徑（已交叉）→ 同側、病灶以下的上運動神經元徵象
 *   前角                    → 同側、病灶節段的下運動神經元徵象
 *   後角／後根              → 同側、病灶節段的皮節感覺全失
 *   白質前連合              → 雙側、病灶節段的痛溫覺喪失
 *   下視丘脊髓徑（T1 以上） → 同側 Horner 症候群
 * 腦部的病灶另外看切到哪些腦神經核、腦神經纖維，以及視覺路徑與瞳孔反射的纖維（visual.js）。
 */
import { inZone, samples, visualLoss, visualItems } from "./visual.js";
import { auditoryLoss, auditoryItems } from "./auditory.js";

var SIDE_ZH = { R: "右側", L: "左側", B: "雙側" };

/**
 * @param model createModel() 的結果
 * @param zones lesions.json 的 zones（可以先用 adjustZones 改節段與側別）
 * @returns [{ key, side, text, minor }]
 */
export function deficits(model, zones) {
  var T = model.data.tracts.tracts;
  var N = model.N, segs = model.segs;
  var found = {};   // key（不含側別）→ { R: {...}, L: {...} }

  function hit(kind, side, info) {
    found[kind] = found[kind] || {};
    var cur = found[kind][side];
    // 同一種缺損取最頭側（範圍最大）的那一個
    if (!cur || (info.from != null && info.from < cur.from)) {
      if (cur && cur.via) info.via = cur.via.concat(info.via || []);
      found[kind][side] = info;
    }
    else if (cur && info.to != null && cur.to != null) cur.to = Math.max(cur.to, info.to);
    else if (cur && info.brain) {
      // 腦部：記下是切到哪些結構；只要有一個不是次要的，整項就不是次要的
      cur.via = (cur.via || []).concat(info.via || []);
      if (!info.minor) cur.minor = false;
    }
  }

  zones.forEach(function (z) {
    if (z.brain) { brainHits(model, z.brain, hit); return; }
    var a = model.segIdx[z.segs[0]], b = model.segIdx[z.segs[1]];
    var cordSides = z.side === "both" ? ["R", "L"] : [z.side];
    var parts = z.parts.indexOf("all") >= 0 ? ["dc", "lf", "af", "ah", "dh"] : z.parts;
    var except = z.except || [];

    cordSides.forEach(function (cs) {
      // 這一側脊髓裡被切到的 bundle
      var cut = [];
      Object.keys(T).forEach(function (tid) {
        T[tid].bundles.forEach(function (bd) {
          if (!bd.phi || except.indexOf(bd.id) >= 0) return;
          // bundle 至少要在病灶範圍的某一節出現
          var inRange = false;
          for (var s = a; s <= b; s++) if (model.present(bd, s + 0.5)) inRange = true;
          if (!inRange) return;
          var byFun = bd.funiculus && parts.indexOf(bd.funiculus) >= 0;
          var byId = parts.indexOf(bd.id) >= 0;
          var medial = bd.id === "lcst" && parts.indexOf("lcst-medial") >= 0;
          if (byFun || byId || medial) cut.push({ tid: tid, b: bd, medialOnly: medial && !byFun && !byId });
        });
      });

      cut.forEach(function (c) {
        // 這條 bundle 負責的身體側
        var body = c.b.cordSide === "contra" ? (cs === "R" ? "L" : "R") : cs;
        var tid = c.tid;
        if (tid === "dcml") hit("dc", body, { from: a + 1 });
        else if (tid === "als") hit("als", body, { from: a + 2 });
        else if (tid === "lcst") hit(c.medialOnly ? "umn-arm" : "umn", body, { from: a + 1 });
        else if (tid === "dsct" && a <= model.segIdx.l2) hit("dsct", body, { from: Math.max(a + 1, model.segIdx.t1), minor: true });
        else if (tid === "vsct") hit("vsct", body, { minor: true });
        else if (tid === "hypothalamospinal" && a <= model.segIdx.t1) hit("horner", body, {});
      });

      if (parts.indexOf("ah") >= 0) hit("lmn", cs, { from: a, to: b });
      if (parts.indexOf("dh") >= 0) hit("segsens", cs, { from: a, to: b });
      if (parts.indexOf("droot") >= 0) hit("areflexia", cs, { from: a, to: b });
    });

    if (parts.indexOf("awc") >= 0) hit("awc", "B", { from: a, to: b });

    // 雙側外側索都斷在 S2 以上：膀胱、腸道失去自主控制
    var bilateralLf = z.side === "both" && (parts.indexOf("lf") >= 0);
    if (bilateralLf && a < model.segIdx.s2) hit("bladder", "B", {});
  });

  // 外旋神經核受損已經包含外旋神經的症狀
  if (found.gaze && found.cn6) Object.keys(found.gaze).forEach(function (sd) { delete found.cn6[sd]; });
  // 視丘腹後核受損已經包含同一側的內側蹄系、前外側系統與三叉丘腦徑的症狀
  if (found["thal-body"]) Object.keys(found["thal-body"]).forEach(function (sd) { ["ml", "als"].forEach(function (k) { if (found[k]) delete found[k][sd]; }); });
  if (found["thal-face"]) Object.keys(found["thal-face"]).forEach(function (sd) { ["face-pain", "face-touch"].forEach(function (k) { if (found[k]) delete found[k][sd]; }); });
  // 小腦半球本身受損、或紅核附近受損，已經包含同一側的共濟失調
  ["cb-limb", "red"].forEach(function (k) {
    if (found[k] && found.ataxia) Object.keys(found[k]).forEach(function (sd) { delete found.ataxia[sd]; });
  });

  // 視覺路徑與瞳孔反射
  var vis = [];
  var bz = zones.filter(function (z) { return z.brain; });
  if (model.vis && bz.length) {
    visualItems(visualLoss(model, bz)).forEach(function (it) {
      // 動眼神經麻痺的描述已經包含瞳孔放大
      if (it.kind === "pupil-eff" && found.cn3 && found.cn3[it.side]) return;
      vis.push({ key: it.key, kind: it.kind, side: it.side, text: it.text, minor: false });
    });
  }

  // 聽覺與前庭（內耳、前庭耳蝸神經、聽覺路徑）
  if (model.aud && bz.length) {
    auditoryItems(auditoryLoss(model, bz)).forEach(function (it) { vis.push(it); });
  }

  // 左右合併成「雙側」
  var out = [];
  Object.keys(found).forEach(function (kind) {
    var f = found[kind];
    if (NOSIDE[kind] && (f.R || f.L) && !f.B) { f.B = f.R || f.L; delete f.R; delete f.L; }
    if (f.R && f.L && f.R.from === f.L.from && f.R.to === f.L.to) { f.B = f.R; delete f.R; delete f.L; }
    ["B", "R", "L"].forEach(function (side) {
      if (!f[side]) return;
      var info = f[side];
      var key;
      if (info.brain) key = NOSIDE[kind] ? kind : kind + ":" + side;
      else {
        key = kind + (kind === "bladder" ? "" : ":" + side +
          (kind === "als" ? ":below2" : /^(dc|umn|umn-arm)$/.test(kind) ? ":below" : /^(lmn|segsens|awc|areflexia)$/.test(kind) ? ":seg" : ""));
        if (kind === "horner" || kind === "dsct" || kind === "vsct") key = kind + ":" + side;
      }
      var txt = info.brain ? describeBrain(kind, side, info) : describe(kind, side, info, segs, N);
      if (txt) out.push({ key: key, kind: kind, side: side, text: txt, minor: !!info.minor });
    });
  });
  out = out.concat(vis);
  var ORDER = ["blind", "bitemporal", "hh", "quad", "scot", "vf", "cn3", "cn4", "cn5", "cn5m", "gaze", "cn6", "ino", "cn7", "cn8", "bulbar", "cn11", "cn12", "face-pain", "face-touch", "hearing", "vestib-periph", "vestib", "aud-central", "upgaze", "red",
    "lnd", "rapd", "pupil-eff", "thal-body", "thal-face", "hemiballismus", "parkinsonism", "chorea", "lentiform", "amnesia", "di", "cb-limb", "cb-trunk", "cb-fn", "cst", "cbt", "ml", "dc", "als", "umn", "umn-arm", "lmn", "segsens", "awc", "areflexia", "horner", "ataxia", "bladder", "taste", "dsct", "vsct"];
  out.sort(function (x, y) { return ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind) || x.side.localeCompare(y.side); });
  return out;
}

function segName(segs, i) { return segs[Math.min(i, segs.length - 1)].name; }
function landmark(segs, i) {
  for (var k = i; k >= Math.max(0, i - 1); k--) if (segs[k] && segs[k].dermatome) return segs[k].dermatome;
  return "";
}
function below(segs, i, N) {
  if (i >= N) return null;
  var lm = landmark(segs, i);
  return segName(segs, i) + " 以下" + (lm ? "（約" + lm + "以下）" : "");
}
function range(segs, a, b) { return a === b ? segName(segs, a) : segName(segs, a) + "–" + segName(segs, b); }

function describe(kind, side, info, segs, N) {
  var S = SIDE_ZH[side];
  switch (kind) {
    case "dc": { var w = below(segs, info.from, N); return w && S + " " + w + "：本體覺、震動覺、精細觸覺喪失（後柱）"; }
    case "als": { var w2 = below(segs, info.from, N); return w2 && S + " " + w2 + "：痛覺、溫度覺喪失（前外側系統）"; }
    case "umn": { var w3 = below(segs, info.from, N); return w3 && S + " " + w3 + "：上運動神經元癱瘓——痙攣、反射亢進、Babinski 陽性（外側皮質脊髓徑）"; }
    case "umn-arm": return S + "上肢為主的無力（外側皮質脊髓徑內側的上肢纖維）";
    case "lmn": return S + " " + range(segs, info.from, info.to) + " 支配的肌肉：下運動神經元徵象——弛緩、萎縮、反射消失、肌束震顫（前角）";
    case "segsens": return S + " " + range(segs, info.from, info.to) + " 皮節：所有感覺喪失（後根、後角）";
    case "awc": return "雙側 " + range(segs, info.from, info.to) + " 皮節：痛溫覺喪失、觸覺保留（白質前連合）";
    case "areflexia": return S + " " + range(segs, info.from, info.to) + "：深部肌腱反射消失（後根傳入端中斷）";
    case "horner": return S + " Horner 症候群：眼瞼下垂、瞳孔縮小、無汗（下視丘脊髓徑）";
    case "bladder": return "膀胱、腸道失去自主控制";
    case "dsct": return S + "下肢無意識本體感覺（往小腦）受影響（後脊髓小腦徑）";
    case "vsct": return S + "下肢往小腦的回饋受影響（前脊髓小腦徑，臨床上不明顯）";
  }
  return "";
}

/** 依使用者選的節段與側別調整 zones（只用在 adjustable 的病灶）。 */
export function adjustZones(zones, segId, side) {
  return zones.map(function (z) {
    var o = Object.assign({}, z);
    if (segId) o.segs = [segId, segId];
    if (side && o.side !== "both") o.side = side;
    return o;
  });
}

export function deficitKeys(list) {
  return list.filter(function (d) { return !d.minor; }).map(function (d) { return d.key; }).sort();
}

/* ======================================================================
   腦幹病灶：看哪些路徑、神經核、腦神經纖維穿過病灶範圍
   ====================================================================== */
var NOSIDE = { vestib: 1, upgaze: 1, bladder: 1, "cb-trunk": 1, "cb-fn": 1, amnesia: 1, di: 1 };
var OPP = { R: "L", L: "R" };

// 路徑（bundle id）→ 缺損種類；side：body = 這條纖維負責的身體側，opp = 相反側
var BUNDLE_FX = {
  lstt: ["als", "body"], astt: ["als", "body"], ml: ["ml", "body"], gracile: ["ml", "body"], cuneate: ["ml", "body"],
  lcst: ["cst", "body"], acst: ["cst", "body"], cbt: ["cbt", "body"],
  vtt: ["face-pain", "body"], sp5t: ["face-pain", "body"],
  hypothalamospinal: ["horner", "body"], dsct: ["ataxia", "body", false, "脊髓小腦徑"], cuneocb: ["ataxia", "body", false, "脊髓小腦徑"], rsct: ["ataxia", "body", false, "脊髓小腦徑"],
  vsct: ["vsct", "body", true], "mlf-asc": ["ino", "opp"],
  // 小腦的傳入與傳出（body = 這條纖維服務的身體側 = 同側小腦）
  dtt: ["ataxia", "body", false, "上小腦腳"],
  // 間腦
  hht: ["di", "body", false, "下視丘垂體徑"], "hht-pvn": ["di", "body", false, "下視丘垂體徑"]
};
// 神經核（structure id）→ 缺損種類；side：same = 核所在側，opp = 對側
var NUC_FX = {
  "hypoglossal-nucleus": ["cn12", "same"], ambiguus: ["bulbar", "same"], sp5: ["face-pain", "same"],
  "vestibular-nuclei": ["vestib", "same"], "medial-vestibular-nucleus": ["vestib", "same"], "lateral-vestibular-nucleus": ["vestib", "same"],
  "cochlear-nuclei": ["hearing", "same"], "abducens-nucleus": ["gaze", "same"], pprf: ["gaze", "same"],
  "facial-nucleus": ["cn7", "same"], "trigeminal-motor": ["cn5m", "same"], "principal-sensory": ["face-touch", "same"],
  "trochlear-nucleus": ["cn4", "opp"], "oculomotor-nucleus": ["cn3", "same"], "edinger-westphal": ["cn3", "same"],
  "red-nucleus": ["red", "opp"], pretectal: ["upgaze", "same"], icp: ["ataxia", "same"],
  "n-gracilis": ["ml", "same"], "n-cuneatus": ["ml", "same"], solitary: ["taste", "same", true],
  fastigial: ["cb-fn", "same"], interposed: ["cb-limb", "same"], dentate: ["cb-limb", "same"],
  vpl: ["thal-body", "opp"], vpm: ["thal-face", "opp"], subthalamic: ["hemiballismus", "opp"],
  "mammillary-body": ["amnesia", "same"], md: ["amnesia", "same"], son: ["di", "same"], pvn: ["di", "same"],
  // 基底核（迴路不交叉，症狀在對側身體）
  snc: ["parkinsonism", "opp"], caudate: ["chorea", "opp"], putamen: ["lentiform", "opp"]
};
var VIA = { icp: "下小腦腳", "mammillary-body": "乳頭體", md: "背內側核", son: "視上核", pvn: "室旁核", caudate: "尾狀核", putamen: "殼核" };
var NERVE_FX = { cn3: "cn3", cn4: "cn4", cn5: "cn5", cn6: "cn6", cn7: "cn7", cn8: "cn8", cn9: "bulbar", cn10: "bulbar", cn11: "cn11", cn12: "cn12" };

function brainHits(model, zb, hit) {
  var T = model.data.tracts.tracts, S = model.data.structures.structures;
  var NV = (model.data.nerves && model.data.nerves.nerves) || {};
  var info = function (minor, via) { return { brain: true, minor: !!minor, via: via ? [via] : [] }; };
  // 路徑
  Object.keys(T).forEach(function (tid) {
    T[tid].bundles.forEach(function (bd) {
      var fx = BUNDLE_FX[bd.id];
      if (!fx || !bd.brain) return;
      ["R", "L"].forEach(function (body) {
        var pts = bd.brain.map(function (w) { return { x: model.sx(w[1], body), y: w[0], z: w[2] }; });
        if (samples(pts).some(function (p) { return inZone(zb, p); })) hit(fx[0], fx[1] === "opp" ? OPP[body] : body, info(fx[2], fx[3]));
      });
    });
  });
  // 小腦皮質：在病灶範圍裡每 1.5 mm 取一點，看落在哪一區
  if (model.cbClassify) {
    var seen = {};
    (zb.side === "both" ? [-1, 1] : [zb.side === "L" ? 1 : -1]).forEach(function (sd) {
      zb.boxes.forEach(function (b) {
        for (var y = zb.y[0]; y <= zb.y[1] + 1e-6; y += 1.5)
          for (var lat = b.lat[0]; lat <= b.lat[1] + 1e-6; lat += 1.5)
            for (var z = b.z[0]; z <= b.z[1] + 1e-6; z += 1.5) {
              var c = model.cbClassify({ x: sd * lat, y: y, z: z });
              if (!c) continue;
              var k = c.lobe === "fn" ? "cb-fn" : c.zone === "vermis" ? "cb-trunk" : "cb-limb";
              if (seen[k + c.side]) continue;
              seen[k + c.side] = 1;
              hit(k, c.side, info(false));
            }
      });
    });
  }
  // 神經核
  Object.keys(S).forEach(function (id) {
    var fx = NUC_FX[id], s = S[id];
    if (!fx) return;
    if (id === "cochlear-nuclei" && model.aud) return;   // auditory.js 會算
    ["R", "L"].forEach(function (side) {
      var pts;
      if (s.ell && model.ellSamples) pts = model.ellSamples(id, side);
      else if (s.nuc) pts = model.nucPath(id, side);
      else if (s.pos) pts = [{ x: model.sgn(side) * Math.abs(s.pos[1]), y: s.pos[0], z: s.pos[2] }];
      else return;
      if (samples(pts).some(function (p) { return inZone(zb, p); })) hit(fx[0], fx[1] === "opp" ? OPP[side] : side, info(fx[2], VIA[id]));
    });
  });
  // 腦神經纖維（第一個點是神經核本身，另外算）
  Object.keys(NV).forEach(function (id) {
    if (id === "cn8" && model.aud) return;   // 耳蝸與前庭兩部分由 auditory.js 分開算
    if (!NERVE_FX[id]) return;
    ["R", "L"].forEach(function (side) {
      var pts = model.nervePoints(id, side).slice(1);
      if (samples(pts).some(function (p) { return inZone(zb, p); })) hit(NERVE_FX[id], NV[id].crossed ? OPP[side] : side, info());
    });
  });
}

var VIA_ORDER = ["下小腦腳", "脊髓小腦徑", "中小腦腳", "橄欖小腦纖維", "上小腦腳"];
function describeBrain(kind, side, info) {
  var via = ((info && info.via) || []).filter(function (v, i, a) { return a.indexOf(v) === i; })
    .sort(function (a, b) { return VIA_ORDER.indexOf(a) - VIA_ORDER.indexOf(b); });
  var S = SIDE_ZH[side] || "", O = side === "R" ? "左" : side === "L" ? "右" : "";
  var s1 = side === "R" ? "右" : side === "L" ? "左" : "兩";
  switch (kind) {
    case "als": return S + "身體：痛覺、溫度覺喪失（前外側系統）";
    case "ml": return S + "身體：本體覺、震動覺、精細觸覺喪失（內側蹄系）";
    case "cst": return S + "上下肢：上運動神經元癱瘓（皮質脊髓纖維）";
    case "cbt": return S + "下半臉無力、伸舌偏向" + (side === "B" ? "無力側" : s1 + "側") + "（皮質延髓纖維，上運動神經元型）";
    case "face-pain": return S + "臉部：痛覺、溫度覺喪失（三叉神經感覺路徑）";
    case "face-touch": return S + "臉部：觸覺減弱（三叉神經主感覺核）";
    case "horner": return S + " Horner 症候群：眼瞼下垂、瞳孔縮小、無汗（下視丘脊髓徑）";
    case "ataxia": return S + "肢體共濟失調（" + (via.length ? via.join("、") : "小腦的傳入或傳出纖維") + "）";
    case "cb-limb": return S + "肢體小腦性共濟失調：辨距不良、意向性震顫、輪替運動障礙、肌張力低下（同側小腦半球或小腦核）";
    case "cb-trunk": return "軀幹與步態共濟失調：走路寬基、搖晃不穩，下肢比上肢明顯（小腦蚓部）";
    case "cb-fn": return "平衡障礙：站、坐都不穩，常合併眼球震顫（小葉結節葉、頂核，前庭小腦）";
    case "bulbar": return S + "軟顎、咽、喉肌無力：聲音沙啞、吞嚥困難，懸雍垂偏向" + O + "側（疑核、IX、X）";
    case "vestib": return "眩暈、眼球震顫、噁心嘔吐（前庭神經核）";
    case "thal-body": return S + "半身（頭以下）：觸覺、本體覺、痛溫覺都喪失（視丘 VPL）；之後可能出現劇烈的視丘痛";
    case "thal-face": return S + "臉：所有感覺喪失（視丘 VPM）";
    case "hemiballismus": return S + "偏身投擲症：突然、用力、甩動式的不自主動作，上肢近端最明顯（視丘下核）";
    case "parkinsonism": return S + "身體：Parkinson 症狀——靜止型顫抖、齒輪狀僵直、運動遲緩、姿勢不穩（黑質緻密部 → 紋狀體的多巴胺減少）";
    case "chorea": return S + "身體：舞蹈症——快速、不規則、無法停止的不自主動作，上肢與臉最明顯（" + (via.length ? via.join("、") : "紋狀體") + "）";
    case "lentiform": return S + "身體：肌張力異常、顫抖（揮翼樣）、僵直、構音困難（" + (via.length ? via.join("、") : "豆狀核") + "）";
    case "amnesia": return "順向性失憶：無法形成新的長期記憶，常會虛談（" + (via.length ? via.join("、") : "乳頭體、背內側核") + "）";
    case "di": return "中樞性尿崩症：大量稀釋的尿、口渴、喝很多水（" + (via.length ? via.join("、") : "下視丘垂體徑") + "）";
    case "hearing": return S + "聽力下降（耳蝸神經核）";
    case "cn12": return S + "舌肌無力、萎縮，伸舌偏向" + s1 + "側（舌下神經，下運動神經元）";
    case "cn6": return S + "外直肌麻痺：" + s1 + "眼無法外展、複視（外旋神經）";
    case "gaze": return S + "水平注視麻痺：兩眼都無法看向" + s1 + "邊（外旋神經核、PPRF）";
    case "cn7": return S + "周邊型顏面麻痺：上下半臉都無力（顏面神經）";
    case "ino": return S + "核間性眼肌麻痺：看向" + O + "邊時" + s1 + "眼無法內收，輻輳正常（內側縱束）";
    case "cn3": return S + "動眼神經麻痺：眼睛向下向外、眼瞼下垂、瞳孔放大（動眼神經）";
    case "cn4": return S + "上斜肌無力：往下往內看時複視（滑車神經）";
    case "cn5": return S + "臉部感覺喪失、咀嚼肌無力（三叉神經根）";
    case "cn5m": return S + "咀嚼肌無力，張口時下顎偏向" + s1 + "側（三叉神經運動核）";
    case "cn8": return S + "聽力下降、眩暈（前庭耳蝸神經）";
    case "cn11": return S + "胸鎖乳突肌與斜方肌無力（副神經）";
    case "red": return S + "意向性震顫、協調不良（紅核與小腦視丘纖維）";
    case "upgaze": return "向上注視麻痺，輻輳正常（頂蓋前區、後連合）";
    case "taste": return S + "味覺減弱（孤束核）";
    case "vsct": return S + "下肢往小腦的回饋受影響（前脊髓小腦徑，臨床上不明顯）";
  }
  return "";
}
