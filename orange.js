/* 🍊 오렌지 실습실 — 오렌지(Orange) 캔버스를 브라우저에서 직접 조작하는 시뮬레이터
   위젯 배치 · 연결 · 설정 · 실행을 학생이 직접 하고, 계산은 engine.js(DSEngine)가 담당합니다. */
(function () {
  "use strict";
  const E = window.DSEngine;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const f3 = v => (v === null || v === undefined || isNaN(v)) ? "?" : (Math.abs(v) >= 1000 ? v.toFixed(1) : (+v).toFixed(3));
  const fv = v => v === null ? "?" : (typeof v === "number" ? (Number.isInteger(v) ? v : +v.toFixed(3)) : v);
  const STORE = "dso-orange-lab-v1";
  const SEED = 42;

  // 예제 데이터 (file:// 로 열었을 때 사용)
  let SAMPLE_TEXT = "grade,stress,sleep,exercise,electronic_device_usage\n";
  const CAT = { data: "var(--o-data)", transform: "var(--o-transform)", visual: "var(--o-visual)", model: "var(--o-model)", eval: "var(--o-eval)" };
  const CAT_NAME = { data: "Data", transform: "Transform", visual: "Visualize", model: "Model", eval: "Evaluate" };
  const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#b5476e", "#7a4fb0", "#c99a00"];
  const KO = { file: "파일 불러오기", table: "데이터 표 보기", featstats: "속성별 통계", correlations: "상관계수", impute: "결측치 처리", selrows: "조건으로 행 고르기", preprocess: "정규화 등 전처리", selcols: "feature/target 지정", sampler: "훈련/테스트 분할", scatter: "산점도", boxplot: "상자 그림", distributions: "분포(히스토그램)", linreg: "선형 회귀", logreg: "로지스틱 회귀", rf: "랜덤 포레스트", knn: "k-최근접 이웃", svm: "서포트 벡터 머신", nb: "나이브 베이즈", testscore: "모델 평가", predictions: "예측 결과", confusion: "혼동 행렬" };

  /* ===================== 데이터 도우미 ===================== */
  const roleOf = (ds, name) => (ds.roles && ds.roles[name]) || "feature";
  const featNames = ds => ds.cols.filter(c => roleOf(ds, c.name) === "feature").map(c => c.name);
  const targetName = ds => { const c = ds.cols.find(c => roleOf(ds, c.name) === "target"); return c ? c.name : null; };
  const withRows = (ds, rows) => ({ cols: ds.cols, rows, roles: ds.roles });
  const colIdx = (ds, name) => ds.cols.findIndex(c => c.name === name);
  const numCols = ds => ds.cols.filter(c => c.type === "num").map(c => c.name);
  function taskOf(ds) { const t = targetName(ds); if (!t) return null; return ds.cols[colIdx(ds, t)].type === "num" ? "regression" : "classification"; }

  const parsedCache = {};
  function parsed(text) { if (!parsedCache[text]) parsedCache[text] = E.parseCSV(text); return parsedCache[text]; }

  /* ===================== 위젯 정의 ===================== */
  const DATA = "data", LEARNER = "learner", MODEL = "model", EVAL = "eval";
  const W = {};
  function def(type, o) { W[type] = Object.assign({ type, inputs: [], outputs: [], defaults: () => ({}) }, o); }
  const modelIO = { inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Learner", t: LEARNER }, { n: "Model", t: MODEL }] };

  def("file", { name: "File", cat: "data", icon: "📄", outputs: [{ n: "Data", t: DATA }], defaults: () => ({ source: null, types: {}, roles: {} }) });
  def("table", { name: "Data Table", cat: "data", icon: "📋", inputs: [{ n: "Data", t: DATA }] });
  def("featstats", { name: "Feature Statistics", cat: "data", icon: "📊", inputs: [{ n: "Data", t: DATA }] });
  def("correlations", { name: "Correlations", cat: "data", icon: "🔗", inputs: [{ n: "Data", t: DATA }], defaults: () => ({ filter: "" }) });
  def("impute", { name: "Impute", cat: "transform", icon: "🩹", inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Data", t: DATA }], defaults: () => ({ method: "mean" }) });
  def("selrows", { name: "Select Rows", cat: "transform", icon: "🔎", inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Matching Data", t: DATA }, { n: "Unmatched Data", t: DATA }], defaults: () => ({ conds: [] }) });
  def("preprocess", { name: "Preprocess", cat: "transform", icon: "⚙️", inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Preprocessed Data", t: DATA }], defaults: () => ({ norm: false, method: "minmax", imp: false, imethod: "mean" }) });
  def("selcols", { name: "Select Columns", cat: "transform", icon: "🗂️", inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Data", t: DATA }], defaults: () => ({ roles: {} }) });
  def("sampler", { name: "Data Sampler", cat: "transform", icon: "✂️", inputs: [{ n: "Data", t: DATA }], outputs: [{ n: "Data Sample", t: DATA }, { n: "Remaining Data", t: DATA }], defaults: () => ({ prop: 70, replicable: true, stratify: true, seed: SEED }) });
  def("scatter", { name: "Scatter Plot", cat: "visual", icon: "⁘", inputs: [{ n: "Data", t: DATA }], defaults: () => ({ x: "", y: "", color: "" }) });
  def("boxplot", { name: "Box Plot", cat: "visual", icon: "⊟", inputs: [{ n: "Data", t: DATA }], defaults: () => ({ v: "" }) });
  def("distributions", { name: "Distributions", cat: "visual", icon: "📶", inputs: [{ n: "Data", t: DATA }], defaults: () => ({ v: "", bins: 10 }) });
  def("linreg", Object.assign({ name: "Linear Regression", cat: "model", icon: "📈", mid: "lr", only: "regression" }, modelIO));
  def("logreg", Object.assign({ name: "Logistic Regression", cat: "model", icon: "∫", mid: "logreg", only: "classification" }, modelIO));
  def("rf", Object.assign({ name: "Random Forest", cat: "model", icon: "🌲", mid: "rf" }, modelIO));
  def("knn", Object.assign({ name: "kNN", cat: "model", icon: "🎯", mid: "knn", defaults: () => ({ k: 5 }) }, modelIO));
  def("svm", Object.assign({ name: "SVM", cat: "model", icon: "📐", mid: "svm", only: "regression" }, modelIO));
  def("nb", Object.assign({ name: "Naive Bayes", cat: "model", icon: "🅽", mid: "nb", only: "classification" }, modelIO));
  def("testscore", { name: "Test and Score", cat: "eval", icon: "🏁", inputs: [{ n: "Data", t: DATA }, { n: "Test Data", t: DATA }, { n: "Learner", t: LEARNER, multi: true }], outputs: [{ n: "Evaluation Results", t: EVAL }], defaults: () => ({ mode: "cv", folds: 5 }) });
  def("predictions", { name: "Predictions", cat: "eval", icon: "🔮", inputs: [{ n: "Data", t: DATA }, { n: "Predictors", t: MODEL, multi: true }] });
  def("confusion", { name: "Confusion Matrix", cat: "eval", icon: "▦", inputs: [{ n: "Evaluation Results", t: EVAL }], defaults: () => ({ m: 0 }) });
  const TOOL_ORDER = { data: ["file", "table", "featstats", "correlations"], transform: ["impute", "selrows", "preprocess", "selcols", "sampler"], visual: ["scatter", "boxplot", "distributions"], model: ["linreg", "logreg", "rf", "knn", "svm", "nb"], eval: ["testscore", "predictions", "confusion"] };

  /* ===================== 상태 ===================== */
  let G = { nodes: [], links: [], seq: 1 };
  let PROG = { quiz: {}, seen: {} };       // 퀴즈 정답 여부, 위젯 창을 열어 본 기록
  const RES = {};                         // 노드별 실행 결과
  const UI = { sel: null, wins: {}, z: 40 };

  function save() { try { localStorage.setItem(STORE, JSON.stringify({ G, PROG }, (k, v) => (k[0] === "_" ? undefined : v))); } catch (e) { /* 용량 초과 무시 */ } }
  function load() { try { const s = JSON.parse(localStorage.getItem(STORE) || "null"); if (s && s.G) { G = s.G; PROG = Object.assign({ quiz: {}, seen: {} }, s.PROG || {}); } } catch (e) { /* 무시 */ } }
  const nodeById = id => G.nodes.find(n => n.id === id);

  /* ===================== 실행 엔진 ===================== */
  function gather(node) {
    const inp = {};
    G.links.filter(l => l.to === node.id).forEach(l => l.ch.forEach(([o, i]) => {
      const r = RES[l.from]; const v = r && r.out ? r.out[o] : undefined;
      const spec = W[node.type].inputs.find(x => x.n === i);
      if (spec && spec.multi) { (inp[i] = inp[i] || []); if (v) inp[i].push({ v, from: l.from }); }
      else inp[i] = v;
    }));
    return inp;
  }
  function topo() {
    const order = [], seen = new Set();
    const visit = id => { if (seen.has(id)) return; seen.add(id); G.links.filter(l => l.to === id).forEach(l => visit(l.from)); order.push(nodeById(id)); };
    G.nodes.forEach(n => visit(n.id));
    return order.filter(Boolean);
  }
  function recompute() {
    topo().forEach(node => {
      const inp = gather(node);
      let r;
      try { r = RUN[node.type](node, inp) || {}; } catch (e) { r = { err: "실행 오류: " + e.message }; }
      r.inp = inp; r.out = r.out || {};
      RES[node.id] = r;
    });
    Object.keys(RES).forEach(id => { if (!nodeById(+id)) delete RES[id]; });
    renderCanvas();
    Object.keys(UI.wins).forEach(id => renderWin(+id));
    renderMissions();
    save();
  }

  const need = (inp, k) => inp[k] ? null : "입력 신호(" + k + ")가 연결되지 않았어요.";

  const RUN = {
    file(n) {
      const s = n.settings;
      if (!s.source) return { warn: "더블클릭해서 파일을 열어 주세요." };
      const text = s.source === "sample" ? SAMPLE_TEXT : s.csvText;
      const p = parsed(text);
      const types = Object.assign(E.inferTypes(p), s.types || {});
      const roles = s.roles || {}, skip = {};
      p.header.forEach(h => { if (roles[h] === "skip") skip[h] = true; });
      const ds = E.buildDataset(p, types, skip);
      ds.roles = {}; let tgt = false;
      ds.cols.forEach(c => { let r = roles[c.name] || "feature"; if (r === "target") { if (tgt) r = "feature"; tgt = true; } ds.roles[c.name] = r; });
      return { out: { Data: ds }, sum: ds.rows.length + "행" };
    },
    table(n, inp) { return inp.Data ? { sum: inp.Data.rows.length + "행" } : { warn: need(inp, "Data") }; },
    featstats(n, inp) { return inp.Data ? {} : { warn: need(inp, "Data") }; },
    correlations(n, inp) { return inp.Data ? {} : { warn: need(inp, "Data") }; },
    scatter(n, inp) { return inp.Data ? {} : { warn: need(inp, "Data") }; },
    boxplot(n, inp) { return inp.Data ? {} : { warn: need(inp, "Data") }; },
    distributions(n, inp) { return inp.Data ? {} : { warn: need(inp, "Data") }; },
    impute(n, inp) {
      const d = inp.Data; if (!d) return { warn: need(inp, "Data") };
      const o = E.impute(d, n.settings.method); o.roles = d.roles;
      return { out: { Data: o }, sum: d.rows.length + " → " + o.rows.length + "행" };
    },
    selrows(n, inp) {
      const d = inp.Data; if (!d) return { warn: need(inp, "Data") };
      const conds = n.settings.conds.map(c => Object.assign({}, c, { k: colIdx(d, c.col) })).filter(c => c.k >= 0);
      const test = r => conds.every(c => {
        const v = r[c.k]; if (v === null) return false;
        const a = parseFloat(c.a), b = parseFloat(c.b);
        switch (c.op) {
          case "between": return v >= a && v <= b;
          case "below": return v < a;
          case "above": return v > a;
          case "equals": return v === a;
          case "is": return String(v) === String(c.a);
          case "isnot": return String(v) !== String(c.a);
          default: return true;
        }
      });
      const m = [], u = [];
      d.rows.forEach(r => (test(r) ? m : u).push(r));
      return { out: { "Matching Data": withRows(d, m), "Unmatched Data": withRows(d, u) }, sum: d.rows.length + " → " + m.length + "행", nConds: conds.length };
    },
    preprocess(n, inp) {
      let d = inp.Data; if (!d) return { warn: need(inp, "Data") };
      const s = n.settings, roles = d.roles;
      if (s.imp) { d = E.impute(d, s.imethod); d.roles = roles; }
      if (s.norm) { const ex = d.cols.filter(c => roleOf(d, c.name) !== "feature").map(c => c.name); d = E.normalize(d, s.method, ex).ds; d.roles = roles; }
      const r = { out: { "Preprocessed Data": d }, sum: d.rows.length + "행" };
      if (!s.norm && !s.imp) r.warn = "전처리 방법을 하나도 고르지 않아 데이터가 그대로 나가요.";
      return r;
    },
    selcols(n, inp) {
      const d = inp.Data; if (!d) return { warn: need(inp, "Data") };
      const roles = {};
      d.cols.forEach(c => { roles[c.name] = n.settings.roles[c.name] || roleOf(d, c.name); });
      const keep = d.cols.map((c, k) => [c, k]).filter(([c]) => roles[c.name] !== "ignore");
      const ds = { cols: keep.map(([c]) => c), rows: d.rows.map(r => keep.map(([, k]) => r[k])), roles: {} };
      keep.forEach(([c]) => ds.roles[c.name] = roles[c.name]);
      const r = { out: { Data: ds }, sum: featNames(ds).length + "개 feature" };
      if (!targetName(ds)) r.warn = "target 변수가 아직 없어요.";
      return r;
    },
    sampler(n, inp) {
      const d = inp.Data; if (!d) return { warn: need(inp, "Data") };
      if (d.rows.length < 4) return { err: "데이터가 너무 적어서 나눌 수 없어요." };
      const s = n.settings, t = targetName(d);
      let y = null;
      if (s.stratify && t && d.cols[colIdx(d, t)].type === "cat") { const k = colIdx(d, t), vals = d.cols[k].values; y = d.rows.map(r => vals.indexOf(r[k])); }
      const sp = E.splitIdx(d.rows.length, s.prop / 100, s.replicable ? SEED : s.seed, y, s.stratify);
      return { out: { "Data Sample": withRows(d, sp.train.map(i => d.rows[i])), "Remaining Data": withRows(d, sp.test.map(i => d.rows[i])) }, sum: sp.train.length + " | " + sp.test.length };
    },
    testscore(n, inp) {
      const d = inp.Data, s = n.settings, ls = inp.Learner || [];
      if (!d) return { warn: need(inp, "Data") };
      const t = targetName(d);
      if (!t) return { err: "Data에 target 변수가 없어요. Select Columns에서 target을 지정하세요." };
      if (!featNames(d).length) return { err: "feature가 하나도 없어요." };
      if (!ls.length) return { warn: "모델 위젯의 Learner를 연결해 주세요." };
      if (s.mode === "test" && !inp["Test Data"]) return { err: "Test on test data를 고르면 Test Data 입력이 필요해요." };
      const task = taskOf(d), D = E.design(d, featNames(d), t), K = D.classes ? D.classes.length : 0;
      if (D.X.length < 5) return { err: "학습할 데이터가 너무 적어요." };
      let D2 = null;
      if (s.mode === "test") D2 = E.design(inp["Test Data"], featNames(d), t);
      const rows = ls.map(({ v: L }) => {
        if (L.only && L.only !== task) return { name: L.name, err: L.only === "regression" ? "수치형 target(회귀)에서만 쓸 수 있어요" : "범주형 target(분류)에서만 쓸 수 있어요" };
        let m;
        if (s.mode === "cv") m = E.crossValidate(L.mid, task, K, D.X, D.y, s.folds, SEED, L.opts);
        else {
          const Xte = s.mode === "train" ? D.X : D2.X, yte = s.mode === "train" ? D.y : D2.y;
          const fp = E.fitPredict(L.mid, task, K, SEED, D.X, D.y, Xte, L.opts);
          m = task === "regression" ? E.regMetrics(yte, fp.preds) : E.clsMetrics(yte, fp.preds, K);
        }
        return { name: L.name, m };
      });
      return { out: { "Evaluation Results": { task, classes: D.classes, rows, target: t } }, rows, task, nTrain: D.X.length };
    },
    predictions(n, inp) {
      const d = inp.Data, ps = inp.Predictors || [];
      if (!d) return { warn: need(inp, "Data") };
      if (!ps.length) return { warn: "모델 위젯의 Model 출력을 Predictors로 연결해 주세요." };
      const cols = ps.map(({ v: M }) => {
        if (M.err) return { name: M.name, err: M.err };
        const t = targetName(d);
        if (!t || t !== M.target) return { name: M.name, err: "Data의 target이 모델과 달라요." };
        const D = E.design(d, M.features, t);
        const pr = D.X.map(x => M.model.predict(x));
        const met = M.task === "regression" ? E.regMetrics(D.y, pr) : E.clsMetrics(D.y, pr, M.classes.length);
        return { name: M.name, pr, y: D.y, met, task: M.task, classes: M.classes };
      });
      return { cols, sum: d.rows.length + "행 예측" };
    },
    confusion(n, inp) {
      const e = inp["Evaluation Results"];
      if (!e) return { warn: need(inp, "Evaluation Results") };
      if (e.task !== "classification") return { err: "혼동 행렬은 분류(범주형 target)에서만 볼 수 있어요." };
      return {};
    }
  };
  ["linreg", "logreg", "rf", "knn", "svm", "nb"].forEach(type => {
    RUN[type] = function (n, inp) {
      const w = W[type];
      const L = { mid: w.mid, name: n.title, only: w.only, opts: type === "knn" ? { k: n.settings.k } : undefined };
      const out = { Learner: L };
      const d = inp.Data;
      if (!d) return { out, sum: "Learner" };
      const t = targetName(d);
      if (!t) return { out, warn: "Data에 target이 없어 Model은 만들지 못했어요." };
      const task = taskOf(d);
      if (w.only && w.only !== task) {
        out.Model = { name: n.title, err: "target 유형과 맞지 않는 모델" };
        return { out, err: w.only === "regression" ? "이 모델은 수치형 target(회귀)만 학습할 수 있어요." : "이 모델은 범주형 target(분류)만 학습할 수 있어요." };
      }
      const D = E.design(d, featNames(d), t);
      if (D.X.length < 3) return { out, err: "학습할 데이터가 너무 적어요." };
      const model = E.makeModel(w.mid, task, D.classes ? D.classes.length : 0, SEED, L.opts).fit(D.X, D.y);
      out.Model = { name: n.title, model, task, classes: D.classes, features: featNames(d), target: t };
      return { out, sum: D.X.length + "행 학습" };
    };
  });

  /* ===================== 캔버스 그리기 ===================== */
  const canvas = $("#canvas"), svg = $("#links"), wrap = $("#wrap");
  function portPos(n, side) { return { x: n.x + (side === "out" ? 41 : -41), y: n.y }; }
  function curve(a, b) { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }

  function renderCanvas() {
    $$(".node", canvas).forEach(e => e.remove());
    $("#emptyHint").style.display = G.nodes.length ? "none" : "block";
    G.nodes.forEach(n => {
      const w = W[n.type], r = RES[n.id] || {};
      const el = document.createElement("div");
      el.className = "node" + (UI.sel && UI.sel.k === "n" && UI.sel.id === n.id ? " sel" : "");
      el.dataset.id = n.id;
      el.style.left = n.x + "px"; el.style.top = n.y + "px";
      const badge = r.err ? `<span class="badge error" title="${esc(r.err)}">!</span>` : r.warn ? `<span class="badge warn" title="${esc(r.warn)}">!</span>` : "";
      el.innerHTML = `<div class="circle" style="background:${CAT[w.cat]}" title="${esc(w.name)} — ${esc(KO[n.type])}\n더블클릭하면 설정 창이 열려요">${w.icon}
          ${w.inputs.length ? '<span class="port in"></span>' : ""}${w.outputs.length ? '<span class="port out" title="여기를 끌어서 다른 위젯과 연결"></span>' : ""}${badge}</div>
        <div class="title">${esc(n.title)}</div><div class="sum">${esc(r.sum || "")}</div>`;
      canvas.appendChild(el);
    });
    drawLinks();
    const s = UI.sel;
    $("#tOpen").disabled = !(s && s.k === "n");
    $("#tLink").disabled = !(s && s.k === "l");
    $("#tDel").disabled = !s;
  }
  function drawLinks(temp) {
    let h = "";
    G.links.forEach(l => {
      const a = nodeById(l.from), b = nodeById(l.to); if (!a || !b) return;
      const p1 = portPos(a, "out"), p2 = portPos(b, "in"), d = curve(p1, p2);
      const r = RES[l.from], has = l.ch.some(([o]) => r && r.out && r.out[o]);
      const sel = UI.sel && UI.sel.k === "l" && UI.sel.id === l.id;
      const label = l.ch.map(([o, i]) => o === i ? o : o + " → " + i).join(", ");
      h += `<path class="ln${has ? "" : " empty"}${sel ? " sel" : ""}" d="${d}"/><path class="hit" data-link="${l.id}" d="${d}"/>`;
      if (sel || G.links.length <= 10) h += `<text x="${(p1.x + p2.x) / 2}" y="${(p1.y + p2.y) / 2 - 7}" text-anchor="middle">${esc(label)}</text>`;
    });
    if (temp) h += `<path class="temp" d="${curve(temp.a, temp.b)}"/>`;
    svg.innerHTML = h;
  }

  /* ===================== 위젯 추가 · 연결 ===================== */
  function addNode(type, x, y) {
    const w = W[type];
    if (x === undefined) {
      const last = G.nodes[G.nodes.length - 1];
      x = last ? last.x + 150 : wrap.scrollLeft + 120; y = last ? last.y : wrap.scrollTop + 160;
      if (x > wrap.scrollLeft + wrap.clientWidth - 80) { x = wrap.scrollLeft + 120; y += 140; }
    }
    const same = G.nodes.filter(n => n.type === type).length;
    const n = { id: G.seq++, type, x: Math.max(60, Math.min(1440, x)), y: Math.max(50, Math.min(950, y)), title: w.name + (same ? " (" + (same + 1) + ")" : ""), settings: w.defaults() };
    G.nodes.push(n);
    UI.sel = { k: "n", id: n.id };
    recompute();
    toast(`${w.name} 위젯을 놓았어요. 더블클릭하면 설정 창이 열려요.`);
    return n;
  }
  function reachable(from, to) { // to 에서 from 으로 가는 경로가 있으면 사이클
    const st = [to], seen = new Set();
    while (st.length) { const c = st.pop(); if (c === from) return true; if (seen.has(c)) continue; seen.add(c); G.links.filter(l => l.from === c).forEach(l => st.push(l.to)); }
    return false;
  }
  function candidates(a, b) {
    const out = [];
    W[a.type].outputs.forEach(o => W[b.type].inputs.forEach(i => { if (o.t === i.t) out.push([o.n, i.n]); }));
    return out;
  }
  function connect(aId, bId) {
    const a = nodeById(aId), b = nodeById(bId);
    if (!a || !b || a === b) return;
    const cands = candidates(a, b);
    if (!cands.length) {
      const outs = W[a.type].outputs.map(o => o.n).join(", ") || "없음", ins = W[b.type].inputs.map(o => o.n).join(", ") || "없음";
      toast(`연결할 수 없어요: ${a.title}의 출력(${outs})과 ${b.title}의 입력(${ins})이 맞지 않아요.`, 3600); return;
    }
    if (reachable(aId, bId)) { toast("되돌아가는 연결(순환)은 만들 수 없어요."); return; }
    let link = G.links.find(l => l.from === aId && l.to === bId);
    // 기본 채널 고르기
    let pick = cands[0];
    const freeIn = c => { const spec = W[b.type].inputs.find(x => x.n === c[1]); return spec.multi || !G.links.some(l => l.to === bId && l.ch.some(([, i]) => i === c[1])); };
    if (b.type === "predictions") pick = cands.find(c => c[0] === "Remaining Data") || cands.find(c => c[1] === "Predictors") || pick;
    else pick = cands.find(freeIn) || pick;
    const outsSameType = W[a.type].outputs.filter(o => o.t === DATA).length > 1 && cands.length > 1;
    if (!link) { link = { id: G.seq++, from: aId, to: bId, ch: [] }; G.links.push(link); }
    if (!link.ch.some(c => c[0] === pick[0] && c[1] === pick[1])) setChannel(link, pick, true);
    UI.sel = { k: "l", id: link.id };
    recompute();
    if (outsSameType || cands.length > 1) editLink(link.id, true);
    else toast(`연결 완료: ${pick[0]} → ${pick[1]}`);
  }
  function setChannel(link, c, on) {
    if (on) {
      const spec = W[nodeById(link.to).type].inputs.find(x => x.n === c[1]);
      if (!spec.multi) G.links.forEach(l => { if (l.to === link.to) l.ch = l.ch.filter(x => x[1] !== c[1]); });
      link.ch.push(c);
    } else link.ch = link.ch.filter(x => !(x[0] === c[0] && x[1] === c[1]));
    G.links = G.links.filter(l => l.ch.length || l === link);
  }
  function editLink(id, fresh) {
    const link = G.links.find(l => l.id === id); if (!link) return;
    const a = nodeById(link.from), b = nodeById(link.to), cands = candidates(a, b);
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal"><h3>🔗 연결 편집 (Edit Links)</h3>
      <div class="info">${esc(a.title)}의 <b>어떤 출력</b>을 ${esc(b.title)}의 <b>어떤 입력</b>으로 보낼지 고르세요.${a.type === "sampler" ? "<br>· Data Sample = 훈련용(70%), Remaining Data = 테스트용(30%)" : a.type === "selrows" ? "<br>· Matching Data = 조건에 맞는 행, Unmatched Data = 맞지 않는 행" : ""}</div>
      ${cands.map((c, k) => `<label><input type="checkbox" data-k="${k}" ${link.ch.some(x => x[0] === c[0] && x[1] === c[1]) ? "checked" : ""}> <b>${esc(c[0])}</b> → ${esc(c[1])}</label>`).join("")}
      <div class="acts"><button class="obtn pri" data-ok>확인</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); G.links = G.links.filter(l => l.ch.length); recompute(); };
    $$("input", bg).forEach(i => i.onchange = () => setChannel(link, cands[+i.dataset.k], i.checked));
    $("[data-ok]", bg).onclick = close;
    bg.onclick = e => { if (e.target === bg) close(); };
  }
  function deleteSel() {
    const s = UI.sel; if (!s) return;
    if (s.k === "n") { G.nodes = G.nodes.filter(n => n.id !== s.id); G.links = G.links.filter(l => l.from !== s.id && l.to !== s.id); closeWin(s.id); }
    else G.links = G.links.filter(l => l.id !== s.id);
    UI.sel = null; recompute();
  }

  /* ===================== 포인터 조작 ===================== */
  function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let drag = null;
  canvas.addEventListener("pointerdown", e => {
    const nodeEl = e.target.closest(".node");
    const hit = e.target.closest("[data-link]");
    if (hit) { UI.sel = { k: "l", id: +hit.dataset.link }; renderCanvas(); return; }
    if (!nodeEl) { if (UI.sel) { UI.sel = null; renderCanvas(); } return; }
    const n = nodeById(+nodeEl.dataset.id);
    e.preventDefault();
    if (e.target.classList.contains("out")) drag = { kind: "link", n, a: portPos(n, "out") };
    else drag = { kind: "move", n, start: canvasPoint(e), ox: n.x, oy: n.y, moved: false, el: nodeEl };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = canvasPoint(e);
    if (drag.kind === "move") {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.n.x = Math.max(55, Math.min(1445, drag.ox + dx)); drag.n.y = Math.max(40, Math.min(960, drag.oy + dy));
      drag.el.style.left = drag.n.x + "px"; drag.el.style.top = drag.n.y + "px";
      drawLinks();
    } else {
      drawLinks({ a: drag.a, b: p });
      $$(".node.drop-ok").forEach(x => x.classList.remove("drop-ok"));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const tn = t && t.closest(".node");
      if (tn && +tn.dataset.id !== drag.n.id) tn.classList.add("drop-ok");
    }
  });
  canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === "move") {
      if (!d.moved) { UI.sel = { k: "n", id: d.n.id }; renderCanvas(); }
      else { save(); }
      const now = Date.now();
      if (!d.moved && UI.lastTap && UI.lastTap.id === d.n.id && now - UI.lastTap.t < 380) { openWin(d.n.id); UI.lastTap = null; }
      else if (!d.moved) UI.lastTap = { id: d.n.id, t: now };
    } else {
      $$(".node.drop-ok").forEach(x => x.classList.remove("drop-ok"));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const tn = t && t.closest(".node");
      if (tn) connect(d.n.id, +tn.dataset.id); else drawLinks();
    }
  });
  canvas.addEventListener("dblclick", e => {
    const hit = e.target.closest("[data-link]");
    if (hit) editLink(+hit.dataset.link);
  });
  document.addEventListener("keydown", e => {
    if ((e.key === "Delete" || e.key === "Backspace") && UI.sel && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); deleteSel(); }
  });
  $("#tOpen").onclick = () => UI.sel && UI.sel.k === "n" && openWin(UI.sel.id);
  $("#tLink").onclick = () => UI.sel && UI.sel.k === "l" && editLink(UI.sel.id);
  $("#tDel").onclick = deleteSel;

  // 위젯 목록
  function renderToolbox() {
    let h = "";
    Object.keys(TOOL_ORDER).forEach(cat => {
      h += `<h4><i style="background:${CAT[cat]}"></i>${CAT_NAME[cat]}</h4>`;
      TOOL_ORDER[cat].forEach(t => { h += `<button class="tool" draggable="true" data-type="${t}" title="${esc(KO[t])}"><span class="ic" style="background:${CAT[cat]}">${W[t].icon}</span>${W[t].name}</button>`; });
    });
    h += `<div class="toolhelp"><b>조작 방법</b><br>· 위젯을 캔버스로 끌어오거나 클릭<br>· 위젯 오른쪽 ○을 끌어 다른 위젯에 놓으면 연결<br>· 위젯 더블클릭 → 설정 창<br>· 선을 더블클릭 → 연결 편집<br>· 선택 후 <span class="kbd">Delete</span> → 삭제</div>`;
    $("#toolbox").innerHTML = h;
    $$(".tool").forEach(b => {
      b.onclick = () => addNode(b.dataset.type);
      b.ondragstart = e => { e.dataTransfer.setData("text/plain", b.dataset.type); };
    });
  }
  canvas.addEventListener("dragover", e => e.preventDefault());
  canvas.addEventListener("drop", e => { e.preventDefault(); const t = e.dataTransfer.getData("text/plain"); if (W[t]) { const p = canvasPoint(e); addNode(t, p.x, p.y); } });

  /* ===================== 위젯 창 ===================== */
  function openWin(id) {
    const n = nodeById(id); if (!n) return;
    PROG.seen[n.type] = true;
    if (UI.wins[id]) { UI.wins[id].style.zIndex = ++UI.z; renderMissions(); return; }
    const w = W[n.type], el = document.createElement("div");
    el.className = "owin";
    const k = Object.keys(UI.wins).length;
    el.style.left = Math.max(8, Math.min(window.innerWidth - 640, 220 + k * 28)) + "px";
    el.style.top = (70 + k * 28) + "px";
    el.style.zIndex = ++UI.z;
    el.innerHTML = `<div class="wh"><span class="ic" style="background:${CAT[w.cat]}">${w.icon}</span><b></b><button title="닫기">✕</button></div><div class="wb"></div><div class="status"></div>`;
    document.body.appendChild(el);
    UI.wins[id] = el;
    $(".wh button", el).onclick = () => closeWin(id);
    el.addEventListener("pointerdown", () => el.style.zIndex = ++UI.z);
    const head = $(".wh", el);
    head.addEventListener("pointerdown", e => {
      if (e.target.tagName === "BUTTON") return;
      const sx = e.clientX, sy = e.clientY, ox = el.offsetLeft, oy = el.offsetTop;
      head.setPointerCapture(e.pointerId);
      head.onpointermove = ev => { el.style.left = Math.max(0, ox + ev.clientX - sx) + "px"; el.style.top = Math.max(0, oy + ev.clientY - sy) + "px"; };
      head.onpointerup = () => { head.onpointermove = null; };
    });
    renderWin(id);
    save(); renderMissions();
  }
  function closeWin(id) { if (UI.wins[id]) { UI.wins[id].remove(); delete UI.wins[id]; } }
  function renderWin(id) {
    const el = UI.wins[id], n = nodeById(id);
    if (!el) return;
    if (!n) { closeWin(id); return; }
    const r = RES[id] || {};
    $(".wh b", el).textContent = n.title + "  ·  " + KO[n.type];
    const body = $(".wb", el), st = body.scrollTop;
    body.innerHTML = VIEW[n.type](n, r) ;
    body.scrollTop = st;
    $(".status", el).innerHTML = r.err ? `<span class="no">⛔ ${esc(r.err)}</span>` : r.warn ? `<span style="color:var(--warn)">⚠ ${esc(r.warn)}</span>` : "✓ 정상 작동 중 — 설정을 바꾸면 연결된 위젯이 자동으로 다시 계산돼요";
    bindGeneric(n, body);
    if (BIND[n.type]) BIND[n.type](n, body, r);
  }
  // data-set="키" 요소: 값이 바뀌면 node.settings[키] 갱신 후 재계산
  function bindGeneric(n, body) {
    $$("[data-set]", body).forEach(inp => {
      inp.onchange = () => {
        const k = inp.dataset.set;
        let v = inp.type === "checkbox" ? inp.checked : inp.value;
        if (inp.dataset.num !== undefined) v = +v;
        n.settings[k] = v;
        recompute();
      };
    });
    const ti = $("[data-title]", body);
    if (ti) ti.onchange = () => { n.title = ti.value.trim() || W[n.type].name; recompute(); };
  }
  const noData = msg => `<div class="note warn">${msg || "입력 데이터가 없어요. 왼쪽 위젯의 출력(○)을 끌어서 이 위젯에 연결하세요."}</div>`;
  const sel = (key, opts, cur, extra) => `<select data-set="${key}" ${extra || ""}>${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(t)}</option>`; }).join("")}</select>`;
  function infoBox(ds) {
    const mi = E.missingInfo(ds), t = targetName(ds), f = featNames(ds), metas = ds.cols.filter(c => roleOf(ds, c.name) === "meta");
    return `<div class="info"><b>${ds.rows.length}</b> instances (${mi.missing ? `결측값 ${mi.missing}개, ${mi.pct.toFixed(1)}%` : "결측값 없음"})<br><b>${f.length}</b> features<br>${t ? `Target: <b>${esc(t)}</b> (${ds.cols[colIdx(ds, t)].type === "num" ? "numeric → 회귀" : "categorical → 분류"})` : "No target variable"}<br>${metas.length ? metas.length + " meta attributes" : "No meta attributes"}</div>`;
  }
  function dataTableHTML(ds, limit) {
    const t = targetName(ds);
    const order = ds.cols.map((c, k) => [c, k]).sort((a, b) => (roleOf(ds, b[0].name) === "target") - (roleOf(ds, a[0].name) === "target"));
    const rows = ds.rows.slice(0, limit || 500);
    return `<div class="tscroll"><table class="ot"><thead><tr><th>#</th>${order.map(([c]) => `<th class="${c.name === t ? "tgt" : ""}">${esc(c.name)}${c.name === t ? " 🎯" : ""}<br><span style="font-weight:400;color:#86847e">${c.type === "num" ? "numeric" : "categorical"} · ${roleOf(ds, c.name)}</span></th>`).join("")}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td class="n">${i + 1}</td>${order.map(([c, k]) => r[k] === null ? `<td class="miss">?</td>` : `<td class="${c.type === "num" ? "n" : ""}${c.name === t ? " tgt" : ""}">${esc(fv(r[k]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- 차트 ---------- */
  function scale(lo, hi, a, b) { const d = (hi - lo) || 1; return v => a + (v - lo) / d * (b - a); }
  function ticks(lo, hi, n) { const out = []; for (let i = 0; i <= n; i++) out.push(lo + (hi - lo) * i / n); return out; }
  function scatterSVG(ds, xn, yn, cn) {
    const xk = colIdx(ds, xn), yk = colIdx(ds, yn), ck = cn ? colIdx(ds, cn) : -1;
    const pts = ds.rows.filter(r => r[xk] !== null && r[yk] !== null);
    if (!pts.length) return noData("그릴 수 있는 점이 없어요.");
    const xs = pts.map(r => r[xk]), ys = pts.map(r => r[yk]);
    const W0 = 560, H0 = 360, L = 52, R = 14, T = 14, B = 44;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sx = scale(x0, x1, L, W0 - R), sy = scale(y0, y1, H0 - B, T);
    let color = () => "#2a78d6", legend = "";
    if (ck >= 0) {
      const c = ds.cols[ck];
      if (c.type === "num") {
        const cv = pts.map(r => r[ck]).filter(v => v !== null), lo = Math.min(...cv), hi = Math.max(...cv);
        color = r => { if (r[ck] === null) return "#bbb"; const t = (r[ck] - lo) / ((hi - lo) || 1); return `hsl(${220 - 220 * t},75%,${50 - 8 * t}%)`; };
        legend = `<div class="legend">${esc(cn)}: <span><i style="background:hsl(220,75%,50%)"></i>낮음 (${fv(lo)})</span><span><i style="background:hsl(110,75%,46%)"></i>중간</span><span><i style="background:hsl(0,75%,42%)"></i>높음 (${fv(hi)})</span></div>`;
      } else {
        color = r => r[ck] === null ? "#bbb" : PALETTE[c.values.indexOf(r[ck]) % PALETTE.length];
        legend = `<div class="legend">${c.values.map((v, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(cn)}=${esc(v)}</span>`).join("")}</div>`;
      }
    }
    let g = "";
    ticks(x0, x1, 5).forEach(v => { g += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H0 - B}" stroke="#eee"/><text x="${sx(v)}" y="${H0 - B + 16}" font-size="11" text-anchor="middle" fill="#666">${fv(+v.toFixed(2))}</text>`; });
    ticks(y0, y1, 5).forEach(v => { g += `<line x1="${L}" x2="${W0 - R}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eee"/><text x="${L - 6}" y="${sy(v) + 4}" font-size="11" text-anchor="end" fill="#666">${fv(+v.toFixed(2))}</text>`; });
    pts.forEach(r => { g += `<circle cx="${sx(r[xk])}" cy="${sy(r[yk])}" r="4.5" fill="${color(r)}" fill-opacity=".8" stroke="#fff" stroke-width=".8"><title>${esc(xn)}=${fv(r[xk])}, ${esc(yn)}=${fv(r[yk])}${ck >= 0 ? ", " + esc(cn) + "=" + fv(r[ck]) : ""}</title></circle>`; });
    g += `<text x="${(L + W0 - R) / 2}" y="${H0 - 6}" font-size="12" text-anchor="middle">${esc(xn)}</text><text transform="translate(13,${(T + H0 - B) / 2}) rotate(-90)" font-size="12" text-anchor="middle">${esc(yn)}</text>`;
    return legend + `<svg class="chart" viewBox="0 0 ${W0} ${H0}">${g}</svg>`;
  }
  function boxSVG(vals, name) {
    const st = E.numStats(vals), v = vals.filter(x => x !== null);
    const lo = Math.min(st.min, st.lowFence), hi = Math.max(st.max, st.highFence);
    const W0 = 560, H0 = 150, sx = scale(lo, hi, 30, W0 - 30), y = 60;
    const inW = v.filter(x => x >= st.lowFence && x <= st.highFence);
    const wl = Math.min(...inW), wh = Math.max(...inW);
    let g = `<line x1="${sx(st.lowFence)}" x2="${sx(st.lowFence)}" y1="20" y2="105" stroke="#c62828" stroke-dasharray="4 3"/><line x1="${sx(st.highFence)}" x2="${sx(st.highFence)}" y1="20" y2="105" stroke="#c62828" stroke-dasharray="4 3"/>`;
    g += `<line x1="${sx(wl)}" x2="${sx(wh)}" y1="${y}" y2="${y}" stroke="#333"/><line x1="${sx(wl)}" x2="${sx(wl)}" y1="${y - 10}" y2="${y + 10}" stroke="#333"/><line x1="${sx(wh)}" x2="${sx(wh)}" y1="${y - 10}" y2="${y + 10}" stroke="#333"/>`;
    g += `<rect x="${sx(st.q1)}" y="${y - 18}" width="${Math.max(1, sx(st.q3) - sx(st.q1))}" height="36" fill="#ffd39f" stroke="#333"/><line x1="${sx(st.median)}" x2="${sx(st.median)}" y1="${y - 18}" y2="${y + 18}" stroke="#333" stroke-width="2.5"/>`;
    g += `<circle cx="${sx(st.mean)}" cy="${y}" r="4" fill="#2a78d6"><title>평균 ${f3(st.mean)}</title></circle>`;
    v.filter(x => x < st.lowFence || x > st.highFence).forEach(x => { g += `<circle cx="${sx(x)}" cy="${y}" r="5" fill="none" stroke="#c62828" stroke-width="2"><title>이상치 ${fv(x)}</title></circle>`; });
    g += `<text x="${sx(st.lowFence)}" y="120" font-size="11" text-anchor="middle" fill="#c62828">Q1−1.5×IQR = ${f3(st.lowFence)}</text><text x="${sx(st.highFence)}" y="136" font-size="11" text-anchor="middle" fill="#c62828">Q3+1.5×IQR = ${f3(st.highFence)}</text>`;
    g += `<text x="${sx(st.q1)}" y="${y - 24}" font-size="10" text-anchor="middle">Q1 ${f3(st.q1)}</text><text x="${sx(st.q3)}" y="${y - 24}" font-size="10" text-anchor="middle">Q3 ${f3(st.q3)}</text>`;
    return { svg: `<svg class="chart" viewBox="0 0 ${W0} ${H0}">${g}</svg>`, st, nOut: v.filter(x => x < st.lowFence || x > st.highFence).length };
  }
  function histSVG(ds, name, bins) {
    const k = colIdx(ds, name), c = ds.cols[k], vals = ds.rows.map(r => r[k]).filter(v => v !== null);
    const W0 = 560, H0 = 280, L = 40, B = 46, T = 12;
    let labels = [], counts = [];
    if (c.type === "cat") { labels = c.values.map(String); counts = labels.map(l => vals.filter(v => String(v) === l).length); }
    else {
      const lo = Math.min(...vals), hi = Math.max(...vals), w = ((hi - lo) || 1) / bins;
      counts = new Array(bins).fill(0);
      vals.forEach(v => counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++);
      labels = counts.map((_, i) => fv(+(lo + i * w).toFixed(2)));
    }
    const mx = Math.max(...counts, 1), bw = (W0 - L - 10) / counts.length, sy = scale(0, mx, H0 - B, T);
    let g = "";
    ticks(0, mx, 4).forEach(v => { g += `<line x1="${L}" x2="${W0 - 10}" y1="${sy(v)}" y2="${sy(v)}" stroke="#eee"/><text x="${L - 5}" y="${sy(v) + 4}" font-size="10" text-anchor="end" fill="#666">${Math.round(v)}</text>`; });
    counts.forEach((v, i) => { g += `<rect x="${L + i * bw + 1}" y="${sy(v)}" width="${bw - 2}" height="${H0 - B - sy(v)}" fill="#ffb7b1" stroke="#c25b52"><title>${labels[i]} : ${v}개</title></rect><text x="${L + i * bw + bw / 2}" y="${H0 - B + 14}" font-size="10" text-anchor="middle" fill="#666">${esc(labels[i])}</text>`; });
    g += `<text x="${(L + W0) / 2}" y="${H0 - 8}" font-size="12" text-anchor="middle">${esc(name)}${c.type === "num" ? " (구간 시작값)" : ""}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W0} ${H0}">${g}</svg>`;
  }

  /* ---------- 위젯별 화면 ---------- */
  const VIEW = {
    file(n, r) {
      const s = n.settings, ds = r.out.Data;
      let h = `<fieldset><legend>Source</legend>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="obtn ${s.source ? "" : "hl"}" data-open-sample>📁 daily_data.csv 열기</button>
          <label class="obtn" style="display:inline-block">💾 내 CSV 파일 열기<input type="file" accept=".csv,.txt,.tsv" data-open-file hidden></label>
          <span class="info">${s.source ? "현재 파일: <b>" + esc(s.source === "sample" ? "daily_data.csv" : (s.fileName || "내 파일")) + "</b>" : ""}</span>
        </div></fieldset>`;
      if (!ds) return h + `<div class="note">📁 버튼을 눌러 교과서 예제 데이터 <b>daily_data.csv</b>를 열어 보세요.</div>`;
      const p = parsed(s.source === "sample" ? SAMPLE_TEXT : s.csvText), inf = E.inferTypes(p);
      const pend = n._pend || { types: Object.assign({}, s.types), roles: Object.assign({}, s.roles) };
      n._pend = pend;
      const dirty = JSON.stringify(pend.types) !== JSON.stringify(s.types) || JSON.stringify(pend.roles) !== JSON.stringify(s.roles);
      h += `<fieldset><legend>Info</legend><div class="info">${p.body.length} instance(s), ${p.header.length} column(s) · 결측값 ${E.missingInfo(ds).missing}개 (${E.missingInfo(ds).pct.toFixed(1)}%)</div></fieldset>`;
      h += `<fieldset><legend>Columns (유형 Type · 역할 Role을 바꾸고 Apply)</legend><table class="ot"><thead><tr><th></th><th>Name</th><th>Type</th><th>Role</th><th>Values</th></tr></thead><tbody>`;
      p.header.forEach((name, i) => {
        const t = pend.types[name] || inf[name], ro = pend.roles[name] || "feature";
        const col = ds.cols.find(c => c.name === name);
        const vals = t === "cat" ? (col && col.values ? col.values.join(", ") : "(Apply 후 표시)") : "";
        h += `<tr><td class="n">${i + 1}</td><td><b>${esc(name)}</b></td>
          <td><select data-ftype="${esc(name)}"><option value="num" ${t === "num" ? "selected" : ""}>N numeric</option><option value="cat" ${t === "cat" ? "selected" : ""}>C categorical</option></select></td>
          <td><select data-frole="${esc(name)}">${["feature", "target", "meta", "skip"].map(x => `<option ${x === ro ? "selected" : ""}>${x}</option>`).join("")}</select></td>
          <td style="white-space:normal;max-width:160px">${esc(vals)}</td></tr>`;
      });
      h += `</tbody></table><div style="display:flex;gap:6px;margin-top:8px;align-items:center"><button class="obtn ${dirty ? "hl" : ""}" data-apply ${dirty ? "" : "disabled"}>Apply</button><button class="obtn" data-reset>Reset</button>${dirty ? '<span class="info" style="color:var(--warn)">바뀐 내용을 적용하려면 Apply를 누르세요</span>' : ""}</div></fieldset>`;
      h += `<div class="note">💡 <b>grade(학년)</b>는 1·2·3 숫자로 적혀 있지만 크기 비교가 의미 없는 <b>범주</b>예요. Type을 <b>categorical</b>로 바꾸고 Apply를 누르세요.</div>`;
      return h;
    },
    table(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      return `<div class="wgrid"><div><fieldset><legend>Info</legend>${infoBox(ds)}</fieldset><div class="info">빨간 <span style="background:#fdecea;color:#c62828;padding:0 4px">?</span> 칸은 결측값(missing)이에요.</div></div><div>${dataTableHTML(ds)}</div></div>`;
    },
    featstats(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      const rows = ds.cols.map((c, k) => {
        const vals = ds.rows.map(x => x[k]);
        if (c.type === "num") { const s = E.numStats(vals); return `<tr><td>N <b>${esc(c.name)}</b></td><td class="n">${f3(s.mean)}</td><td class="n">${fv(s.mode)}</td><td class="n">${f3(s.median)}</td><td class="n">${f3(s.dispersion)}</td><td class="n">${fv(s.min)}</td><td class="n">${fv(s.max)}</td><td class="n ${s.missing ? "miss" : ""}">${s.missing} (${(100 * s.missing / vals.length).toFixed(0)}%)</td></tr>`; }
        const s = E.catStats(vals, c.values); return `<tr><td>C <b>${esc(c.name)}</b></td><td></td><td class="n">${esc(s.mode)}</td><td></td><td></td><td></td><td></td><td class="n ${s.missing ? "miss" : ""}">${s.missing} (${(100 * s.missing / vals.length).toFixed(0)}%)</td></tr>`;
      }).join("");
      return `<div class="tscroll"><table class="ot"><thead><tr><th>Name</th><th>Mean</th><th>Mode</th><th>Median</th><th>Dispersion</th><th>Min.</th><th>Max.</th><th>Missing</th></tr></thead><tbody>${rows}</tbody></table></div><div class="note">Missing 열에서 <b>결측값이 어느 속성에 몇 개</b> 있는지 확인하세요. Min·Max가 지나치게 크거나 작으면 이상치일 수 있어요.</div>`;
    },
    correlations(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      let cs = E.correlations(ds); const fl = n.settings.filter;
      if (fl) cs = cs.filter(c => c.a === fl || c.b === fl);
      return `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">Pearson correlation · Filter ${sel("filter", [["", "(모든 속성)"]].concat(numCols(ds)), fl)}</div>
        <table class="ot"><thead><tr><th style="width:42%">r</th><th>속성 쌍</th></tr></thead><tbody>${cs.map(c => `<tr><td><div style="display:flex;align-items:center;gap:6px"><span style="font-variant-numeric:tabular-nums;width:52px;text-align:right">${isNaN(c.r) ? "?" : c.r.toFixed(3)}</span><span style="display:inline-block;height:10px;width:${Math.abs(c.r || 0) * 120}px;background:${c.r >= 0 ? "#eb6834" : "#2a78d6"};border-radius:3px"></span></div></td><td>${esc(c.a)}, ${esc(c.b)} <span class="info">(${E.corrStrength(c.r)} ${c.r >= 0 ? "양" : "음"}의 상관)</span></td></tr>`).join("")}</tbody></table>
        <div class="note">|r|이 1에 가까울수록 강한 상관관계예요. 주황 막대 = 양(+)의 상관, 파랑 막대 = 음(−)의 상관.</div>`;
    },
    impute(n, r) {
      const d = r.inp.Data; if (!d) return noData();
      const mi = E.missingInfo(d), o = r.out.Data;
      const opt = (v, t) => `<label><input type="radio" name="im${n.id}" data-set="method" value="${v}" ${n.settings.method === v ? "checked" : ""}> ${t}</label>`;
      return `<div class="wgrid"><fieldset><legend>Default Method</legend>${opt("none", "Don't impute")}${opt("mean", "Average/Most frequent")}${opt("drop", "Remove instances with unknown values")}</fieldset>
        <div><div class="info">입력: <b>${d.rows.length}</b>행 (결측값 ${mi.missing}개, 결측값이 있는 행 ${mi.rowsWithMissing}개)<br>출력: <b>${o.rows.length}</b>행 (결측값 ${E.missingInfo(o).missing}개)</div>
        <div class="note">· <b>Average/Most frequent</b>: 빈칸을 평균(수치형)·최빈값(범주형)으로 채움<br>· <b>Remove instances…</b>: 빈칸이 있는 행을 삭제 — 결측치가 적을 때 사용 (교과서: 83 → 81)</div></div></div>`;
    },
    selrows(n, r) {
      const d = r.inp.Data; if (!d) return noData();
      const conds = n.settings.conds;
      const rowsH = conds.map((c, i) => {
        const col = d.cols.find(x => x.name === c.col) || d.cols[0], isNum = col.type === "num";
        const ops = isNum ? [["between", "is between"], ["below", "is below"], ["above", "is greater than"], ["equals", "equals"]] : [["is", "is"], ["isnot", "is not"]];
        const val = isNum ? `<input type="number" step="any" data-c="${i}" data-f="a" value="${esc(c.a ?? "")}">${c.op === "between" ? ` and <input type="number" step="any" data-c="${i}" data-f="b" value="${esc(c.b ?? "")}">` : ""}`
          : `<select data-c="${i}" data-f="a">${col.values.map(v => `<option ${String(v) === String(c.a) ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>`;
        return `<div class="cond"><select data-c="${i}" data-f="col">${d.cols.map(x => `<option ${x.name === col.name ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
          <select data-c="${i}" data-f="op">${ops.map(([v, t]) => `<option value="${v}" ${v === c.op ? "selected" : ""}>${t}</option>`).join("")}</select>${val}
          <button class="obtn" data-del="${i}" title="조건 삭제">✕</button></div>`;
      }).join("");
      const m = r.out["Matching Data"].rows.length;
      return `<fieldset><legend>Conditions (모든 조건을 만족하는 행만 통과)</legend>${rowsH || '<div class="info">아직 조건이 없어요. Add Condition을 누르세요.</div>'}
        <div style="margin-top:6px;display:flex;gap:6px"><button class="obtn ${conds.length ? "" : "hl"}" data-add>Add Condition</button><button class="obtn" data-all>Add All Variables</button><button class="obtn" data-clear>Remove All</button></div></fieldset>
        <div class="info">입력 <b>${d.rows.length}</b>행 → <b>Matching Data ${m}</b>행 · Unmatched Data ${d.rows.length - m}행</div>
        <div class="note">이상치 제거: 각 속성에 <b>is between</b> 조건으로 정상 범위를 입력하세요. 범위는 <b>Box Plot</b>의 Q1−1.5×IQR ~ Q3+1.5×IQR을 참고하고, 시간처럼 음수가 불가능하면 최솟값을 0으로 정해요.<br>교과서 범위: stress 0~36.5 · sleep 2~10 · exercise 0~145.5 · electronic_device_usage 0~8 (81 → 65)</div>`;
    },
    preprocess(n, r) {
      const d = r.inp.Data; if (!d) return noData();
      const s = n.settings, o = r.out["Preprocessed Data"];
      const prev = d.cols.map((c, k) => [c, k]).filter(([c]) => c.type === "num").map(([c, k]) => {
        const a = E.numStats(d.rows.map(x => x[k])), b = E.numStats(o.rows.map(x => x[colIdx(o, c.name)]));
        return `<tr><td>${esc(c.name)}${roleOf(d, c.name) !== "feature" ? ' <span class="info">(' + roleOf(d, c.name) + ", 제외)</span>" : ""}</td><td class="n">${f3(a.min)} ~ ${f3(a.max)}</td><td class="n">${f3(b.min)} ~ ${f3(b.max)}</td></tr>`;
      }).join("");
      return `<div class="wgrid"><div>
          <fieldset><legend><label style="display:inline"><input type="checkbox" data-set="imp" ${s.imp ? "checked" : ""}> Impute Missing Values</label></legend>
            <label><input type="radio" name="pi${n.id}" data-set="imethod" value="mean" ${s.imethod === "mean" ? "checked" : ""}> Replace with average</label>
            <label><input type="radio" name="pi${n.id}" data-set="imethod" value="drop" ${s.imethod === "drop" ? "checked" : ""}> Remove rows with missing values</label></fieldset>
          <fieldset><legend><label style="display:inline"><input type="checkbox" data-set="norm" ${s.norm ? "checked" : ""}> Normalize Features</label></legend>
            <label><input type="radio" name="pn${n.id}" data-set="method" value="zscore" ${s.method === "zscore" ? "checked" : ""}> Standardize to μ=0, σ²=1</label>
            <label><input type="radio" name="pn${n.id}" data-set="method" value="minmax" ${s.method === "minmax" ? "checked" : ""}> Normalize to interval [0, 1]</label></fieldset>
        </div><div><table class="ot"><thead><tr><th>속성</th><th>전처리 전 범위</th><th>후 범위</th></tr></thead><tbody>${prev}</tbody></table>
          <div class="note">운동(0~145분)과 수면(2~10시간)처럼 범위가 크게 다르면 kNN·SVM 같은 거리 기반 모델이 큰 값에 끌려가요. <b>Normalize to interval [0, 1]</b>로 맞추세요.<br>x' = (x − 최솟값) / (최댓값 − 최솟값)</div></div></div>`;
    },
    selcols(n, r) {
      const d = r.inp.Data; if (!d) return noData();
      const roles = {}; d.cols.forEach(c => roles[c.name] = n.settings.roles[c.name] || roleOf(d, c.name));
      const cur = n._pick;
      const box = (role, title) => `<div class="lbox" data-box="${role}"><h5>${title}</h5>${d.cols.filter(c => roles[c.name] === role).map(c => `<div class="it ${cur === c.name ? "on" : ""}" data-item="${esc(c.name)}">${c.type === "num" ? "N" : "C"} ${esc(c.name)}</div>`).join("") || '<div class="info" style="padding:2px 6px">(비어 있음)</div>'}</div>`;
      return `<div class="cols3">${box("ignore", "Ignored Variables (사용 안 함)")}
          <div class="mv"><button class="obtn" data-mv="ignore" title="선택한 속성을 Ignored로">◀</button></div>
          <div>${box("feature", "Features (입력)")}<div style="display:flex;gap:4px;margin:3px 0 8px"><button class="obtn" data-mv="feature">▶ Features로</button></div>
            ${box("target", "Target (예측 대상)")}<div style="display:flex;gap:4px;margin:3px 0 8px"><button class="obtn" data-mv="target">▶ Target으로</button></div>
            ${box("meta", "Metas")}<div style="display:flex;gap:4px;margin:3px 0"><button class="obtn" data-mv="meta">▶ Metas로</button></div></div></div>
        <div class="note">속성을 클릭해 고른 뒤 버튼으로 옮기세요 (더블클릭하면 Features ↔ Ignored).<br>교과서: target = <b>stress</b>, feature = <b>sleep, exercise, electronic_device_usage</b>, grade는 Ignored</div>`;
    },
    sampler(n, r) {
      const d = r.inp.Data; if (!d) return noData();
      const s = n.settings, a = r.out["Data Sample"], b = r.out["Remaining Data"];
      return `<div class="wgrid"><div><fieldset><legend>Sampling Type</legend><label><input type="radio" checked> Fixed proportion of data:</label>
          <input type="range" min="10" max="90" step="5" value="${s.prop}" data-set="prop" data-num style="width:100%"><div style="text-align:right"><b>${s.prop} %</b></div></fieldset>
          <fieldset><legend>Options</legend><label><input type="checkbox" data-set="replicable" ${s.replicable ? "checked" : ""}> Replicable (deterministic) sampling</label><label><input type="checkbox" data-set="stratify" ${s.stratify ? "checked" : ""}> Stratify sample (when possible)</label></fieldset>
          <button class="obtn pri" data-resample>Sample Data</button></div>
        <div><div class="info">입력 <b>${d.rows.length}</b>행<br>➜ <b>Data Sample</b> (훈련용): <b>${a.rows.length}</b>행<br>➜ <b>Remaining Data</b> (테스트용): <b>${b.rows.length}</b>행</div>
          <div class="note">훈련 데이터로 모델을 학습시키고, 학습에 쓰지 않은 테스트 데이터로 성능을 확인해요. 교과서는 <b>7:3</b>(70%)으로 나눠요.<br>Replicable을 켜 두면 누가 해도 같은 결과(46 | 19)가 나와요.</div></div></div>`;
    },
    scatter(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      const nums = numCols(ds), s = n.settings;
      const x = nums.includes(s.x) ? s.x : (nums.includes("exercise") ? "exercise" : nums[0]);
      const y = nums.includes(s.y) ? s.y : (nums.includes("sleep") ? "sleep" : nums[1] || nums[0]);
      const c = s.color === "-" ? "" : (s.color && colIdx(ds, s.color) >= 0 ? s.color : (colIdx(ds, "stress") >= 0 ? "stress" : ""));
      return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px"><label>Axis x ${sel("x", nums, x)}</label><label>Axis y ${sel("y", nums, y)}</label><label>Color ${sel("color", [["-", "(Same color)"]].concat(ds.cols.map(c2 => c2.name)), c || "-")}</label></div>
        ${scatterSVG(ds, x, y, c)}<div class="note">무리에서 동떨어진 점이 <b>이상치</b> 후보예요. 점에 마우스를 올리면 값이 보여요.</div>`;
    },
    boxplot(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      const nums = numCols(ds); if (!nums.length) return noData("수치형 속성이 없어요.");
      const v = nums.includes(n.settings.v) ? n.settings.v : nums[0];
      const b = boxSVG(ds.rows.map(x => x[colIdx(ds, v)]), v), st = b.st;
      return `<div style="display:flex;gap:10px;margin-bottom:6px"><label>Variable ${sel("v", nums, v)}</label></div>${b.svg}
        <table class="ot" style="margin-top:6px"><tbody><tr><th>Q1</th><td class="n">${f3(st.q1)}</td><th>중앙값</th><td class="n">${f3(st.median)}</td><th>Q3</th><td class="n">${f3(st.q3)}</td><th>IQR</th><td class="n">${f3(st.iqr)}</td></tr>
        <tr><th colspan="2">최솟값 경계 Q1−1.5×IQR</th><td class="n" colspan="2">${f3(st.lowFence)}</td><th colspan="2">최댓값 경계 Q3+1.5×IQR</th><td class="n" colspan="2">${f3(st.highFence)}</td></tr></tbody></table>
        <div class="info">빨간 원 = 경계를 벗어난 이상치 <b>${b.nOut}</b>개 · 파란 점 = 평균</div>`;
    },
    distributions(n, r) {
      const ds = r.inp.Data; if (!ds) return noData();
      const v = colIdx(ds, n.settings.v) >= 0 ? n.settings.v : (colIdx(ds, "stress") >= 0 ? "stress" : ds.cols[0].name);
      return `<div style="display:flex;gap:10px;margin-bottom:6px"><label>Variable ${sel("v", ds.cols.map(c => c.name), v)}</label><label>Bin width ${sel("bins", [[5, "5개 구간"], [10, "10개 구간"], [15, "15개 구간"], [20, "20개 구간"]], n.settings.bins, "data-num")}</label></div>${histSVG(ds, v, +n.settings.bins)}
        <div class="note">값이 어디에 많이 몰려 있는지, 한쪽으로 치우쳤는지 확인하세요.</div>`;
    },
    testscore(n, r) {
      const s = n.settings;
      const radio = (v, t) => `<label><input type="radio" name="ts${n.id}" data-set="mode" value="${v}" ${s.mode === v ? "checked" : ""}> ${t}</label>`;
      let res = "";
      if (r.rows) {
        const reg = r.task === "regression", keys = reg ? ["MSE", "RMSE", "MAE", "R2"] : ["CA", "F1", "Precision", "Recall"];
        const ok = r.rows.filter(x => x.m), best = ok.length ? ok.reduce((a, b) => ((reg ? b.m.R2 > a.m.R2 : b.m.CA > a.m.CA) ? b : a)) : null;
        res = `<table class="ot"><thead><tr><th>Model</th>${keys.map(k => `<th>${k === "R2" ? "R²" : k}</th>`).join("")}</tr></thead><tbody>${r.rows.map(x => x.err ? `<tr><td>${esc(x.name)}</td><td colspan="4" class="no">⛔ ${esc(x.err)}</td></tr>` : `<tr class="${x === best ? "best" : ""}"><td>${esc(x.name)}${x === best ? " 🏆" : ""}</td>${keys.map(k => `<td class="n">${f3(x.m[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>
          <div class="note">${reg ? "<b>MSE·RMSE·MAE</b>는 오차라서 <b>작을수록</b>, <b>R²</b>(결정계수)는 1에 <b>가까울수록</b> 좋은 모델이에요." : "<b>CA</b>(정확도)·F1·Precision·Recall 모두 1에 가까울수록 좋아요."}<br>${s.mode === "cv" ? `훈련 데이터 ${r.nTrain}개를 ${s.folds}조각으로 나눠 번갈아 학습·평가한 평균이에요(교차 검증).` : s.mode === "train" ? "학습에 쓴 데이터로 다시 평가해서 실제보다 좋게 나와요(과대평가)." : "학습에 쓰지 않은 Test Data로 평가한 결과예요."}</div>`;
      } else res = r.err ? `<div class="note warn">⛔ ${esc(r.err)}</div>` : noData(r.warn);
      return `<div class="wgrid"><div><fieldset><legend>Sampling</legend>${radio("cv", "Cross validation")}<div style="padding-left:22px">Number of folds: ${sel("folds", [2, 3, 5, 10, 20], s.folds, "data-num")}</div>${radio("train", "Test on train data")}${radio("test", "Test on test data")}</fieldset>
        <div class="info">입력: Data ${r.inp.Data ? r.inp.Data.rows.length + "행" : "없음"} · Test Data ${r.inp["Test Data"] ? r.inp["Test Data"].rows.length + "행" : "없음"} · Learner ${(r.inp.Learner || []).length}개</div></div><div>${res}</div></div>`;
    },
    predictions(n, r) {
      if (!r.cols) return r.err ? `<div class="note warn">⛔ ${esc(r.err)}</div>` : noData(r.warn);
      const ok = r.cols.filter(c => !c.err);
      if (!ok.length) return `<div class="note warn">${r.cols.map(c => esc(c.name) + ": " + esc(c.err)).join("<br>")}</div>`;
      const y = ok[0].y, reg = ok[0].task === "regression", cls = ok[0].classes;
      const show = v => reg ? f3(v) : esc(cls[v.indexOf(Math.max(...v))]);
      const keys = reg ? ["MSE", "RMSE", "MAE", "R2"] : ["CA", "F1", "Precision", "Recall"];
      return `<div class="tscroll"><table class="ot"><thead><tr><th>#</th><th class="tgt">실제값 🎯</th>${ok.map(c => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>
        ${y.map((t, i) => `<tr><td class="n">${i + 1}</td><td class="n tgt">${reg ? f3(t) : esc(cls[t])}</td>${ok.map(c => `<td class="n">${show(c.pr[i])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <h4 style="margin:10px 0 4px">테스트 데이터 성능 (${y.length}개)</h4><table class="ot"><thead><tr><th>Model</th>${keys.map(k => `<th>${k === "R2" ? "R²" : k}</th>`).join("")}</tr></thead><tbody>${ok.map(c => `<tr><td>${esc(c.name)}</td>${keys.map(k => `<td class="n">${f3(c.met[k])}</td>`).join("")}</tr>`).join("")}</tbody></table>
        <div class="note">모델이 한 번도 본 적 없는 <b>Remaining Data</b>(테스트용)로 예측한 결과예요. 실제값과 예측값을 비교해 보세요.</div>`;
    },
    confusion(n, r) {
      const e = r.inp["Evaluation Results"];
      if (!e) return noData(r.warn);
      if (r.err) return `<div class="note warn">⛔ ${esc(r.err)}</div>`;
      const ok = e.rows.filter(x => x.m); if (!ok.length) return noData("평가 결과가 없어요.");
      const m = Math.min(+n.settings.m, ok.length - 1), cm = ok[m].m.cm, cls = e.classes;
      return `<div class="wgrid"><fieldset><legend>Learners</legend>${ok.map((x, i) => `<label><input type="radio" name="cm${n.id}" data-set="m" data-num value="${i}" ${i === m ? "checked" : ""}> ${esc(x.name)}</label>`).join("")}</fieldset>
        <div><table class="ot"><thead><tr><th>실제 \\ 예측</th>${cls.map(c => `<th>${esc(c)}</th>`).join("")}<th>Σ</th></tr></thead><tbody>${cm.map((row, i) => `<tr><th>${esc(cls[i])}</th>${row.map((v, j) => `<td class="n" style="${i === j ? "background:#eef7ee;font-weight:700" : ""}">${v}</td>`).join("")}<td class="n">${row.reduce((a, b) => a + b, 0)}</td></tr>`).join("")}</tbody></table>
        <div class="note">대각선(초록)이 맞힌 개수예요.</div></div></div>`;
    }
  };
  ["linreg", "logreg", "rf", "knn", "svm", "nb"].forEach(type => {
    VIEW[type] = function (n, r) {
      const w = W[type];
      const extra = type === "knn" ? `<fieldset><legend>Neighbors</legend><label>Number of neighbors: <input type="number" min="1" max="30" value="${n.settings.k}" data-set="k" data-num></label><label>Metric: <select disabled><option>Euclidean</option></select></label><label>Weight: <select disabled><option>Uniform</option></select></label></fieldset>`
        : type === "rf" ? `<fieldset><legend>Basic Properties</legend><label>Number of trees: <input type="number" value="30" disabled></label></fieldset>`
        : type === "linreg" ? `<fieldset><legend>Regularization</legend><label><input type="radio" checked disabled> No regularization</label></fieldset>` : "";
      const desc = { linreg: "속성과 target 사이의 관계를 직선(평면)으로 나타내 수치를 예측해요. (회귀 전용)", logreg: "범주(클래스)일 확률을 계산해 분류해요. (분류 전용)", rf: "여러 개의 결정 트리를 만들어 결과를 합쳐요. (회귀·분류)", knn: "가장 가까운 k개 데이터의 값(평균·다수결)으로 예측해요. 거리를 쓰므로 정규화가 중요해요.", svm: "오차 허용 범위 안에서 데이터를 가장 잘 설명하는 경계를 찾아요. (이 시뮬레이터에서는 회귀 전용)", nb: "베이즈 정리로 각 범주일 확률을 계산해요. (분류 전용)" }[type];
      return `<label>Name <input type="text" value="${esc(n.title)}" data-title style="width:220px"></label>${extra}
        <div class="info" style="margin-top:6px">출력 · <b>Learner</b>: ✓ (학습 방법) → Test and Score로<br>출력 · <b>Model</b>: ${r.out.Model && !r.out.Model.err ? "✓ (" + esc(r.sum) + ") → Predictions로" : "— (Data가 연결되면 학습된 모델이 만들어져요)"}</div>
        <div class="note">${desc}</div>`;
    };
  });

  /* ---------- 위젯별 이벤트 ---------- */
  const BIND = {
    file(n, body) {
      const s = n.settings;
      const o = $("[data-open-sample]", body);
      if (o) o.onclick = () => { s.source = "sample"; s.types = {}; s.roles = {}; n._pend = null; recompute(); toast("daily_data.csv를 열었어요 (83행)", 2200, true); };
      const fi = $("[data-open-file]", body);
      if (fi) fi.onchange = () => {
        const file = fi.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = () => { try { E.parseCSV(rd.result); s.source = "user"; s.csvText = rd.result; s.fileName = file.name; s.types = {}; s.roles = {}; n._pend = null; recompute(); } catch (e) { toast("파일을 읽을 수 없어요: " + e.message); } };
        rd.readAsText(file, "utf-8");
      };
      $$("[data-ftype]", body).forEach(x => x.onchange = () => { n._pend.types[x.dataset.ftype] = x.value; renderWin(n.id); });
      $$("[data-frole]", body).forEach(x => x.onchange = () => {
        if (x.value === "target") Object.keys(n._pend.roles).forEach(k => { if (n._pend.roles[k] === "target") n._pend.roles[k] = "feature"; });
        n._pend.roles[x.dataset.frole] = x.value; renderWin(n.id);
      });
      const ap = $("[data-apply]", body);
      if (ap) ap.onclick = () => { s.types = Object.assign({}, n._pend.types); s.roles = Object.assign({}, n._pend.roles); n._pend = null; recompute(); toast("Apply: 변경한 유형·역할을 적용했어요"); };
      const rs = $("[data-reset]", body);
      if (rs) rs.onclick = () => { n._pend = null; s.types = {}; s.roles = {}; recompute(); };
    },
    selrows(n, body, r) {
      const conds = n.settings.conds, d = r.inp.Data;
      const defFor = name => { const c = d.cols.find(x => x.name === name); if (c.type !== "num") return { col: name, op: "is", a: c.values[0] }; const st = E.numStats(d.rows.map(x => x[colIdx(d, name)])); return { col: name, op: "between", a: st.min, b: st.max }; };
      $$("[data-c]", body).forEach(x => x.onchange = () => {
        const c = conds[+x.dataset.c], f = x.dataset.f;
        if (f === "col") Object.assign(c, defFor(x.value)); else c[f] = x.value;
        recompute();
      });
      $$("[data-del]", body).forEach(b => b.onclick = () => { conds.splice(+b.dataset.del, 1); recompute(); });
      const add = $("[data-add]", body);
      if (add) add.onclick = () => { const used = conds.map(c => c.col); const nx = d.cols.find(c => !used.includes(c.name)) || d.cols[0]; conds.push(defFor(nx.name)); recompute(); };
      $("[data-all]", body).onclick = () => { d.cols.forEach(c => { if (c.type === "num" && !conds.some(x => x.col === c.name)) conds.push(defFor(c.name)); }); recompute(); };
      $("[data-clear]", body).onclick = () => { conds.length = 0; recompute(); };
    },
    selcols(n, body, r) {
      const d = r.inp.Data;
      const move = (name, role) => {
        if (role === "target") d.cols.forEach(c => { const cur = n.settings.roles[c.name] || roleOf(d, c.name); if (cur === "target" && c.name !== name) n.settings.roles[c.name] = "feature"; });
        n.settings.roles[name] = role; recompute();
      };
      $$("[data-item]", body).forEach(it => {
        it.onclick = () => { n._pick = it.dataset.item; renderWin(n.id); };
        it.ondblclick = () => { const cur = n.settings.roles[it.dataset.item] || roleOf(d, it.dataset.item); move(it.dataset.item, cur === "ignore" ? "feature" : "ignore"); };
      });
      $$("[data-mv]", body).forEach(b => b.onclick = () => { if (!n._pick) { toast("먼저 옮길 속성을 클릭해서 고르세요."); return; } move(n._pick, b.dataset.mv); });
    },
    sampler(n, body) {
      const rg = $("input[type=range]", body);
      rg.oninput = () => { rg.nextElementSibling.querySelector("b").textContent = rg.value + " %"; };
      $("[data-resample]", body).onclick = () => { if (!n.settings.replicable) n.settings.seed = Math.floor(Math.random() * 1e6) + 1; recompute(); toast(n.settings.replicable ? "Replicable이 켜져 있어 같은 결과로 다시 나눴어요." : "새로운 무작위로 다시 나눴어요."); };
    }
  };

  /* ===================== 미션 ===================== */
  const nodesOf = (...types) => G.nodes.filter(n => types.includes(n.type));
  const res = n => RES[n.id] || {};
  const hasIn = n => !!res(n).inp && !!res(n).inp.Data;
  const tag = t => `<span class="w-tag" style="background:${CAT[W[t].cat]}">${W[t].icon} ${W[t].name}</span>`;
  const fileDs = () => { const f = nodesOf("file").map(n => res(n).out.Data).find(Boolean); return f; };
  const MISSIONS = [
    { stage: "② 데이터 수집", t: "File 위젯으로 데이터 불러오기", how: () => `<ol><li>왼쪽 <b>Data</b>에서 ${tag("file")}을 캔버스로 끌어오세요.</li><li>File 위젯을 <b>더블클릭</b> → <b>📁 daily_data.csv 열기</b></li></ol>`,
      ok: () => !!fileDs() },
    { stage: "② 데이터 수집", t: "grade의 유형을 categorical로 바꾸기", how: () => `<ol><li>File 창의 Columns 표에서 <b>grade</b>의 Type을 <b>C categorical</b>로 바꿉니다.</li><li><span class="kbd">Apply</span>를 누릅니다.</li></ol>학년(1·2·3)은 숫자지만 크기를 비교하는 값이 아니라 종류를 나타내요.`,
      ok: () => { const d = fileDs(); if (!d) return false; const g = d.cols.find(c => c.name === "grade"); return g ? g.type === "cat" : true; } },
    { stage: "② 데이터 수집", t: "Data Table로 데이터 확인하기", how: () => `<ol><li>${tag("table")}을 놓고 File 오른쪽 ○을 끌어 Data Table에 연결하세요.</li><li>Data Table을 더블클릭해 Info를 확인하세요.</li></ol>`,
      ok: () => nodesOf("table").some(hasIn) && PROG.seen.table,
      quiz: { q: "Data Table의 Info에서 확인한 데이터 수(instances)는 몇 개인가요?", ans: () => { const d = fileDs(); return d ? d.rows.length : 83; } } },
    { stage: "③ 데이터 전처리", t: "Feature Statistics로 결측치 확인하기", how: () => `<ol><li>${tag("featstats")}을 File에 연결하고 더블클릭하세요.</li><li><b>Missing</b> 열에서 비어 있는 값의 개수를 확인하세요.</li></ol>`,
      ok: () => nodesOf("featstats").some(hasIn) && PROG.seen.featstats,
      quiz: { q: "결측값(missing)은 모두 몇 개인가요?", ans: () => { const d = fileDs(); return d ? E.missingInfo(d).missing : 2; } } },
    { stage: "③ 데이터 전처리", t: "Impute로 결측치가 있는 행 삭제하기", how: () => `<ol><li><b>Transform</b>의 ${tag("impute")}를 File에 연결하세요.</li><li>Default Method → <b>Remove instances with unknown values</b></li></ol>교과서: 83 → 81`,
      ok: () => nodesOf("impute").some(n => hasIn(n) && n.settings.method === "drop" && res(n).out.Data && E.missingInfo(res(n).out.Data).missing === 0) },
    { stage: "③ 데이터 전처리", t: "Scatter Plot · Box Plot으로 이상치 찾기", how: () => `<ol><li>${tag("scatter")} 또는 ${tag("boxplot")}을 Impute에 연결하고 더블클릭하세요.</li><li>Scatter Plot: x = exercise, y = sleep, Color = stress</li><li>Box Plot: 속성별 Q1, Q3, IQR과 이상치 경계를 확인하세요.</li></ol>`,
      ok: () => (nodesOf("scatter").some(hasIn) && PROG.seen.scatter) || (nodesOf("boxplot").some(hasIn) && PROG.seen.boxplot) },
    { stage: "③ 데이터 전처리", t: "Select Rows로 이상치 제거하기", how: () => `<ol><li>${tag("selrows")}를 Impute에 연결하세요.</li><li><b>Add Condition</b> → 속성마다 <b>is between</b> 범위를 입력하세요.<br>stress 0~36.5 · sleep 2~10 · exercise 0~145.5 · electronic_device_usage 0~8</li></ol>교과서: 81 → 65`,
      ok: () => nodesOf("selrows").some(n => hasIn(n) && n.settings.conds.length > 0 && res(n).out["Matching Data"] && res(n).out["Matching Data"].rows.length < res(n).inp.Data.rows.length) },
    { stage: "③ 데이터 전처리", t: "Preprocess로 0~1 정규화하기", how: () => `<ol><li>${tag("preprocess")}를 Select Rows에 연결하세요. 연결 편집 창에서 <b>Matching Data → Data</b>를 고르세요.</li><li><b>Normalize Features</b>를 체크 → <b>Normalize to interval [0, 1]</b></li></ol>`,
      ok: () => nodesOf("preprocess").some(n => hasIn(n) && n.settings.norm && n.settings.method === "minmax") },
    { stage: "④ 시각화와 분석", t: "Distributions · Correlations로 분석하기", how: () => `<ol><li>${tag("distributions")}와 ${tag("correlations")}를 Preprocess에 연결하고 각각 열어 보세요.</li><li>Correlations의 Filter에서 <b>stress</b>를 골라 보세요.</li></ol>`,
      ok: () => nodesOf("distributions").some(hasIn) && PROG.seen.distributions && nodesOf("correlations").some(hasIn) && PROG.seen.correlations,
      quiz: { q: "stress와 상관관계가 가장 강한(|r|이 가장 큰) 속성은?", choices: () => { const n = nodesOf("correlations").find(hasIn); return n ? numCols(res(n).inp.Data).filter(c => c !== "stress") : []; },
        ans: () => { const n = nodesOf("correlations").find(hasIn); if (!n) return null; const c = E.correlations(res(n).inp.Data).find(x => x.a === "stress" || x.b === "stress"); return c ? (c.a === "stress" ? c.b : c.a) : null; } } },
    { stage: "⑤ 데이터 모델링", t: "Select Columns로 feature와 target 정하기", how: () => `<ol><li>${tag("selcols")}를 Preprocess에 연결하세요.</li><li>target = <b>stress</b>, features = <b>sleep, exercise, electronic_device_usage</b>, grade = Ignored</li></ol>`,
      ok: () => nodesOf("selcols").some(n => { const d = res(n).out.Data; if (!d) return false; const t = targetName(d); return t && featNames(d).length > 0 && (colIdx(d, "stress") < 0 || t === "stress"); }) },
    { stage: "⑤ 데이터 모델링", t: "Data Sampler로 7:3 분할하기", how: () => `<ol><li>${tag("sampler")}를 Select Columns에 연결하세요.</li><li>Fixed proportion of data = <b>70 %</b>, Replicable 체크</li></ol>교과서: 훈련 46 | 테스트 19`,
      ok: () => nodesOf("sampler").some(n => hasIn(n) && n.settings.prop === 70 && targetName(res(n).inp.Data)) },
    { stage: "⑤ 데이터 모델링", t: "모델 위젯에 훈련 데이터 연결하기", how: () => `<ol><li><b>Model</b>에서 ${tag("linreg")} ${tag("rf")} ${tag("knn")} ${tag("svm")}을 놓으세요.</li><li>Data Sampler의 <b>Data Sample → Data</b>를 각 모델에 연결하세요.</li></ol>(최소 2개 모델)`,
      ok: () => nodesOf("linreg", "logreg", "rf", "knn", "svm", "nb").filter(n => hasIn(n) && res(n).out.Model && !res(n).out.Model.err).length >= 2 },
    { stage: "⑥ 평가", t: "Test and Score로 모델 비교하기", how: () => `<ol><li>${tag("testscore")}를 놓으세요.</li><li>Data Sampler → Test and Score: <b>Data Sample → Data</b></li><li>각 모델 → Test and Score: <b>Learner</b></li><li>Sampling: <b>Cross validation</b>, folds = 5</li></ol>`,
      ok: () => nodesOf("testscore").some(n => res(n).rows && res(n).rows.filter(x => x.m).length >= 2),
      quiz: { q: "R²(분류라면 CA)가 가장 높은 모델은?", choices: () => { const n = nodesOf("testscore").find(x => res(x).rows); return n ? res(n).rows.filter(x => x.m).map(x => x.name) : []; },
        ans: () => { const n = nodesOf("testscore").find(x => res(x).rows); if (!n) return null; const r = res(n), ok = r.rows.filter(x => x.m); if (!ok.length) return null; const key = r.task === "regression" ? "R2" : "CA"; return ok.reduce((a, b) => (b.m[key] > a.m[key] ? b : a)).name; } } },
    { stage: "⑥ 평가", t: "Predictions로 테스트 데이터 예측하기", how: () => `<ol><li>${tag("predictions")}를 놓으세요.</li><li>Data Sampler → Predictions: <b>Remaining Data → Data</b></li><li>각 모델 → Predictions: <b>Model → Predictors</b></li><li>창을 열어 실제값과 예측값을 비교하세요.</li></ol>`,
      ok: () => nodesOf("predictions").some(n => res(n).cols && res(n).cols.some(c => !c.err) && PROG.seen.predictions) }
  ];
  let openMission = null;
  function missionDone(i) {
    const m = MISSIONS[i];
    let ok = false; try { ok = m.ok(); } catch (e) { ok = false; }
    if (!ok) return { base: false, done: false };
    if (m.quiz) return { base: true, done: !!PROG.quiz[i] };
    return { base: true, done: true };
  }
  let lastDone = -1;
  function renderMissions() {
    const st = MISSIONS.map((_, i) => missionDone(i));
    const nDone = st.filter(s => s.done).length, cur = st.findIndex(s => !s.done);
    if (openMission === null || (lastDone >= 0 && nDone > lastDone)) openMission = cur;
    if (lastDone >= 0 && nDone > lastDone) toast(nDone === MISSIONS.length ? "🎉 모든 미션 완료! 교과서 워크플로를 완성했어요." : `✅ 미션 완료! (${nDone}/${MISSIONS.length})`, 2200, true);
    lastDone = nDone;
    let h = `<h2>🎯 실습 미션</h2><div class="info">교과서 순서대로 오렌지 워크플로를 직접 만들어 보세요.</div><div class="pbar"><i style="width:${100 * nDone / MISSIONS.length}%"></i></div><div class="info"><b>${nDone}</b> / ${MISSIONS.length} 완료</div>`;
    let stage = "";
    MISSIONS.forEach((m, i) => {
      if (m.stage !== stage) { stage = m.stage; h += `<div class="mstage">${stage}</div>`; }
      const s = st[i];
      let quiz = "";
      if (m.quiz && s.base) {
        if (s.done) quiz = `<div class="quiz"><div class="q">${esc(m.quiz.q)}</div><div class="ok">정답! ✔ ${esc(String(PROG.quiz[i]))}</div></div>`;
        else if (m.quiz.choices) quiz = `<div class="quiz"><div class="q">${esc(m.quiz.q)}</div>${m.quiz.choices().map(c => `<button data-qc="${i}" data-v="${esc(c)}">${esc(c)}</button>`).join("")}<div class="fb" id="qfb${i}"></div></div>`;
        else quiz = `<div class="quiz"><div class="q">${esc(m.quiz.q)}</div><input type="number" id="qi${i}"> <button class="go" data-qn="${i}">확인</button><div class="fb" id="qfb${i}"></div></div>`;
      } else if (m.quiz) quiz = `<div class="info" style="margin-top:6px">✏️ 위젯을 완성하면 확인 문제가 나타나요.</div>`;
      h += `<div class="mission ${s.done ? "done" : ""} ${i === cur ? "cur" : ""} ${i === openMission ? "open" : ""}"><div class="mh" data-m="${i}"><span class="st">${s.done ? "✓" : i + 1}</span><span>${esc(m.t)}</span></div><div class="mb">${m.how()}${quiz}</div></div>`;
    });
    h += `<div class="note" style="margin-top:14px">막히면 위쪽 <b>완성 예시 보기</b>로 교과서 워크플로 전체를 불러와 비교해 보세요.<br>작업 내용은 이 브라우저에 자동 저장돼요.</div>`;
    const box = $("#missions"), sc = box.scrollTop;
    box.innerHTML = h; box.scrollTop = sc;
    $$("[data-m]", box).forEach(e => e.onclick = () => { openMission = openMission === +e.dataset.m ? -1 : +e.dataset.m; renderMissions(); });
    $$("[data-qc]", box).forEach(b => b.onclick = () => checkQuiz(+b.dataset.qc, b.dataset.v));
    $$("[data-qn]", box).forEach(b => b.onclick = () => checkQuiz(+b.dataset.qn, $("#qi" + b.dataset.qn).value));
  }
  function checkQuiz(i, v) {
    const a = MISSIONS[i].quiz.ans();
    const ok = typeof a === "number" ? Math.abs(parseFloat(v) - a) < 1e-9 : String(v) === String(a);
    if (ok) { PROG.quiz[i] = v; save(); renderMissions(); }
    else { const fb = $("#qfb" + i); if (fb) fb.innerHTML = `<span class="no">다시 확인해 보세요.</span> 위젯 창을 열어 값을 찾아보세요.`; }
  }

  /* ===================== 완성 예시 · 초기화 ===================== */
  function loadExample() {
    if (G.nodes.length && !confirm("지금 캔버스의 작업을 지우고 교과서 완성 워크플로를 불러올까요?")) return;
    Object.keys(UI.wins).forEach(id => closeWin(+id));
    const N = (id, type, x, y, title, settings) => ({ id, type, x: Math.round(x * 0.95) + 20, y: Math.round(y * 0.95) - 70, title, settings: Object.assign(W[type].defaults(), settings || {}) });
    G = { nodes: [
      N(1, "file", 100, 300, "File", { source: "sample", types: { grade: "cat" }, roles: {} }),
      N(2, "table", 260, 160, "Data Table"), N(3, "featstats", 420, 160, "Feature Statistics"),
      N(4, "scatter", 260, 440, "Scatter Plot (운동-수면)", { x: "exercise", y: "sleep", color: "stress" }),
      N(5, "scatter", 260, 560, "Scatter Plot (기기-스트레스)", { x: "electronic_device_usage", y: "stress", color: "-" }),
      N(6, "boxplot", 100, 560, "Box Plot (이상치 범위)"),
      N(7, "impute", 260, 300, "Impute (결측치 제거)", { method: "drop" }),
      N(8, "selrows", 420, 300, "Select Rows (이상치 제거)", { conds: [{ col: "stress", op: "between", a: 0, b: 36.5 }, { col: "sleep", op: "between", a: 2, b: 10 }, { col: "exercise", op: "between", a: 0, b: 145.5 }, { col: "electronic_device_usage", op: "between", a: 0, b: 8 }] }),
      N(9, "preprocess", 580, 300, "Preprocess (0~1 정규화)", { norm: true, method: "minmax" }),
      N(10, "table", 740, 160, "Data Table (정규화 결과)"), N(11, "boxplot", 740, 440, "Box Plot (정규화 후)"),
      N(12, "distributions", 900, 160, "Distributions"), N(13, "correlations", 900, 300, "Correlations", { filter: "stress" }),
      N(14, "selcols", 740, 620, "Select Columns (feature/target)", { roles: { stress: "target", grade: "ignore" } }),
      N(15, "sampler", 900, 620, "Data Sampler (7:3)"),
      N(16, "linreg", 1080, 500, "Linear Regression"), N(17, "rf", 1080, 610, "Random Forest"), N(18, "knn", 1080, 720, "kNN"), N(19, "svm", 1080, 830, "SVM"),
      N(20, "testscore", 1260, 560, "Test and Score"), N(21, "predictions", 1260, 720, "Predictions (테스트 30%)")
    ], links: [], seq: 200 };
    const L = (a, b, ...ch) => G.links.push({ id: G.seq++, from: a, to: b, ch });
    [2, 3, 4, 5, 6, 7].forEach(t => L(1, t, ["Data", "Data"]));
    L(7, 8, ["Data", "Data"]); L(8, 9, ["Matching Data", "Data"]);
    [10, 11, 12, 13, 14].forEach(t => L(9, t, ["Preprocessed Data", "Data"]));
    L(14, 15, ["Data", "Data"]);
    [16, 17, 18, 19].forEach(t => L(15, t, ["Data Sample", "Data"]));
    L(15, 20, ["Data Sample", "Data"]); L(15, 21, ["Remaining Data", "Data"]);
    [16, 17, 18, 19].forEach(m => { L(m, 20, ["Learner", "Learner"]); L(m, 21, ["Model", "Predictors"]); });
    UI.sel = null; recompute();
    wrap.scrollTo({ left: 0, top: 0 });
    toast("교과서 완성 워크플로를 불러왔어요. 위젯을 더블클릭해 결과를 확인해 보세요.", 3000, true);
  }
  $("#btnExample").onclick = loadExample;
  $("#btnClear").onclick = () => {
    if (!confirm("캔버스의 위젯과 미션 기록을 모두 지울까요?")) return;
    Object.keys(UI.wins).forEach(id => closeWin(+id));
    G = { nodes: [], links: [], seq: 1 }; PROG = { quiz: {}, seen: {} }; UI.sel = null; openMission = null; lastDone = -1; recompute();
  };

  let toastT;
  function toast(msg, ms, good) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (good ? " good" : ""); clearTimeout(toastT); toastT = setTimeout(() => t.className = "toast", ms || 2200); }

  /* ===================== 시작 ===================== */
  async function start() {
    try { const r = await fetch("daily_data.csv", { cache: "no-store" }); if (r.ok) SAMPLE_TEXT = await r.text(); } catch (e) { /* 내장 데이터 사용 */ }
    if (SAMPLE_TEXT.split("\n").length < 10) SAMPLE_TEXT = EMBEDDED;
    renderToolbox();
    load();
    recompute();
    lastDone = MISSIONS.map((_, i) => missionDone(i)).filter(s => s.done).length;
    const m = /[#&?]m=(\d+)/.exec(location.hash + location.search);
    if (m) { openMission = Math.min(MISSIONS.length - 1, +m[1] - 1); renderMissions(); }
    if (/[?&]example/.test(location.search) && !G.nodes.length) loadExample();
  }
  const EMBEDDED = "grade,stress,sleep,exercise,electronic_device_usage\n2,40,5.0,10.0,7.0\n2,16,6.0,180.0,2.5\n2,8,8.0,60.0,5.0\n2,9,7.5,0.0,2.0\n1,25,5.5,0.0,5.0\n3,10,6.5,26.4,3.0\n1,25,5.5,20.0,5.0\n2,15,5.5,60.0,18.0\n2,17,5.5,30.0,10.0\n2,27,6.0,26.4,2.5\n2,21,6.5,30.0,7.5\n1,9,8.0,30.0,2.5\n2,24,7.5,6.0,14.0\n2,2,8.0,60.0,2.5\n2,16,6.5,45.0,9.0\n1,7,7.0,30.0,4.0\n2,2,6.0,45.0,4.0\n2,1,7.0,120.0,6.5\n2,14,7.5,30.0,3.0\n1,12,7.0,45.0,2.5\n2,4,8.0,3.0,2.5\n2,15,8.0,10.0,5.0\n3,13,6.0,0.0,4.0\n2,9,6.5,6.0,2.5\n3,12,7.0,90.0,5.0\n2,21,6.0,6.0,3.0\n2,12,11.0,90.0,1.5\n2,24,5.0,20.0,4.5\n1,15,7.0,6.0,3.5\n2,24,5.5,0.0,1.5\n2,14,7.5,10.0,3.5\n2,3,7.0,10.0,3.0\n2,17,5.0,10.0,5.0\n1,21,6.0,30.0,4.5\n2,29,20.0,20.0,9.0\n1,25,5.5,0.0,1.5\n2,25,3.5,60.0,4.0\n2,1,7.5,120.0,1.5\n2,24,4.0,20.0,5.0\n2,28,4.0,45.0,9.0\n2,23,4.5,3.0,\n2,24,5.0,10.0,1.5\n1,13,5.0,120.0,6.5\n2,10,5.0,120.0,5.5\n2,17,6.5,6.0,\n2,38,7.5,30.0,4.5\n2,18,5.5,0.0,7.5\n2,13,6.5,120.0,4.5\n1,33,4.5,3.0,5.5\n2,22,6.0,6.0,4.5\n2,16,5.0,26.4,12.0\n2,20,6.0,0.0,8.5\n1,9,6.5,30.0,9.0\n1,23,5.5,10.0,3.5\n1,17,5.5,26.4,4.5\n2,22,4.5,3.0,5.5\n2,15,5.0,45.0,3.0\n2,10,6.0,26.4,1.5\n1,2,7.0,120.0,4.5\n2,17,7.0,0.0,4.0\n2,13,7.0,3.0,6.0\n2,16,7.0,10.0,8.0\n1,17,5.5,60.0,1.5\n1,14,5.5,45.0,4.0\n2,3,9.0,6.0,9.0\n2,21,6.0,30.0,4.5\n2,10,6.0,90.0,7.0\n2,12,6.5,0.0,3.0\n1,12,7.0,240.0,4.5\n2,24,6.0,10.0,3.0\n2,19,7.0,0.0,4.0\n2,14,6.5,20.0,3.0\n1,18,8.0,3.0,2.5\n2,6,7.0,120.0,2.0\n2,24,5.5,26.4,6.0\n2,17,7.0,26.4,3.5\n1,21,7.0,30.0,5.0\n2,23,5.5,20.0,3.5\n2,17,5.5,10.0,8.5\n1,13,8.0,30.0,2.0\n2,22,5.5,3.0,3.0\n1,12,7.0,30.0,6.0\n2,22,6.5,30.0,2.0\n";
  start();
})();
