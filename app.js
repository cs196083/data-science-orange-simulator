/* 데이터 과학 프로젝트 시뮬레이터 - 화면(UI) */
(function () {
  "use strict";
  const E = window.DSEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d) => (v === null || v === undefined || (typeof v === "number" && isNaN(v))) ? "-" :
    (typeof v === "number" ? (Number.isInteger(v) && d === undefined ? String(v) : v.toFixed(d === undefined ? 3 : d)) : esc(v));
  const C = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", ink2: "#52514e", ink3: "#86847e", grid: "#ebe9e4", line: "#d3d0c8", neg: "#2a78d6", pos: "#e34948" };
  const TEXTBOOK_RANGES = { stress: [0, 36.5], sleep: [2, 10], exercise: [0, 145.5], electronic_device_usage: [0, 8] };

  // ---------------- 상태 ----------------
  const S = {
    name: "", isSample: false, parsed: null, types: {}, skip: {},
    imputeMethod: "drop", ranges: {}, rangeOn: {}, normMethod: "minmax",
    scatter: {}, boxVar: null, distVar: null, bins: 8,
    target: null, features: [], ratio: 0.7, seed: 42, stratify: true, folds: 5, models: [],
    exp: null, step: 0, done: {}
  };

  // ---------------- 데이터 불러오기 ----------------
  function loadText(text, name, isSample) {
    let parsed;
    try { parsed = E.parseCSV(text); } catch (e) { alert("CSV를 읽을 수 없습니다: " + e.message); return; }
    if (parsed.header.length < 2 || parsed.body.length < 5) { alert("속성 2개 이상, 데이터 5행 이상이 필요합니다."); return; }
    S.name = name; S.isSample = isSample; S.parsed = parsed;
    S.types = E.inferTypes(parsed); S.skip = {}; S.exp = null;
    S.imputeMethod = "drop"; S.normMethod = "minmax";
    recompute(true);
    const nums = S.raw.cols.filter(c => c.type === "num").map(c => c.name);
    if (isSample) {
      S.ranges = JSON.parse(JSON.stringify(TEXTBOOK_RANGES));
      S.target = "stress"; S.features = ["sleep", "exercise", "electronic_device_usage"];
      S.scatter = { x: "exercise", y: "sleep", color: "stress" };
    } else {
      S.ranges = E.suggestRanges(S.imputed);
      S.target = nums.length ? nums[nums.length - 1] : parsed.header[parsed.header.length - 1];
      S.features = parsed.header.filter(h => h !== S.target);
      S.scatter = { x: nums[0] || null, y: nums[1] || nums[0] || null, color: S.target };
    }
    S.rangeOn = {}; Object.keys(S.ranges).forEach(k => S.rangeOn[k] = true);
    S.boxVar = S.target && S.types[S.target] === "num" ? S.target : nums[0];
    S.distVar = S.boxVar;
    syncModels();
    recompute();
  }

  function syncModels() {
    const task = S.types[S.target] === "num" ? "regression" : "classification";
    S.models = E.MODEL_INFO[task].map(m => m.id);
  }

  // 파이프라인: File → Impute → Select Rows → Preprocess
  function recompute(dataOnly) {
    S.raw = E.buildDataset(S.parsed, S.types, S.skip);
    S.imputed = E.impute(S.raw, S.imputeMethod);
    const ranges = {};
    Object.keys(S.ranges).forEach(k => { if (S.rangeOn[k] && S.types[k] === "num") ranges[k] = S.ranges[k]; });
    S.filter = E.filterRows(S.imputed, ranges);
    const exclude = [];
    S.norm = E.normalize(S.filter.ds, S.normMethod, exclude).ds;
    if (dataOnly) return;
    renderAll();
  }

  // ---------------- 공통: 툴팁 ----------------
  const tip = $("#tip");
  document.addEventListener("mousemove", e => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.style.display = "none"; return; }
    tip.innerHTML = t.getAttribute("data-tip");
    tip.style.display = "block";
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
  });

  // ---------------- SVG 도우미 ----------------
  function scale(d0, d1, r0, r1) { const k = (d1 - d0) ? (r1 - r0) / (d1 - d0) : 0; return v => r0 + (v - d0) * k; }
  function ticks(a, b, n) {
    if (a === b) { a -= 1; b += 1; }
    const step0 = (b - a) / (n || 5), mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const tfmt = v => Math.abs(v) >= 1000 ? v.toFixed(0) : +v.toFixed(3) + "";
  function svg(w, h, body, label) { return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || "")}">${body}</svg>`; }
  function seqColor(t) { // 단일 색상 연속(밝음→진함) 파랑 계열
    t = Math.max(0, Math.min(1, t));
    const a = [207, 226, 248], b = [16, 62, 130];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  }
  const CAT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

  // ---------------- 네비게이션 ----------------
  function renderNav() {
    const nav = $("#stepnav");
    nav.innerHTML = $$("section.page").map(p => {
      const i = +p.dataset.step;
      return `<button data-go="${i}" class="${i === S.step ? "active" : ""} ${S.done[i] ? "done" : ""}"><span class="n">${i === 0 ? "★" : (i === 7 ? "P" : i)}</span>${p.dataset.label}</button>`;
    }).join("");
    $$("section.page").forEach(p => p.classList.toggle("active", +p.dataset.step === S.step));
    $$(".nextprev").forEach(np => {
      const i = +np.closest("section").dataset.step;
      const prev = $$("section.page").find(p => +p.dataset.step === i - 1);
      const next = $$("section.page").find(p => +p.dataset.step === i + 1);
      np.innerHTML = (prev ? `<button class="btn ghost" data-go="${i - 1}">← ${prev.dataset.label}</button>` : "<span></span>") +
        (next ? `<button class="btn" data-go="${i + 1}">${next.dataset.label} →</button>` : "<span></span>");
    });
  }
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-go]");
    if (g) { S.done[S.step] = true; S.step = +g.dataset.go; renderNav(); window.scrollTo({ top: 0, behavior: "smooth" }); location.hash = "s" + S.step; }
  });

  // ---------------- 데이터 막대 ----------------
  function renderDatasetBar() {
    const mi = E.missingInfo(S.raw);
    $("#datasetBar").innerHTML = `
      <span>현재 데이터: <b>${esc(S.name)}</b> · ${S.raw.rows.length}행 × ${S.raw.cols.length}속성 · 결측 ${mi.missing}칸</span>
      <span style="flex:1"></span>
      <button class="btn ghost" id="useSample">예제 데이터(daily_data.csv)</button>
      <label class="btn" style="cursor:pointer">📂 내 CSV 불러오기<input type="file" id="fileIn" accept=".csv,.tsv,.txt" style="display:none"></label>`;
    $("#useSample").onclick = loadSample;
    $("#fileIn").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let text = rd.result;
        if (text.indexOf("�") >= 0) { // UTF-8이 아니면 EUC-KR로 다시 읽기
          const r2 = new FileReader(); r2.onload = () => loadText(r2.result, f.name, false); r2.readAsText(f, "euc-kr"); return;
        }
        loadText(text, f.name, false);
      };
      rd.readAsText(f, "utf-8");
    };
  }

  // ---------------- 위젯 흐름도 ----------------
  const W = {
    file: ["c-data", "📄", "File", "Data"], table: ["c-data", "▦", "Data Table", "Data"], fstat: ["c-data", "📊", "Feature Statistics", "Data"],
    impute: ["c-transform", "🧩", "Impute", "Transform"], selrows: ["c-transform", "☰", "Select Rows", "Transform"], pre: ["c-transform", "⚙", "Preprocess", "Transform"],
    selcol: ["c-transform", "▥", "Select Columns", "Transform"], sampler: ["c-transform", "✂", "Data Sampler", "Transform"],
    scatter: ["c-visual", "⁘", "Scatter Plot", "Visualize"], box: ["c-visual", "⊟", "Box Plot", "Visualize"], dist: ["c-visual", "▮", "Distributions", "Visualize"],
    corr: ["c-unsup", "⋰", "Correlations", "Unsupervised"],
    lr: ["c-model", "╱", "Linear Regression", "Model"], rf: ["c-model", "🌲", "Random Forest", "Model"], knn: ["c-model", "◎", "kNN", "Model"], svm: ["c-model", "⫽", "SVM", "Model"],
    ts: ["c-eval", "⚗", "Test and Score", "Evaluate"], pred: ["c-eval", "🎯", "Predictions", "Evaluate"]
  };
  function wd(k, isNew) { const w = W[k]; return `<div class="w ${w[0]} ${isNew ? "new" : ""}"><div class="ic">${w[1]}</div><div class="nm">${w[2]}</div><div class="ct">${w[3]}</div></div>`; }
  const AR = `<span class="arrow">→</span>`;
  function branch(rows) { return `<div class="branch">${rows.map(r => `<div class="row">${r}</div>`).join("")}</div>`; }
  function renderFlows() {
    const F = {
      f2: wd("file", 1) + AR + wd("table", 1),
      f3: wd("file") + AR + branch([wd("table") + AR + wd("fstat", 1), wd("scatter", 1) + wd("box", 1),
        wd("impute", 1) + AR + wd("selrows", 1) + AR + wd("pre", 1) + AR + branch([wd("table", 1), wd("box", 1)])]),
      f4: wd("file") + AR + wd("impute") + AR + wd("selrows") + AR + wd("pre") + AR + branch([wd("dist", 1), wd("corr", 1)]),
      f5: wd("pre") + AR + wd("selcol", 1) + AR + wd("sampler", 1) + AR + branch([wd("lr", 1) + wd("rf", 1), wd("knn", 1) + wd("svm", 1)]),
      f6: wd("sampler") + AR + branch([wd("lr") + wd("rf") + wd("knn") + wd("svm"), "<span style='font-size:.8rem;color:#86847e;padding-left:8px'>Data Sample + 각 모델의 Learner</span>"]) + AR + branch([wd("ts", 1), wd("pred", 1)])
    };
    $$("[data-flow]").forEach(el => { el.innerHTML = F[el.dataset.flow] + `<span style="font-size:.78rem;color:#c62828;margin-left:10px">빨간 테두리 = 이 단계에서 새로 추가하는 위젯</span>`; });
  }

  // ---------------- 1. 문제 정의 ----------------
  function renderStep1() {
    const Q = [
      ["수면·운동 시간으로 스트레스 지수(0~40)를 예측", "회귀", "target이 숫자(연속형) → 회귀"],
      ["급식 메뉴 특징으로 ‘선호/비선호’를 예측", "분류", "target이 범주(선호/비선호) → 분류"],
      ["비슷한 문화생활 패턴을 가진 지역끼리 묶기", "군집", "정답(target)이 없음 → 군집(비지도 학습)"]
    ];
    $("#quiz1").innerHTML = Q.map((q, i) => `<div><b>${i + 1}. ${q[0]}</b><div style="display:flex;gap:6px;margin-top:4px">${["회귀", "분류", "군집"].map(a => `<button data-q="${i}" data-a="${a}">${a}</button>`).join("")}</div><div class="qres" id="qres${i}" style="font-size:.85rem;color:#52514e"></div></div>`).join("");
    $$("#quiz1 button").forEach(b => b.onclick = () => {
      const q = Q[+b.dataset.q], ok = b.dataset.a === q[1];
      $$(`#quiz1 button[data-q="${b.dataset.q}"]`).forEach(x => x.classList.remove("ok", "no"));
      b.classList.add(ok ? "ok" : "no");
      $("#qres" + b.dataset.q).textContent = (ok ? "정답! " : "다시 생각해 보세요. ") + (ok ? q[2] : "");
    });
    checklist("#check1a", "c1", ["법적·윤리적 문제가 없는 데이터인가? (동의 받은 설문, 공개 데이터)", "데이터 값이 정확한가?", "데이터 값이 유효한가?", "데이터 간 통일성이 있는가? (단위·형식)", "중복된 값은 없는가?", "출처가 명확한 데이터인가?", "민감한 개인 정보(이름, 연락처 등)를 제거했는가?", "문제를 해결하기에 충분한 양인가? (50행 이상 권장)"]);
    checklist("#check6", "c6", ["가장 좋은 모델을 지표(MSE·R² 또는 CA·F1) 수치로 근거를 들어 선택했다.", "훈련 데이터와 테스트 데이터 성능 차이를 확인했다(과적합 점검).", "상관관계를 인과관계로 단정하지 않았다.", "데이터가 특정 집단에서 수집되어 일반화에 한계가 있음을 밝혔다.", "결과를 해석할 때 모둠원의 다른 견해를 듣고 존중했다.", "결과가 특정 개인·집단에게 불이익을 주지 않도록 활용 방안을 고려했다."]);
  }
  function checklist(sel, key, items) {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    $(sel).innerHTML = items.map((t, i) => `<label><input type="checkbox" data-k="${key}" data-i="${i}" ${saved[i] ? "checked" : ""}> <span>${t}</span></label>`).join("");
    $$(sel + " input").forEach(inp => inp.onchange = () => { const s = JSON.parse(localStorage.getItem(key) || "{}"); s[inp.dataset.i] = inp.checked; localStorage.setItem(key, JSON.stringify(s)); });
  }

  // ---------------- 2. 데이터 수집 ----------------
  function renderStep2() {
    const p = S.parsed, numOK = E.inferTypes(p);
    const rows = p.header.map((h, i) => {
      const vals = Array.from(new Set(p.body.map(r => r[i]).filter(v => !E.isMissing(v))));
      const preview = vals.slice(0, 6).join(", ") + (vals.length > 6 ? " …" : "");
      const t = S.types[h];
      const hint = (S.isSample && h === "grade" && t === "num") ? `<span class="pill" style="background:#fff0d6;color:#8a5300">학년은 범주형으로!</span>` : "";
      return `<tr><td>${i + 1}</td><td><b>${esc(h)}</b>${hint}</td>
        <td><select data-type="${esc(h)}"><option value="num" ${t === "num" ? "selected" : ""} ${numOK[h] === "num" ? "" : "disabled"}>N numeric</option><option value="cat" ${t === "cat" ? "selected" : ""}>C categorical</option></select></td>
        <td><select data-skip="${esc(h)}"><option value="0">feature</option><option value="1" ${S.skip[h] ? "selected" : ""}>skip</option></select></td>
        <td style="color:#86847e">${esc(t === "cat" ? vals.length + "개 범주: " + preview : preview)}</td></tr>`;
    }).join("");
    $("#fileWidget").innerHTML = `<div class="scroll" style="max-height:none"><table class="t"><thead><tr><th></th><th>Name</th><th>Type</th><th>Role</th><th>Values</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p style="font-size:.85rem;color:#86847e;margin:6px 0 0">※ target(예측 대상)은 ⑤ 모델링 단계의 Select Columns에서 정합니다. 오렌지 File 위젯에서 Role을 target으로 바로 지정해도 됩니다.</p>`;
    $$("[data-type]").forEach(s => s.onchange = () => {
      S.types[s.dataset.type] = s.value; S.exp = null;
      if (s.value === "num" && !S.ranges[s.dataset.type]) { const r = E.suggestRanges(E.impute(E.buildDataset(S.parsed, S.types, S.skip), "drop")); S.ranges[s.dataset.type] = r[s.dataset.type]; S.rangeOn[s.dataset.type] = true; }
      if (s.dataset.type === S.target) syncModels();
      recompute();
    });
    $$("[data-skip]").forEach(s => s.onchange = () => {
      S.skip[s.dataset.skip] = s.value === "1"; S.exp = null;
      S.features = S.features.filter(f => !S.skip[f]);
      if (S.skip[S.target]) S.target = S.parsed.header.find(h => !S.skip[h]);
      recompute();
    });
    const ds = S.raw, mi = E.missingInfo(ds);
    const target = S.target && !S.skip[S.target] ? S.target : null;
    $("#dataTableInfo").innerHTML = `<div class="stat-row">
      <div class="stat"><div class="v">${ds.rows.length}</div><div class="l">instances (데이터 수)</div></div>
      <div class="stat"><div class="v">${ds.cols.length}</div><div class="l">features (속성 수)</div></div>
      <div class="stat"><div class="v">${mi.pct.toFixed(1)}%</div><div class="l">missing data (결측 비율)</div></div>
      <div class="stat"><div class="v">${mi.rowsWithMissing}</div><div class="l">결측치가 있는 행</div></div></div>
      <p style="font-size:.88rem;color:#52514e;margin:0 0 8px">${ds.rows.length} instances, ${ds.cols.length} features (${mi.pct.toFixed(1)} % missing data)${target ? "" : ", No target variable."} — 빨간 칸(?)이 결측치입니다.</p>`;
    $("#dataTable").innerHTML = dataTableHTML(ds, 300);
  }
  function dataTableHTML(ds, limit, d) {
    const head = `<tr><th class="num">#</th>${ds.cols.map(c => `<th class="${c.type === "num" ? "num" : ""}">${esc(c.name)}<br><span style="font-weight:400;font-size:.75rem">${c.type === "num" ? "N" : "C"}</span></th>`).join("")}</tr>`;
    const body = ds.rows.slice(0, limit).map((r, i) => `<tr><td class="num" style="color:#86847e">${i + 1}</td>${r.map((v, k) => v === null ? `<td class="miss">?</td>` : `<td class="${ds.cols[k].type === "num" ? "num" : ""}">${ds.cols[k].type === "num" ? fmt(v, d) : esc(v)}</td>`).join("")}</tr>`).join("");
    return `<table class="t"><thead>${head}</thead><tbody>${body}</tbody></table>` + (ds.rows.length > limit ? `<p style="font-size:.8rem;color:#86847e;padding:4px 8px">… 처음 ${limit}행만 표시</p>` : "");
  }

  // ---------------- 3. 전처리 ----------------
  function miniHist(vals, w, h) {
    const v = vals.filter(x => x !== null);
    if (!v.length) return "";
    const mn = Math.min(...v), mx = Math.max(...v), nb = 10, c = new Array(nb).fill(0);
    v.forEach(x => c[mx === mn ? 0 : Math.min(nb - 1, Math.floor((x - mn) / (mx - mn) * nb))]++);
    const top = Math.max(...c), bw = w / nb;
    return `<svg width="${w}" height="${h}">${c.map((k, i) => `<rect x="${i * bw + 1}" y="${h - k / top * h}" width="${bw - 2}" height="${k / top * h}" rx="1" fill="${C.s1}"/>`).join("")}</svg>`;
  }
  function miniCat(vals, cats, w, h) {
    const st = E.catStats(vals, cats), ks = Object.keys(st.counts), top = Math.max(...ks.map(k => st.counts[k]), 1), bw = w / Math.max(ks.length, 1);
    return `<svg width="${w}" height="${h}">${ks.map((k, i) => `<rect x="${i * bw + 1}" y="${h - st.counts[k] / top * h}" width="${bw - 2}" height="${st.counts[k] / top * h}" rx="1" fill="${C.s2}"><title>${esc(k)}: ${st.counts[k]}</title></rect>`).join("")}</svg>`;
  }
  function renderStep3() {
    const ds = S.raw;
    $("#featStats").innerHTML = `<table class="t"><thead><tr><th></th><th>Name</th><th>Distribution</th><th class="num">Mean</th><th class="num">Mode</th><th class="num">Median</th><th class="num">Dispersion</th><th class="num">Min.</th><th class="num">Max.</th><th class="num">Missing</th></tr></thead><tbody>${
      ds.cols.map((c, k) => {
        const vals = ds.rows.map(r => r[k]);
        if (c.type === "num") {
          const st = E.numStats(vals);
          return `<tr><td><span class="cat transform" style="background:#e34948;color:#fff">N</span></td><td>${esc(c.name)}</td><td>${miniHist(vals, 110, 26)}</td><td class="num">${fmt(st.mean, 2)}</td><td class="num">${fmt(st.mode, 1)}</td><td class="num">${fmt(st.median, 1)}</td><td class="num">${fmt(st.dispersion, 3)}</td><td class="num">${fmt(st.min, 1)}</td><td class="num">${fmt(st.max, 1)}</td><td class="num" style="${st.missing ? "color:#c62828;font-weight:700" : ""}">${st.missing} (${(100 * st.missing / vals.length).toFixed(0)} %)</td></tr>`;
        }
        const st = E.catStats(vals, c.values);
        return `<tr><td><span class="cat" style="background:#1a7f37;color:#fff">C</span></td><td>${esc(c.name)}</td><td>${miniCat(vals, c.values, 110, 26)}</td><td></td><td class="num">${esc(st.mode)}</td><td></td><td></td><td></td><td></td><td class="num" style="${st.missing ? "color:#c62828;font-weight:700" : ""}">${st.missing} (${(100 * st.missing / vals.length).toFixed(0)} %)</td></tr>`;
      }).join("")}</tbody></table>`;

    const opts = [["none", "Don't impute", "결측치를 그대로 둠 (모델링 시 해당 행은 자동 제외)"], ["mean", "Average/Most frequent", "수치형은 평균, 범주형은 가장 흔한 값으로 대체"],
      ["median", "Median/Most frequent", "수치형은 중앙값으로 대체 (이상치에 덜 민감)"], ["drop", "Remove instances with unknown values", "결측치가 있는 행 삭제"]];
    $("#imputeOpts").innerHTML = `<h4>Impute 위젯 · Default Method</h4>` + opts.map(o => `<label><input type="radio" name="imp" value="${o[0]}" ${S.imputeMethod === o[0] ? "checked" : ""}> <b>${o[1]}</b><br><span style="font-size:.82rem;color:#86847e;margin-left:22px">${o[2]}</span></label>`).join("");
    $$("input[name=imp]").forEach(r => r.onchange = () => { S.imputeMethod = r.value; S.exp = null; recompute(); });
    const mi = E.missingInfo(S.raw), pctRows = 100 * mi.rowsWithMissing / S.raw.rows.length;
    $("#imputeResult").innerHTML = `<div class="stat-row"><div class="stat"><div class="v">${S.raw.rows.length} → ${S.imputed.rows.length}</div><div class="l">Impute 전 → 후 데이터 수</div></div>
      <div class="stat"><div class="v">${pctRows.toFixed(1)}%</div><div class="l">결측치가 있는 행의 비율</div></div></div>
      <div class="note ${pctRows > 10 && S.imputeMethod === "drop" ? "warn" : ""}">${mi.missing === 0 ? "결측치가 없습니다. 이 단계는 건너뛰어도 됩니다." :
        pctRows <= 5 ? `결측치가 있는 행이 전체의 약 ${pctRows.toFixed(1)}%로 적어서 <b>행을 삭제</b>해도 분석 결과에 큰 영향을 주지 않습니다.` :
          `결측치가 있는 행이 ${pctRows.toFixed(1)}%입니다. 삭제하면 데이터 손실이 크므로 <b>평균·중앙값 대체</b>를 고려하세요.`}</div>`;

    // Scatter
    const nums = S.imputed.cols.filter(c => c.type === "num").map(c => c.name);
    const all = S.imputed.cols.map(c => c.name);
    const sel = (key, list, none) => `<select data-sc="${key}">${none ? `<option value="">(없음)</option>` : ""}${list.map(n => `<option ${S.scatter[key] === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
    $("#scatterCtl").innerHTML = nums.length < 2 ? "<p>수치형 속성이 2개 이상 필요합니다.</p>" :
      `<label>Axis x ${sel("x", nums)}</label><label>Axis y ${sel("y", nums)}</label><label>Color ${sel("color", all, true)}</label>`;
    $$("[data-sc]").forEach(s => s.onchange = () => { S.scatter[s.dataset.sc] = s.value || null; renderScatter(); });
    renderScatter();

    // Box + ranges
    $("#boxCtl").innerHTML = `<label>Variable <select id="boxVar">${nums.map(n => `<option ${S.boxVar === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
    if ($("#boxVar")) $("#boxVar").onchange = e => { S.boxVar = e.target.value; renderBox(); };
    renderBox();
    renderRanges();
    renderNorm();
  }

  function outOfRange(row, cols) {
    return cols.some((c, k) => c.type === "num" && S.rangeOn[c.name] && S.ranges[c.name] && row[k] !== null && (row[k] < S.ranges[c.name][0] || row[k] > S.ranges[c.name][1]));
  }

  function renderScatter() {
    const ds = S.imputed, sc = S.scatter, el = $("#scatterPlot");
    const kx = ds.cols.findIndex(c => c.name === sc.x), ky = ds.cols.findIndex(c => c.name === sc.y);
    if (kx < 0 || ky < 0) { el.innerHTML = ""; return; }
    const kc = sc.color ? ds.cols.findIndex(c => c.name === sc.color) : -1;
    const pts = ds.rows.filter(r => r[kx] !== null && r[ky] !== null);
    const W0 = 760, H0 = 380, m = { l: 56, r: 130, t: 14, b: 44 };
    const xs = pts.map(r => r[kx]), ys = pts.map(r => r[ky]);
    const xt = ticks(Math.min(...xs), Math.max(...xs), 6), yt = ticks(Math.min(...ys), Math.max(...ys), 5);
    const x = scale(Math.min(xt[0], ...xs), Math.max(xt[xt.length - 1], ...xs), m.l, W0 - m.r), y = scale(Math.min(yt[0], ...ys), Math.max(yt[yt.length - 1], ...ys), H0 - m.b, m.t);
    let colorOf = () => C.s1, legend = "";
    if (kc >= 0) {
      const cc = ds.cols[kc];
      if (cc.type === "num") {
        const st = E.numStats(ds.rows.map(r => r[kc]));
        colorOf = r => r[kc] === null ? "#bbb" : seqColor((r[kc] - st.min) / ((st.max - st.min) || 1));
        legend = `<text x="${W0 - m.r + 20}" y="${m.t + 10}" font-size="12" fill="${C.ink2}">${esc(cc.name)}</text>` +
          [0, .25, .5, .75, 1].map((t, i) => `<rect x="${W0 - m.r + 20}" y="${m.t + 20 + i * 20}" width="14" height="14" rx="3" fill="${seqColor(t)}"/><text x="${W0 - m.r + 40}" y="${m.t + 31 + i * 20}" font-size="11" fill="${C.ink2}">${tfmt(st.min + t * (st.max - st.min))}</text>`).join("");
      } else {
        colorOf = r => r[kc] === null ? "#bbb" : CAT_COLORS[cc.values.indexOf(r[kc]) % 8];
        legend = `<text x="${W0 - m.r + 20}" y="${m.t + 10}" font-size="12" fill="${C.ink2}">${esc(cc.name)}</text>` +
          cc.values.slice(0, 8).map((v, i) => `<circle cx="${W0 - m.r + 27}" cy="${m.t + 27 + i * 20}" r="6" fill="${CAT_COLORS[i]}"/><text x="${W0 - m.r + 40}" y="${m.t + 31 + i * 20}" font-size="11" fill="${C.ink2}">${esc(v)}</text>`).join("");
      }
    }
    let body = xt.map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${H0 - m.b}" stroke="${C.grid}"/><text x="${x(v)}" y="${H0 - m.b + 16}" font-size="11" text-anchor="middle" fill="${C.ink3}">${tfmt(v)}</text>`).join("") +
      yt.map(v => `<line x1="${m.l}" x2="${W0 - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${C.ink3}">${tfmt(v)}</text>`).join("") +
      `<text x="${(m.l + W0 - m.r) / 2}" y="${H0 - 6}" font-size="12" text-anchor="middle" fill="${C.ink2}">${esc(sc.x)}</text><text transform="translate(14 ${(m.t + H0 - m.b) / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${C.ink2}">${esc(sc.y)}</text>`;
    let nOut = 0;
    body += pts.map(r => {
      const out = outOfRange(r, ds.cols); if (out) nOut++;
      const t = ds.cols.map((c, k) => `${esc(c.name)}: ${r[k] === null ? "?" : (c.type === "num" ? tfmt(r[k]) : esc(r[k]))}`).join("<br>") + (out ? "<br><b style='color:#ffb38a'>이상치 확인 범위 밖 → 제거 대상</b>" : "");
      return `<circle cx="${x(r[kx])}" cy="${y(r[ky])}" r="${out ? 7 : 5.5}" fill="${colorOf(r)}" fill-opacity=".85" stroke="${out ? C.s2 : "#fff"}" stroke-width="${out ? 3 : 1.5}" data-tip="${t}"/>`;
    }).join("");
    el.innerHTML = svg(W0, H0, body + legend, "산점도") + `<p style="font-size:.88rem;margin:4px 0 0">점 ${pts.length}개 중 <b style="color:${C.s2}">${nOut}개</b>가 현재 이상치 확인 범위를 벗어납니다.</p>`;
  }

  function boxRow(vals, x, yMid, h, color) {
    const st = E.numStats(vals);
    const lo = Math.max(st.min, st.lowFence), hi = Math.min(st.max, st.highFence);
    const v = vals.filter(a => a !== null);
    const wl = Math.min(...v.filter(a => a >= lo)), wh = Math.max(...v.filter(a => a <= hi));
    const outs = v.filter(a => a < st.lowFence || a > st.highFence);
    const tipTxt = `Q1 ${tfmt(st.q1)} · 중앙값 ${tfmt(st.median)} · Q3 ${tfmt(st.q3)}<br>IQR ${tfmt(st.iqr)} · 평균 ${tfmt(st.mean)}<br>IQR 규칙 범위: ${tfmt(st.lowFence)} ~ ${tfmt(st.highFence)}`;
    return `<line x1="${x(wl)}" x2="${x(wh)}" y1="${yMid}" y2="${yMid}" stroke="${C.ink2}" stroke-width="1.5"/>
      <line x1="${x(wl)}" x2="${x(wl)}" y1="${yMid - h / 4}" y2="${yMid + h / 4}" stroke="${C.ink2}" stroke-width="1.5"/><line x1="${x(wh)}" x2="${x(wh)}" y1="${yMid - h / 4}" y2="${yMid + h / 4}" stroke="${C.ink2}" stroke-width="1.5"/>
      <rect x="${x(st.q1)}" y="${yMid - h / 2}" width="${Math.max(2, x(st.q3) - x(st.q1))}" height="${h}" rx="4" fill="${color}" fill-opacity=".8" data-tip="${tipTxt}"/>
      <line x1="${x(st.median)}" x2="${x(st.median)}" y1="${yMid - h / 2}" y2="${yMid + h / 2}" stroke="#fff" stroke-width="2.5"/>
      <path d="M${x(st.mean)} ${yMid - h / 2 - 7} l-5 -7 h10z" fill="${C.ink2}" data-tip="평균 ${tfmt(st.mean)}"/>
      ${outs.map(o => `<circle cx="${x(o)}" cy="${yMid}" r="5" fill="#fff" stroke="${C.s2}" stroke-width="2" data-tip="이상치 후보: ${tfmt(o)}"/>`).join("")}`;
  }

  function renderBox() {
    const ds = S.imputed, k = ds.cols.findIndex(c => c.name === S.boxVar), el = $("#boxPlot");
    if (k < 0) { el.innerHTML = ""; return; }
    const vals = ds.rows.map(r => r[k]), st = E.numStats(vals);
    const W0 = 520, H0 = 170, m = { l: 20, r: 20 };
    const xt = ticks(st.min, st.max, 6), x = scale(Math.min(xt[0], st.min), Math.max(xt[xt.length - 1], st.max), m.l, W0 - m.r);
    const body = xt.map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="20" y2="125" stroke="${C.grid}"/><text x="${x(v)}" y="142" font-size="11" text-anchor="middle" fill="${C.ink3}">${tfmt(v)}</text>`).join("") +
      boxRow(vals, x, 80, 34, C.s1) +
      `<text x="${x(st.q1)}" y="${80 + 34}" font-size="12" text-anchor="middle" fill="${C.ink2}" dy="16">Q1 ${tfmt(st.q1)}</text><text x="${x(st.q3)}" y="${80 + 34}" font-size="12" text-anchor="middle" fill="${C.ink2}" dy="16">Q3 ${tfmt(st.q3)}</text>` +
      `<text x="${W0 / 2}" y="18" font-size="12" text-anchor="middle" fill="${C.ink2}">${esc(S.boxVar)} · 평균 ${tfmt(st.mean)} ± ${tfmt(st.sd)}</text>`;
    el.innerHTML = svg(W0, H0, body, "상자그림") + `<p style="font-size:.82rem;color:#86847e;margin:0">파란 상자 = Q1~Q3(IQR), 흰 선 = 중앙값, ▼ = 평균, 주황 원 = IQR 규칙상 이상치 후보</p>`;
  }

  function renderRanges() {
    const ds = S.imputed, nums = ds.cols.filter(c => c.type === "num");
    $("#rangeTable").innerHTML = `<h4 style="margin:0 0 6px">Select Rows · 조건 (is between)</h4><div class="scroll" style="max-height:none"><table class="t"><thead><tr><th>사용</th><th>속성</th><th class="num">Q1</th><th class="num">Q3</th><th class="num">IQR×1.5</th><th>최솟값</th><th>최댓값</th></tr></thead><tbody>${
      nums.map(c => {
        const st = E.numStats(ds.rows.map(r => r[ds.cols.indexOf(c)])), rg = S.ranges[c.name] || [st.lowFence, st.highFence];
        return `<tr><td><input type="checkbox" data-ron="${esc(c.name)}" ${S.rangeOn[c.name] ? "checked" : ""}></td><td>${esc(c.name)}</td><td class="num">${tfmt(st.q1)}</td><td class="num">${tfmt(st.q3)}</td><td class="num">${tfmt(1.5 * st.iqr)}</td>
        <td><input type="number" step="any" data-rlo="${esc(c.name)}" value="${rg[0]}"></td><td><input type="number" step="any" data-rhi="${esc(c.name)}" value="${rg[1]}"></td></tr>`;
      }).join("")}</tbody></table></div>
      <div class="controls" style="margin-top:8px"><button class="btn ghost" id="iqrFill">IQR 규칙으로 채우기</button>${S.isSample ? `<button class="btn ghost" id="tbFill">교과서 범위로 채우기</button>` : ""}</div>`;
    const upd = () => { S.exp = null; recompute(); };
    $$("[data-ron]").forEach(i => i.onchange = () => { S.rangeOn[i.dataset.ron] = i.checked; if (!S.ranges[i.dataset.ron]) S.ranges[i.dataset.ron] = E.suggestRanges(S.imputed)[i.dataset.ron]; upd(); });
    $$("[data-rlo],[data-rhi]").forEach(i => i.onchange = () => {
      const n = i.dataset.rlo || i.dataset.rhi; S.ranges[n] = S.ranges[n] || [0, 0];
      S.ranges[n][i.dataset.rlo ? 0 : 1] = parseFloat(i.value); upd();
    });
    $("#iqrFill").onclick = () => { S.ranges = E.suggestRanges(S.imputed); Object.keys(S.ranges).forEach(k => S.rangeOn[k] = true); upd(); };
    if ($("#tbFill")) $("#tbFill").onclick = () => { S.ranges = JSON.parse(JSON.stringify(TEXTBOOK_RANGES)); Object.keys(S.ranges).forEach(k => S.rangeOn[k] = true); upd(); };
    const before = S.imputed.rows.length, after = S.filter.ds.rows.length;
    $("#filterResult").innerHTML = `<div class="stat-row"><div class="stat"><div class="v">${before} → ${after}</div><div class="l">Select Rows 입력 → Matching Data</div></div><div class="stat"><div class="v">${S.filter.removed}</div><div class="l">Unmatched (제거된 데이터)</div></div></div>
      <p style="font-size:.84rem;color:#52514e;margin:0">IQR 규칙: 최솟값 = Q1 − 1.5×IQR, 최댓값 = Q3 + 1.5×IQR. 시간·점수처럼 <b>음수가 될 수 없는 속성은 최솟값을 0</b>으로 조정합니다. ${after < before * 0.6 ? `<br><b style="color:#b26b00">⚠ 데이터가 40% 이상 제거되었습니다. 범위를 조금 넓히는 것을 고려하세요.</b>` : ""}</p>`;
  }

  function renderNorm() {
    const opts = [["none", "정규화 안 함"], ["minmax", "Normalize to interval [0, 1]"], ["zscore", "Standardize to μ=0, σ²=1"]];
    $("#normCtl").innerHTML = opts.map(o => `<label><input type="radio" name="norm" value="${o[0]}" ${S.normMethod === o[0] ? "checked" : ""}> ${o[1]}</label>`).join("");
    $$("input[name=norm]").forEach(r => r.onchange = () => { S.normMethod = r.value; S.exp = null; recompute(); });
    $("#normTable").innerHTML = dataTableHTML(S.norm, 12, 4) + `<p style="font-size:.8rem;color:#86847e;padding:0 8px">Data Table (1) · ${S.norm.rows.length}행</p>`;
    // 모든 수치형 속성을 하나의 공통 축에 그리기 → 정규화 효과가 눈에 보임
    const ds = S.norm, nums = ds.cols.map((c, k) => [c, k]).filter(([c]) => c.type === "num");
    if (!nums.length || !ds.rows.length) { $("#normBox").innerHTML = ""; return; }
    let mn = Infinity, mx = -Infinity;
    nums.forEach(([, k]) => ds.rows.forEach(r => { if (r[k] !== null) { mn = Math.min(mn, r[k]); mx = Math.max(mx, r[k]); } }));
    const W0 = 520, rowH = 44, H0 = 40 + nums.length * rowH, m = { l: 150, r: 16 };
    const xt = ticks(mn, mx, 5), x = scale(Math.min(xt[0], mn), Math.max(xt[xt.length - 1], mx), m.l, W0 - m.r);
    let body = xt.map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="8" y2="${H0 - 24}" stroke="${C.grid}"/><text x="${x(v)}" y="${H0 - 8}" font-size="11" text-anchor="middle" fill="${C.ink3}">${tfmt(v)}</text>`).join("");
    nums.forEach(([c, k], i) => {
      const yM = 26 + i * rowH;
      body += `<text x="${m.l - 8}" y="${yM + 4}" font-size="12" text-anchor="end" fill="${C.ink2}">${esc(c.name.length > 18 ? c.name.slice(0, 17) + "…" : c.name)}</text>` + boxRow(ds.rows.map(r => r[k]), x, yM, 18, C.s3);
    });
    $("#normBox").innerHTML = `<h4 style="margin:0 0 4px">Box Plot (1) · 모든 속성을 같은 축에서 비교</h4>` + svg(W0, H0, body, "정규화 상자그림") +
      `<p style="font-size:.84rem;color:#52514e;margin:2px 0 0">${S.normMethod === "none" ? "정규화 전에는 값의 범위가 큰 속성(예: exercise)이 축을 차지해 다른 속성의 상자가 거의 보이지 않아요. [0, 1] 정규화를 선택해 비교해 보세요." : "정규화 후에는 서로 다른 속성을 같은 척도에서 비교할 수 있어요. 거리 기반 모델(kNN·SVM)의 성능에도 영향을 줍니다."}</p>`;
  }

  // ---------------- 4. 시각화와 분석 ----------------
  function renderStep4() {
    const ds = S.norm, cols = ds.cols.map(c => c.name);
    if (!cols.includes(S.distVar)) S.distVar = cols[0];
    $("#distCtl").innerHTML = `<label>Variable <select id="distVar">${cols.map(n => `<option ${S.distVar === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label>구간 수(Bin) <input type="range" min="3" max="20" value="${S.bins}" id="binR"> <span id="binV">${S.bins}</span></label>`;
    $("#distVar").onchange = e => { S.distVar = e.target.value; renderDist(); };
    $("#binR").oninput = e => { S.bins = +e.target.value; $("#binV").textContent = S.bins; renderDist(); };
    renderDist();
    renderCorr();
  }
  function renderDist() {
    const ds = S.norm, k = ds.cols.findIndex(c => c.name === S.distVar), c = ds.cols[k];
    const vals = ds.rows.map(r => r[k]).filter(v => v !== null);
    const W0 = 760, H0 = 300, m = { l: 50, r: 16, t: 14, b: 46 };
    let bars = [], labels = [];
    if (c.type === "num") {
      const mn = Math.min(...vals), mx = Math.max(...vals), nb = S.bins, w = (mx - mn) / nb || 1;
      bars = new Array(nb).fill(0);
      vals.forEach(v => bars[Math.min(nb - 1, Math.floor((v - mn) / w))]++);
      labels = bars.map((_, i) => [mn + i * w, mn + (i + 1) * w]);
    } else {
      const st = E.catStats(vals, c.values); labels = Object.keys(st.counts); bars = labels.map(l => st.counts[l]);
    }
    const top = Math.max(...bars, 1), yt = ticks(0, top, 5), y = scale(0, Math.max(top, yt[yt.length - 1]), H0 - m.b, m.t);
    const bw = (W0 - m.l - m.r) / bars.length;
    let body = yt.map(v => `<line x1="${m.l}" x2="${W0 - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${m.l - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${C.ink3}">${v}</text>`).join("");
    body += bars.map((b, i) => {
      const lab = c.type === "num" ? `${tfmt(labels[i][0])} ~ ${tfmt(labels[i][1])}` : labels[i];
      const h = H0 - m.b - y(b);
      return `<g data-tip="${esc(lab)}<br>빈도 ${b}개 (${(100 * b / vals.length).toFixed(1)}%)"><rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${H0 - m.b - m.t}" fill="transparent"/>` +
        (b ? `<path d="M${m.l + i * bw + 2} ${H0 - m.b} v${-Math.max(h - 4, 0)} q0 -4 4 -4 h${Math.max(bw - 12, 1)} q4 0 4 4 v${Math.max(h - 4, 0)} z" fill="${c.type === "num" ? C.s1 : C.s2}"/>` : "") + `</g>` +
        (bars.length <= 12 ? `<text x="${m.l + i * bw + bw / 2}" y="${H0 - m.b + 15}" font-size="10.5" text-anchor="middle" fill="${C.ink3}">${esc(c.type === "num" ? tfmt(labels[i][0]) : labels[i])}</text>` : "");
    }).join("");
    body += `<line x1="${m.l}" x2="${W0 - m.r}" y1="${H0 - m.b}" y2="${H0 - m.b}" stroke="${C.line}"/><text x="${(W0) / 2}" y="${H0 - 8}" font-size="12" text-anchor="middle" fill="${C.ink2}">${esc(c.name)}</text><text transform="translate(14 ${(H0 - m.b) / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="${C.ink2}">Frequency</text>`;
    $("#distPlot").innerHTML = svg(W0, H0, body, "분포");
    // 자동 해석
    let txt;
    if (c.type === "num") {
      const st = E.numStats(vals), mi = bars.indexOf(top);
      const span = st.max - st.min || 1, lowHalf = vals.filter(v => v < st.min + span / 2).length;
      const skew = st.mean > st.median + 0.05 * span ? "오른쪽으로 꼬리가 긴(작은 값이 많은)" : st.mean < st.median - 0.05 * span ? "왼쪽으로 꼬리가 긴(큰 값이 많은)" : "비교적 대칭인";
      txt = `• '${c.name}'은(는) ${tfmt(labels[mi][0])} ~ ${tfmt(labels[mi][1])} 구간에 속하는 값이 ${top}개로 가장 많습니다.\n• 하위 절반 구간(${tfmt(st.min)} ~ ${tfmt(st.min + span / 2)})에 ${lowHalf}개(${(100 * lowHalf / vals.length).toFixed(0)}%), 상위 절반 구간에 ${vals.length - lowHalf}개(${(100 * (vals.length - lowHalf) / vals.length).toFixed(0)}%)가 있습니다.\n• 평균 ${tfmt(st.mean)}, 중앙값 ${tfmt(st.median)} → ${skew} 분포입니다.`;
    } else {
      const st = E.catStats(vals, c.values);
      txt = `• '${c.name}'은(는) ${labels.map((l, i) => `${l}: ${bars[i]}개`).join(", ")}입니다.\n• 가장 많은 범주는 '${st.mode}'(${(100 * st.counts[st.mode] / vals.length).toFixed(0)}%)입니다. 범주 간 개수 차이가 크면 결과가 많은 범주에 치우칠 수 있어요.`;
    }
    $("#distText").textContent = txt + "\n\n✍ 이 문장을 참고하여 '그래서 무엇을 알 수 있는지'를 자신의 말로 덧붙여 보세요.";
  }
  function renderCorr() {
    const cs = E.correlations(S.norm);
    if (!cs.length) { $("#corrList").innerHTML = "<p>수치형 속성이 2개 이상 필요합니다.</p>"; $("#corrText").textContent = ""; return; }
    const W0 = 520, rowH = 30, H0 = 30 + cs.length * rowH, mid = 300, half = 190;
    let body = `<line x1="${mid}" x2="${mid}" y1="6" y2="${H0 - 18}" stroke="${C.line}"/>` +
      [-1, -0.5, 0, 0.5, 1].map(v => `<text x="${mid + v * half}" y="${H0 - 4}" font-size="10.5" text-anchor="middle" fill="${C.ink3}">${v}</text>`).join("");
    cs.forEach((p, i) => {
      const yy = 10 + i * rowH, w = Math.abs(p.r || 0) * half, isT = p.a === S.target || p.b === S.target;
      body += `<g data-tip="${esc(p.a)} : ${esc(p.b)}<br>r = ${fmt(p.r)} (${E.corrStrength(p.r)} ${p.r < 0 ? "음의" : "양의"} 상관)">
        <rect x="0" y="${yy - 4}" width="${W0}" height="${rowH}" fill="${isT ? "#f4f2fb" : "transparent"}"/>
        <text x="8" y="${yy + 13}" font-size="11.5" fill="${C.ink2}" font-weight="${isT ? 700 : 400}">${esc((p.a + " : " + p.b).slice(0, 34))}</text>
        <rect x="${p.r < 0 ? mid - w : mid}" y="${yy + 2}" width="${Math.max(w, 1)}" height="16" rx="4" fill="${p.r < 0 ? C.neg : C.pos}"/>
        <text x="${p.r < 0 ? mid - w - 5 : mid + w + 5}" y="${yy + 14}" font-size="11.5" text-anchor="${p.r < 0 ? "end" : "start"}" fill="${C.ink2}">${(p.r > 0 ? "+" : "") + fmt(p.r)}</text></g>`;
    });
    $("#corrList").innerHTML = `<div class="legend"><span><i style="background:${C.neg}"></i>음의 상관(−)</span><span><i style="background:${C.pos}"></i>양의 상관(+)</span><span><i style="background:#f4f2fb;border:1px solid #ddd6f3"></i>target(${esc(S.target || "")}) 관련</span></div>` + svg(W0, H0, body, "상관계수");
    const tgt = cs.filter(p => p.a === S.target || p.b === S.target);
    let txt = `Pearson 상관계수 (|r|이 큰 순서)\n`;
    if (tgt.length) {
      txt += `\n[target '${S.target}'과의 관계]\n` + tgt.map(p => {
        const o = p.a === S.target ? p.b : p.a;
        return `• ${o}: r = ${fmt(p.r)} → ${E.corrStrength(p.r)} ${p.r < 0 ? "음의" : "양의"} 상관관계${Math.abs(p.r) >= 0.2 ? (p.r < 0 ? ` (${o}이(가) 클수록 ${S.target}이(가) 작은 경향)` : ` (${o}이(가) 클수록 ${S.target}도 큰 경향)`) : ""}`;
      }).join("\n");
      const strong = tgt.filter(p => Math.abs(p.r) >= 0.2).map(p => p.a === S.target ? p.b : p.a);
      txt += `\n\n→ 모델링에 우선 사용할 속성 후보: ${strong.length ? strong.join(", ") : "(뚜렷한 속성 없음 — 속성 추가 수집을 고려)"}`;
    } else txt += "\n(target이 범주형이거나 선택되지 않아 target 관련 상관계수를 표시하지 않습니다.)";
    txt += `\n\n⚠ 상관관계는 인과관계가 아닙니다. '수면 시간이 적어서 스트레스가 높다'고 단정할 수 없어요.`;
    $("#corrText").textContent = txt;
  }

  // ---------------- 5. 모델링 ----------------
  function renderStep5() {
    const cols = S.norm.cols;
    const task = S.types[S.target] === "num" ? "regression" : "classification";
    $("#roleEditor").innerHTML = `<h4 style="margin:0 0 6px">Select Columns 위젯</h4><table class="t"><thead><tr><th>속성</th><th>유형</th><th>Target</th><th>Feature</th><th>Ignored</th></tr></thead><tbody>${
      cols.map(c => {
        const role = c.name === S.target ? "t" : (S.features.includes(c.name) ? "f" : "i");
        return `<tr><td>${esc(c.name)}</td><td>${c.type === "num" ? "N" : "C"}</td>${["t", "f", "i"].map(r => `<td><input type="radio" name="role_${esc(c.name)}" data-role="${r}" data-col="${esc(c.name)}" ${role === r ? "checked" : ""}></td>`).join("")}</tr>`;
      }).join("")}</tbody></table>
      <div class="note ${task === "regression" ? "" : "good"}" style="margin-top:10px">target <b>${esc(S.target)}</b>은(는) ${task === "regression" ? "<b>수치형 → 회귀(Regression)</b> 문제입니다. MSE·RMSE·MAE·R²로 평가합니다." : "<b>범주형 → 분류(Classification)</b> 문제입니다. CA·F1·Precision·Recall로 평가합니다."}</div>`;
    $$("[data-role]").forEach(r => r.onchange = () => {
      const col = r.dataset.col, role = r.dataset.role;
      S.features = S.features.filter(f => f !== col);
      if (role === "t") { if (S.target && S.target !== col) S.features.push(S.target); S.target = col; S.features = S.features.filter(f => f !== col); syncModels(); }
      else if (role === "f") { S.features.push(col); if (S.target === col) S.target = null; }
      else if (S.target === col) S.target = null;
      S.exp = null; renderAll();
    });
    $("#samplerCtl").innerHTML = `<h4 style="margin:0">Data Sampler 위젯</h4>
      <label>Fixed proportion of data (훈련 데이터 비율) <input type="range" min="50" max="90" step="5" value="${S.ratio * 100}" id="ratioR"> <b id="ratioV">${Math.round(S.ratio * 100)}%</b></label>
      <label>무작위 시드(seed) <input type="number" id="seedIn" value="${S.seed}"> <span style="font-size:.8rem;color:#86847e">같은 시드 = 같은 분할 (Replicable sampling)</span></label>
      <label><input type="checkbox" id="stratIn" ${S.stratify ? "checked" : ""}> Stratify sample (분류 문제에서 범주 비율 유지)</label>
      <label>Test and Score · Cross validation folds <select id="foldIn">${[3, 5, 10].map(f => `<option ${S.folds === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>`;
    const n = S.norm.rows.length;
    $("#ratioR").oninput = e => { S.ratio = +e.target.value / 100; $("#ratioV").textContent = e.target.value + "% (" + Math.round(n * S.ratio) + " | " + (n - Math.round(n * S.ratio)) + ")"; };
    $("#ratioV").textContent = Math.round(S.ratio * 100) + "% (" + Math.round(n * S.ratio) + " | " + (n - Math.round(n * S.ratio)) + ")";
    $("#seedIn").onchange = e => S.seed = parseInt(e.target.value) || 1;
    $("#stratIn").onchange = e => S.stratify = e.target.checked;
    $("#foldIn").onchange = e => S.folds = +e.target.value;
    $("#modelPick").innerHTML = `<h4 style="margin:10px 0 4px">Model 위젯</h4>` + E.MODEL_INFO[task].map(m => `<label style="display:inline-flex;gap:4px;margin-right:12px"><input type="checkbox" data-model="${m.id}" ${S.models.includes(m.id) ? "checked" : ""}> ${m.name}</label>`).join("");
    $$("[data-model]").forEach(c => c.onchange = () => { S.models = $$("[data-model]").filter(x => x.checked).map(x => x.dataset.model); });
    $("#trainBtn").onclick = train;
  }
  function train() {
    const msg = $("#trainMsg");
    if (!S.target) { msg.innerHTML = `<span style="color:#c62828">Target을 1개 선택하세요.</span>`; return; }
    if (!S.features.length) { msg.innerHTML = `<span style="color:#c62828">Feature를 1개 이상 선택하세요.</span>`; return; }
    if (!S.models.length) { msg.innerHTML = `<span style="color:#c62828">모델을 1개 이상 선택하세요.</span>`; return; }
    msg.textContent = "학습 중…";
    setTimeout(() => {
      try {
        S.exp = E.experiment(S.norm, { features: S.features, target: S.target, ratio: S.ratio, seed: S.seed, stratify: S.stratify, folds: S.folds, models: S.models });
        S.exp.settings = { features: S.features.slice(), target: S.target, ratio: S.ratio, seed: S.seed, folds: S.folds };
        msg.innerHTML = `✅ 학습 완료! 훈련 ${S.exp.nTrain}개 · 테스트 ${S.exp.nTest}개 <button class="btn" data-go="6" style="margin-left:8px">⑥ 평가 결과 보기 →</button>`;
        renderStep6();
      } catch (e) { msg.innerHTML = `<span style="color:#c62828">오류: ${esc(e.message)}</span>`; }
    }, 30);
  }

  // ---------------- 6. 평가 ----------------
  function bestOf(exp, which) {
    const key = exp.task === "regression" ? "R2" : "CA";
    let best = null;
    exp.results.forEach(r => { const v = r[which] && r[which][key]; if (v !== undefined && !isNaN(v) && (!best || v > best[which][key])) best = r; });
    return best;
  }
  function renderStep6() {
    const el = $("#evalArea"), exp = S.exp;
    if (!exp) { el.innerHTML = `<p class="note">⑤ 데이터 모델링 단계에서 <b>▶ 모델 학습하고 평가하기</b>를 먼저 눌러 주세요.</p>`; return; }
    const reg = exp.task === "regression";
    const keys = reg ? ["MSE", "RMSE", "MAE", "R2"] : ["CA", "F1", "Precision", "Recall"];
    const bcv = bestOf(exp, "cv"), bte = bestOf(exp, "test");
    const table = (which, title, best) => `<h4 style="margin:6px 0">${title}</h4><table class="t"><thead><tr><th>Model</th>${keys.map(k => `<th class="num">${k === "R2" ? "R²" : k}</th>`).join("")}</tr></thead><tbody>${
      exp.results.map(r => `<tr class="${best && r.id === best.id ? "best" : ""}"><td>${r.name}${best && r.id === best.id ? " 🏆" : ""}</td>${keys.map(k => `<td class="num">${r[which] ? fmt(r[which][k]) : "-"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    // 막대 그래프: R² 또는 CA (교차검증 vs 테스트)
    const key = reg ? "R2" : "CA";
    const W0 = 560, H0 = 260, m = { l: 46, r: 12, t: 16, b: 40 };
    const vals = exp.results.flatMap(r => [r.cv[key], r.test ? r.test[key] : 0]).filter(v => !isNaN(v));
    const lo = Math.min(0, ...vals), hi = Math.max(reg ? 0.1 : 1, ...vals);
    const yt = ticks(lo, hi, 5), y = scale(Math.min(lo, yt[0]), Math.max(hi, yt[yt.length - 1]), H0 - m.b, m.t);
    const gw = (W0 - m.l - m.r) / exp.results.length, bw = Math.min(34, gw / 3);
    let body = yt.map(v => `<line x1="${m.l}" x2="${W0 - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? C.line : C.grid}"/><text x="${m.l - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${C.ink3}">${tfmt(v)}</text>`).join("");
    exp.results.forEach((r, i) => {
      const cx = m.l + gw * i + gw / 2;
      [[r.cv[key], C.s1, "교차 검증"], [r.test ? r.test[key] : NaN, C.s2, "테스트 데이터"]].forEach(([v, col, lab], j) => {
        if (isNaN(v)) return;
        const x0 = cx - bw - 1 + j * (bw + 2), y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
        body += `<rect x="${x0}" y="${y0}" width="${bw}" height="${Math.max(1, y1 - y0)}" rx="3" fill="${col}" data-tip="${r.name}<br>${lab} ${key === "R2" ? "R²" : key} = ${fmt(v)}"/>`;
      });
      body += `<text x="${cx}" y="${H0 - m.b + 16}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">${r.name}</text>`;
    });
    const chart = `<div class="legend"><span><i style="background:${C.s1}"></i>교차 검증 (훈련 ${exp.nTrain}개, ${S.exp.settings.folds}-fold)</span><span><i style="background:${C.s2}"></i>테스트 데이터 (${exp.nTest}개)</span></div>` + svg(W0, H0, body, "모델 성능 비교");
    // 실제 vs 예측 또는 혼동 행렬
    const pick = bte || exp.results[0];
    let detail = "";
    if (reg && exp.nTest) {
      const yt2 = exp.yte, yp = pick.preds, all = yt2.concat(yp), mn = Math.min(...all), mx = Math.max(...all);
      const W1 = 360, H1 = 300, mm = 44, sx = scale(mn, mx, mm, W1 - 14), sy = scale(mn, mx, H1 - mm, 14);
      let b2 = `<line x1="${sx(mn)}" y1="${sy(mn)}" x2="${sx(mx)}" y2="${sy(mx)}" stroke="${C.line}" stroke-dasharray="5 4"/>` +
        ticks(mn, mx, 4).map(v => `<text x="${sx(v)}" y="${H1 - mm + 16}" font-size="10.5" text-anchor="middle" fill="${C.ink3}">${tfmt(v)}</text><text x="${mm - 6}" y="${sy(v) + 4}" font-size="10.5" text-anchor="end" fill="${C.ink3}">${tfmt(v)}</text>`).join("") +
        yt2.map((v, i) => `<circle cx="${sx(v)}" cy="${sy(yp[i])}" r="5.5" fill="${C.s1}" fill-opacity=".85" stroke="#fff" stroke-width="1.5" data-tip="실제 ${tfmt(v)} · 예측 ${tfmt(yp[i])}<br>오차 ${tfmt(yp[i] - v)}"/>`).join("") +
        `<text x="${W1 / 2}" y="${H1 - 6}" font-size="11.5" text-anchor="middle" fill="${C.ink2}">실제값 (${esc(S.exp.settings.target)})</text><text transform="translate(12 ${H1 / 2}) rotate(-90)" font-size="11.5" text-anchor="middle" fill="${C.ink2}">예측값</text>`;
      detail = `<h4 style="margin:6px 0">Predictions · ${pick.name} (테스트 데이터)</h4>` + svg(W1, H1, b2, "실제값과 예측값") + `<p style="font-size:.82rem;color:#86847e;margin:0">점선에 가까울수록 정확하게 예측한 것</p>`;
    } else if (!reg && exp.nTest) {
      const cm = pick.test.cm, cls = exp.classes, mxv = Math.max(...cm.flat(), 1);
      detail = `<h4 style="margin:6px 0">혼동 행렬 (Confusion Matrix) · ${pick.name}</h4><table class="t"><thead><tr><th>실제 ↓ / 예측 →</th>${cls.map(c => `<th class="num">${esc(c)}</th>`).join("")}</tr></thead><tbody>${
        cm.map((r, i) => `<tr><th>${esc(cls[i])}</th>${r.map((v, j) => `<td class="num" style="background:${v ? seqColor(0.15 + 0.7 * v / mxv) : "#fff"};color:${v / mxv > 0.5 ? "#fff" : "#0b0b0b"};font-weight:${i === j ? 700 : 400}">${v}</td>`).join("")}</tr>`).join("")}</tbody></table><p style="font-size:.82rem;color:#86847e">대각선(굵은 숫자)이 맞힌 개수입니다.</p>`;
    }
    // 선형 회귀 계수
    let coefHTML = "";
    const lr = exp.results.find(r => r.id === "lr");
    if (lr) {
      const co = lr.model.coef;
      const order = exp.names.map((n, i) => [n, co[i + 1]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      coefHTML = `<h4 style="margin:12px 0 6px">Linear Regression 계수 (모델이 알려 주는 것)</h4><table class="t"><thead><tr><th>속성</th><th class="num">계수</th><th>해석</th></tr></thead><tbody>${
        order.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${(v > 0 ? "+" : "") + fmt(v)}</td><td style="font-size:.85rem">${n}이(가) 1 늘면 ${S.exp.settings.target} 예측값이 ${fmt(Math.abs(v))} ${v > 0 ? "증가" : "감소"}</td></tr>`).join("")}
        <tr><td>(절편)</td><td class="num">${fmt(co[0])}</td><td></td></tr></tbody></table>
        <p style="font-size:.82rem;color:#86847e;margin:4px 0 0">${S.normMethod === "minmax" ? "정규화(0~1)된 값 기준이라 계수의 크기를 속성끼리 비교할 수 있어요. 절댓값이 클수록 예측에 큰 영향을 줍니다." : "정규화하지 않았다면 단위가 달라 계수 크기를 직접 비교하기 어렵습니다."}</p>`;
    }
    el.innerHTML = `<div class="grid2"><div>${table("cv", `Test and Score · Cross validation (훈련 데이터 ${exp.nTrain}개)`, bcv)}${exp.nTest ? table("test", `테스트 데이터 평가 (Remaining Data ${exp.nTest}개)`, bte) : ""}</div><div>${chart}</div></div>
      <div class="grid2" style="margin-top:10px"><div>${detail}</div><div>${coefHTML}<h4 style="margin:12px 0 6px">결과 해석 (초안)</h4><div class="result-text">${esc(interpret(exp))}</div></div></div>`;
  }
  function interpret(exp) {
    const reg = exp.task === "regression", key = reg ? "R2" : "CA", kname = reg ? "R²" : "정확도(CA)";
    const bcv = bestOf(exp, "cv"), bte = bestOf(exp, "test");
    const lines = [];
    if (bcv) lines.push(`• 교차 검증 기준 ${kname}가 가장 높은 모델은 ${bcv.name}(${fmt(bcv.cv[key])})입니다.` + (reg ? ` 이 모델의 MSE는 ${fmt(bcv.cv.MSE)}, RMSE는 ${fmt(bcv.cv.RMSE)}입니다.` : ` F1은 ${fmt(bcv.cv.F1)}입니다.`));
    if (bte && exp.nTest) lines.push(`• 처음 보는 테스트 데이터(${exp.nTest}개)에서는 ${bte.name}의 ${kname}가 ${fmt(bte.test[key])}로 가장 높았습니다.`);
    const worst = exp.results.slice().sort((a, b) => (a.cv[key] || 0) - (b.cv[key] || 0))[0];
    if (worst && bcv && worst.id !== bcv.id) lines.push(`• ${worst.name}은(는) ${kname} ${fmt(worst.cv[key])}로 상대적으로 낮았습니다.`);
    if (reg && bcv) {
      const r2 = bcv.cv.R2;
      lines.push(r2 >= 0.7 ? "• R²가 0.7 이상으로 선택한 속성들이 target을 잘 설명합니다." : r2 >= 0.4 ? "• R²가 0.4~0.7로 어느 정도 설명력이 있지만, 다른 요인(속성)도 스트레스에 영향을 줄 수 있습니다." : r2 > 0 ? "• R²가 낮아 선택한 속성만으로는 target을 충분히 설명하기 어렵습니다. 속성 추가 수집을 고려하세요." : "• R²가 0 이하로, 평균값으로 예측하는 것보다 못합니다. 속성 선택·전처리를 다시 점검하세요.");
    }
    exp.results.forEach(r => { if (r.test && r.cv[key] - r.test[key] > 0.15) lines.push(`• ${r.name}: 교차 검증보다 테스트 성능이 크게 낮아 과적합 가능성이 있습니다.`); });
    if (exp.nTrain + exp.nTest < 100) lines.push(`• 전체 데이터가 ${exp.nTrain + exp.nTest}개로 적어서, 분할(seed)에 따라 결과가 달라질 수 있습니다. seed를 바꿔 여러 번 확인해 보세요.`);
    lines.push("• 한계: 특정 집단의 자기 보고(설문) 데이터이므로 일반화에 주의하고, 상관관계를 인과관계로 해석하지 않습니다.");
    return lines.join("\n");
  }

  // ---------------- 7. 마무리 ----------------
  function renderStep7() {
    const R = [["문제 정의", "데이터에 기반하여 해결할 수 있는 문제를 선정하고 정의하였는가?"], ["데이터 수집", "문제와 관련된 데이터를 수집하고, 수집 시 확인할 내용(법적·윤리적, 품질)을 반영하였는가?"],
      ["데이터 전처리", "데이터를 시각화·분석·모델링에 필요한 형태로 전처리할 수 있는가?"], ["데이터 시각화와 분석", "문제 해결을 위해 적절한 방법으로 데이터를 시각화하고 분석할 수 있는가?"],
      ["데이터 모델링", "문제 해결을 위해 필요한 데이터 모델을 선정하고 모델링할 수 있는가?"], ["평가", "데이터 모델의 성능을 평가하고 결과를 해석할 수 있는가?"]];
    const saved = JSON.parse(localStorage.getItem("rubric") || "{}");
    $("#rubric").innerHTML = R.map((r, i) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td>${["우수", "보통", "미흡"].map(v => `<td><input type="radio" name="rb${i}" value="${v}" ${saved[i] === v ? "checked" : ""}></td>`).join("")}</tr>`).join("");
    $$("#rubric input").forEach(inp => inp.onchange = () => { const s = JSON.parse(localStorage.getItem("rubric") || "{}"); s[inp.name.slice(2)] = inp.value; localStorage.setItem("rubric", JSON.stringify(s)); });
  }
  // ---------------- 렌더링 ----------------
  function renderAll() {
    renderDatasetBar(); renderStep2(); renderStep3(); renderStep4(); renderStep5(); renderStep6();
  }
  async function loadSample() {
    let text = window.SAMPLE_CSV;
    try { const r = await fetch("daily_data.csv", { cache: "no-store" }); if (r.ok) text = await r.text(); } catch (e) { /* file:// 에서는 내장 데이터 사용 */ }
    if (!text) { alert("예제 데이터를 불러올 수 없습니다."); return; }
    loadText(text, "daily_data.csv (예제)", true);
    if (/[?&]demo/.test(location.search) && !S.exp) { S.types.grade = "cat"; recompute(); train(); }
  }

  // 오렌지 따라 하기: 단계별 체크 + 진행률
  function setupHowto() {
    $$("section.page").forEach(sec => {
      const st = sec.dataset.step;
      sec.querySelectorAll("ol.howto").forEach((ol, oi) => {
        if (st === "0") return;
        const key = "howto" + st + "_" + oi, saved = JSON.parse(localStorage.getItem(key) || "[]");
        ol.classList.add("tasks");
        const bar = document.createElement("div");
        bar.className = "taskbar";
        ol.parentNode.insertBefore(bar, ol);
        const upd = () => {
          const lis = [...ol.children], n = lis.filter(l => l.querySelector("input").checked).length;
          bar.innerHTML = `<span>실습 진행 ${n} / ${lis.length}</span><i><b style="width:${n / lis.length * 100}%"></b></i>${n === lis.length ? " 🎉 이 단계 완료!" : ""}`;
          localStorage.setItem(key, JSON.stringify(lis.map(l => l.querySelector("input").checked)));
        };
        [...ol.children].forEach((li, i) => {
          const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!saved[i]; cb.onchange = upd;
          li.prepend(cb);
        });
        upd();
      });
    });
  }

  // 시작
  const h = parseInt((location.hash || "").replace("#s", ""));
  if (!isNaN(h) && h >= 0 && h <= 7) S.step = h;
  renderFlows(); renderStep1(); renderStep7(); setupHowto(); renderNav();
  loadSample();
})();
