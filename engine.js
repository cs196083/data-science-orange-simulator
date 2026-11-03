/* 데이터 과학 프로젝트 시뮬레이터 - 계산 엔진 (전처리, 통계, 기계학습 모델, 평가)
   브라우저와 Node 양쪽에서 동작합니다. */
(function (root) {
  "use strict";

  // ---------- 난수 (재현 가능한 샘플링: Orange의 Replicable sampling과 같은 역할) ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delim = (firstLine.split("\t").length > firstLine.split(",").length) ? "\t"
      : (firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some(v => v.trim() !== "")) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(v => v.trim() !== "")) rows.push(row);
    if (!rows.length) throw new Error("빈 파일입니다.");
    const header = rows[0].map((h, i) => (h.trim() || ("col" + (i + 1))));
    const body = rows.slice(1).map(r => header.map((_, i) => (r[i] === undefined ? "" : r[i].trim())));
    return { header, body };
  }

  const MISSING = new Set(["", "?", "NA", "N/A", "na", "nan", "NaN", "null", "NULL", "-"]);
  function isMissing(v) { return v === null || v === undefined || (typeof v === "number" && isNaN(v)) || (typeof v === "string" && MISSING.has(v.trim())); }

  // 열 유형 추정: 숫자로 변환 가능하면 numeric, 아니면 categorical
  function inferTypes(parsed) {
    const types = {};
    parsed.header.forEach((h, i) => {
      const vals = parsed.body.map(r => r[i]).filter(v => !isMissing(v));
      const num = vals.length > 0 && vals.every(v => !isNaN(Number(v.replace(/,/g, ""))));
      types[h] = num ? "num" : "cat";
    });
    return types;
  }

  // parsed + types -> 표준 데이터셋 {cols:[{name,type,values?}], rows:[[...]]}
  function buildDataset(parsed, types, skip) {
    skip = skip || {};
    const cols = parsed.header.filter(h => !skip[h]).map(h => ({ name: h, type: types[h] }));
    const idx = cols.map(c => parsed.header.indexOf(c.name));
    const rows = parsed.body.map(r => idx.map((j, k) => {
      const v = r[j];
      if (isMissing(v)) return null;
      if (cols[k].type === "num") { const n = Number(String(v).replace(/,/g, "")); return isNaN(n) ? null : n; }
      return String(v);
    }));
    cols.forEach((c, k) => {
      if (c.type === "cat") {
        const set = new Set(rows.map(r => r[k]).filter(v => v !== null));
        c.values = Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "ko", { numeric: true }));
      }
    });
    return { cols, rows };
  }

  function column(ds, name) { const k = ds.cols.findIndex(c => c.name === name); return ds.rows.map(r => r[k]); }

  // ---------- 기술 통계 ----------
  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function numStats(values) {
    const v = values.filter(x => x !== null && !isNaN(x));
    const s = v.slice().sort((a, b) => a - b);
    const n = v.length, mean = n ? v.reduce((a, b) => a + b, 0) / n : NaN;
    const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
    const counts = {};
    v.forEach(x => counts[x] = (counts[x] || 0) + 1);
    let mode = NaN, mc = 0;
    Object.keys(counts).forEach(k => { if (counts[k] > mc) { mc = counts[k]; mode = Number(k); } });
    return {
      n, missing: values.length - n, mean, sd, min: s[0], max: s[n - 1], median: quantile(s, 0.5),
      q1, q3, iqr, lowFence: q1 - 1.5 * iqr, highFence: q3 + 1.5 * iqr, mode,
      dispersion: mean ? sd / Math.abs(mean) : 0
    };
  }
  function catStats(values, cats) {
    const v = values.filter(x => x !== null);
    const counts = {};
    (cats || []).forEach(c => counts[c] = 0);
    v.forEach(x => counts[x] = (counts[x] || 0) + 1);
    let mode = null, mc = -1;
    Object.keys(counts).forEach(k => { if (counts[k] > mc) { mc = counts[k]; mode = k; } });
    return { n: v.length, missing: values.length - v.length, counts, mode };
  }
  function missingInfo(ds) {
    let miss = 0;
    ds.rows.forEach(r => r.forEach(v => { if (v === null) miss++; }));
    const cells = ds.rows.length * ds.cols.length;
    return { missing: miss, cells, pct: cells ? (100 * miss / cells) : 0, rowsWithMissing: ds.rows.filter(r => r.some(v => v === null)).length };
  }

  // ---------- 전처리 ----------
  // method: none | drop | mean (수치형 평균, 범주형 최빈값) | median
  function impute(ds, method) {
    if (method === "none") return { cols: ds.cols, rows: ds.rows.map(r => r.slice()) };
    if (method === "drop") return { cols: ds.cols, rows: ds.rows.filter(r => r.every(v => v !== null)).map(r => r.slice()) };
    const fill = ds.cols.map((c, k) => {
      const vals = ds.rows.map(r => r[k]);
      if (c.type === "num") { const st = numStats(vals); return method === "median" ? st.median : st.mean; }
      return catStats(vals, c.values).mode;
    });
    return { cols: ds.cols, rows: ds.rows.map(r => r.map((v, k) => (v === null ? fill[k] : v))) };
  }

  // ranges: {colName: [lo, hi]} (수치형만) -> Select Rows 의 "is between" 조건
  function filterRows(ds, ranges) {
    const active = ds.cols.map((c, k) => [k, ranges[c.name]]).filter(([, r]) => r && c_ok(r));
    function c_ok(r) { return r.length === 2 && !isNaN(r[0]) && !isNaN(r[1]); }
    const kept = [], removed = [];
    ds.rows.forEach(r => {
      const ok = active.every(([k, rg]) => r[k] === null || (r[k] >= rg[0] && r[k] <= rg[1]));
      (ok ? kept : removed).push(r);
    });
    return { ds: { cols: ds.cols, rows: kept }, removed: removed.length };
  }

  // IQR 기반 이상치 확인 범위 제안 (음수가 불가능한 속성은 하한 0으로)
  function suggestRanges(ds) {
    const out = {};
    ds.cols.forEach((c, k) => {
      if (c.type !== "num") return;
      const st = numStats(ds.rows.map(r => r[k]));
      let lo = st.lowFence, hi = st.highFence;
      if (st.min >= 0 && lo < 0) lo = 0;
      out[c.name] = [round(lo, 3), round(hi, 3)];
    });
    return out;
  }

  // method: none | minmax ([0,1]) | zscore (평균0, 분산1). exclude: 정규화 제외할 열 이름 목록
  function normalize(ds, method, exclude) {
    exclude = exclude || [];
    if (method === "none") return { ds, params: {} };
    const params = {};
    ds.cols.forEach((c, k) => {
      if (c.type !== "num" || exclude.indexOf(c.name) >= 0) return;
      const st = numStats(ds.rows.map(r => r[k]));
      params[c.name] = method === "minmax" ? { a: st.min, b: (st.max - st.min) || 1 } : { a: st.mean, b: st.sd || 1 };
    });
    const rows = ds.rows.map(r => r.map((v, k) => {
      const p = params[ds.cols[k].name];
      return (p && v !== null) ? (v - p.a) / p.b : v;
    }));
    return { ds: { cols: ds.cols, rows }, params };
  }

  // ---------- 상관 분석 (Pearson) ----------
  function pearson(x, y) {
    const pairs = [];
    for (let i = 0; i < x.length; i++) if (x[i] !== null && y[i] !== null) pairs.push([x[i], y[i]]);
    const n = pairs.length;
    if (n < 3) return NaN;
    const mx = pairs.reduce((a, p) => a + p[0], 0) / n, my = pairs.reduce((a, p) => a + p[1], 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    pairs.forEach(([a, b]) => { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; });
    return (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : NaN;
  }
  function correlations(ds) {
    const num = ds.cols.map((c, k) => [c, k]).filter(([c]) => c.type === "num");
    const out = [];
    for (let i = 0; i < num.length; i++) for (let j = i + 1; j < num.length; j++) {
      const r = pearson(ds.rows.map(row => row[num[i][1]]), ds.rows.map(row => row[num[j][1]]));
      out.push({ a: num[i][0].name, b: num[j][0].name, r });
    }
    return out.sort((p, q) => Math.abs(q.r || 0) - Math.abs(p.r || 0));
  }
  function corrStrength(r) {
    const a = Math.abs(r);
    if (isNaN(a)) return "계산 불가";
    if (a >= 0.7) return "강한";
    if (a >= 0.4) return "중간 정도의";
    if (a >= 0.2) return "약한";
    return "거의 없는";
  }

  // ---------- 모델 입력 행렬 ----------
  // 범주형 feature 는 원-핫 인코딩 (Orange의 Continuize 와 같은 역할)
  function design(ds, features, target) {
    const fk = features.map(f => ds.cols.findIndex(c => c.name === f));
    const tk = ds.cols.findIndex(c => c.name === target);
    const tcol = ds.cols[tk];
    const rows = ds.rows.filter(r => r[tk] !== null && fk.every(k => r[k] !== null));
    const names = [];
    const encoders = fk.map(k => {
      const c = ds.cols[k];
      if (c.type === "num") { names.push(c.name); return v => [v]; }
      const vals = c.values.slice(1); // 첫 범주는 기준(drop-first)
      vals.forEach(v => names.push(c.name + "=" + v));
      return v => vals.map(x => (v === x ? 1 : 0));
    });
    const X = rows.map(r => fk.reduce((acc, k, i) => acc.concat(encoders[i](r[k])), []));
    let y, classes = null;
    if (tcol.type === "num") y = rows.map(r => r[tk]);
    else { classes = tcol.values.slice(); y = rows.map(r => classes.indexOf(r[tk])); }
    return { X, y, names, task: tcol.type === "num" ? "regression" : "classification", classes };
  }

  function splitIdx(n, ratio, seed, y, stratify) {
    const rand = rng(seed);
    if (stratify && y) {
      const groups = {};
      y.forEach((v, i) => (groups[v] = groups[v] || []).push(i));
      const tr = [], te = [];
      Object.keys(groups).forEach(g => {
        const idx = shuffle(groups[g], rand);
        const k = Math.round(idx.length * ratio);
        tr.push(...idx.slice(0, k)); te.push(...idx.slice(k));
      });
      return { train: shuffle(tr, rand), test: shuffle(te, rand) };
    }
    const idx = shuffle([...Array(n).keys()], rand);
    const k = Math.round(n * ratio);
    return { train: idx.slice(0, k), test: idx.slice(k) };
  }

  // ---------- 선형 대수 ----------
  function solve(A, b) {
    const n = A.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) if (r !== c) {
        const f = M[r][c] / d;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / (r[i] || 1e-12));
  }
  function standardizer(X) {
    const p = X[0] ? X[0].length : 0;
    const mu = [], sd = [];
    for (let j = 0; j < p; j++) {
      const col = X.map(r => r[j]);
      const m = col.reduce((a, b) => a + b, 0) / col.length;
      const s = Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length) || 1;
      mu.push(m); sd.push(s);
    }
    return { f: x => x.map((v, j) => (v - mu[j]) / sd[j]), mu, sd };
  }

  // ---------- 모델: 회귀 ----------
  function LinearRegression() {
    return {
      name: "Linear Regression",
      fit(X, y) {
        const p = X[0].length, A = [], b = [];
        const Xa = X.map(r => [1].concat(r));
        for (let i = 0; i <= p; i++) {
          A.push([]);
          for (let j = 0; j <= p; j++) A[i].push(Xa.reduce((s, r) => s + r[i] * r[j], 0) + (i === j && i > 0 ? 1e-8 : 0));
          b.push(Xa.reduce((s, r, k) => s + r[i] * y[k], 0));
        }
        this.coef = solve(A, b);
        return this;
      },
      predict(x) { return this.coef[0] + x.reduce((s, v, j) => s + v * this.coef[j + 1], 0); }
    };
  }

  function kNN(k, task, nClasses) {
    return {
      name: "kNN",
      fit(X, y) { this.X = X; this.y = y; return this; },
      predict(x) {
        const d = this.X.map((r, i) => [r.reduce((s, v, j) => s + (v - x[j]) ** 2, 0), this.y[i]]);
        d.sort((a, b) => a[0] - b[0]);
        const nb = d.slice(0, Math.min(k, d.length));
        if (task === "regression") return nb.reduce((s, a) => s + a[1], 0) / nb.length;
        const votes = new Array(nClasses).fill(0);
        nb.forEach(a => votes[a[1]]++);
        return votes.map(v => v / nb.length);
      }
    };
  }

  // 결정 트리 (CART). task: regression | classification
  function buildTree(X, y, idx, depth, o, rand) {
    const leaf = () => {
      if (o.task === "regression") return { leaf: true, v: idx.reduce((s, i) => s + y[i], 0) / idx.length };
      const c = new Array(o.nClasses).fill(0);
      idx.forEach(i => c[y[i]]++);
      return { leaf: true, v: c.map(x => x / idx.length) };
    };
    if (depth >= o.maxDepth || idx.length < 2 * o.minLeaf) return leaf();
    if (o.task === "classification" && idx.every(i => y[i] === y[idx[0]])) return leaf();
    const p = X[0].length;
    let feats = [...Array(p).keys()];
    if (o.mtry && o.mtry < p) feats = shuffle(feats, rand).slice(0, o.mtry);
    let best = null;
    feats.forEach(f => {
      const s = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
      const n = s.length;
      if (o.task === "regression") {
        let sumL = 0, sqL = 0, sumT = 0, sqT = 0;
        s.forEach(i => { sumT += y[i]; sqT += y[i] * y[i]; });
        for (let k = 0; k < n - 1; k++) {
          const v = y[s[k]]; sumL += v; sqL += v * v;
          const nl = k + 1, nr = n - nl;
          if (nl < o.minLeaf || nr < o.minLeaf || X[s[k]][f] === X[s[k + 1]][f]) continue;
          const sse = (sqL - sumL * sumL / nl) + ((sqT - sqL) - (sumT - sumL) ** 2 / nr);
          if (!best || sse < best.score) best = { score: sse, f, t: (X[s[k]][f] + X[s[k + 1]][f]) / 2 };
        }
      } else {
        const L = new Array(o.nClasses).fill(0), T = new Array(o.nClasses).fill(0);
        s.forEach(i => T[y[i]]++);
        for (let k = 0; k < n - 1; k++) {
          L[y[s[k]]]++;
          const nl = k + 1, nr = n - nl;
          if (nl < o.minLeaf || nr < o.minLeaf || X[s[k]][f] === X[s[k + 1]][f]) continue;
          let gl = 1, gr = 1;
          for (let c = 0; c < o.nClasses; c++) { gl -= (L[c] / nl) ** 2; gr -= ((T[c] - L[c]) / nr) ** 2; }
          const g = nl * gl + nr * gr;
          if (!best || g < best.score) best = { score: g, f, t: (X[s[k]][f] + X[s[k + 1]][f]) / 2 };
        }
      }
    });
    if (!best) return leaf();
    const li = idx.filter(i => X[i][best.f] <= best.t), ri = idx.filter(i => X[i][best.f] > best.t);
    return { f: best.f, t: best.t, l: buildTree(X, y, li, depth + 1, o, rand), r: buildTree(X, y, ri, depth + 1, o, rand) };
  }
  function treePredict(n, x) { while (!n.leaf) n = x[n.f] <= n.t ? n.l : n.r; return n.v; }

  function RandomForest(task, nClasses, seed) {
    return {
      name: "Random Forest",
      fit(X, y) {
        const rand = rng(seed || 7), p = X[0].length;
        const mtry = task === "regression" ? Math.max(1, Math.round(p / 3)) : Math.max(1, Math.round(Math.sqrt(p)));
        this.trees = [];
        for (let t = 0; t < 30; t++) {
          const boot = X.map(() => Math.floor(rand() * X.length));
          this.trees.push(buildTree(X, y, boot, 0, { task, nClasses, maxDepth: 8, minLeaf: 2, mtry: p > 1 ? mtry : 0 }, rand));
        }
        return this;
      },
      predict(x) {
        const ps = this.trees.map(t => treePredict(t, x));
        if (task === "regression") return ps.reduce((a, b) => a + b, 0) / ps.length;
        const avg = new Array(nClasses).fill(0);
        ps.forEach(p => p.forEach((v, c) => avg[c] += v / ps.length));
        return avg;
      }
    };
  }

  // SVM 회귀: 선형 커널 epsilon-SVR (경사 하강법)
  function SVR() {
    return {
      name: "SVM",
      fit(X, y) {
        this.sx = standardizer(X);
        const Z = X.map(this.sx.f);
        const my = y.reduce((a, b) => a + b, 0) / y.length;
        const sy = Math.sqrt(y.reduce((a, b) => a + (b - my) ** 2, 0) / y.length) || 1;
        this.my = my; this.sy = sy;
        const t = y.map(v => (v - my) / sy);
        const p = Z[0].length, eps = 0.1, C = 1, lr0 = 0.05;
        let w = new Array(p).fill(0), b = 0;
        for (let ep = 0; ep < 400; ep++) {
          const lr = lr0 / (1 + ep * 0.02);
          const gw = w.map(v => v / (C * Z.length)); let gb = 0;
          Z.forEach((z, i) => {
            const e = z.reduce((s, v, j) => s + v * w[j], b) - t[i];
            if (Math.abs(e) > eps) { const sg = Math.sign(e) / Z.length; z.forEach((v, j) => gw[j] += sg * v); gb += sg; }
          });
          w = w.map((v, j) => v - lr * gw[j]); b -= lr * gb;
        }
        this.w = w; this.b = b;
        return this;
      },
      predict(x) { const z = this.sx.f(x); return (z.reduce((s, v, j) => s + v * this.w[j], this.b)) * this.sy + this.my; }
    };
  }

  // ---------- 모델: 분류 ----------
  function LogisticRegression(nClasses) {
    return {
      name: "Logistic Regression",
      fit(X, y) {
        this.sx = standardizer(X);
        const Z = X.map(this.sx.f), p = Z[0].length, K = nClasses, lam = 0.01;
        let W = [...Array(K)].map(() => new Array(p + 1).fill(0));
        for (let ep = 0; ep < 500; ep++) {
          const G = [...Array(K)].map(() => new Array(p + 1).fill(0));
          Z.forEach((z, i) => {
            const pr = softmax(W.map(w => w[0] + z.reduce((s, v, j) => s + v * w[j + 1], 0)));
            for (let c = 0; c < K; c++) {
              const g = pr[c] - (y[i] === c ? 1 : 0);
              G[c][0] += g; z.forEach((v, j) => G[c][j + 1] += g * v);
            }
          });
          W = W.map((w, c) => w.map((v, j) => v - 0.5 * (G[c][j] / Z.length + (j ? lam * v : 0))));
        }
        this.W = W;
        return this;
      },
      predict(x) { const z = this.sx.f(x); return softmax(this.W.map(w => w[0] + z.reduce((s, v, j) => s + v * w[j + 1], 0))); }
    };
  }
  function softmax(a) { const m = Math.max(...a); const e = a.map(v => Math.exp(v - m)); const s = e.reduce((p, q) => p + q, 0); return e.map(v => v / s); }

  function NaiveBayes(nClasses) {
    return {
      name: "Naive Bayes",
      fit(X, y) {
        const p = X[0].length;
        this.prior = []; this.mu = []; this.var = [];
        for (let c = 0; c < nClasses; c++) {
          const rows = X.filter((_, i) => y[i] === c);
          this.prior.push((rows.length + 1) / (X.length + nClasses));
          const mu = [], vr = [];
          for (let j = 0; j < p; j++) {
            const col = rows.map(r => r[j]);
            const m = col.length ? col.reduce((a, b) => a + b, 0) / col.length : 0;
            const v = col.length ? col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length : 1;
            mu.push(m); vr.push(v + 1e-3);
          }
          this.mu.push(mu); this.var.push(vr);
        }
        return this;
      },
      predict(x) {
        const lp = this.prior.map((pr, c) => Math.log(pr) + x.reduce((s, v, j) =>
          s - 0.5 * Math.log(2 * Math.PI * this.var[c][j]) - (v - this.mu[c][j]) ** 2 / (2 * this.var[c][j]), 0));
        return softmax(lp);
      }
    };
  }

  // ---------- 모델 목록 ----------
  const MODEL_INFO = {
    regression: [
      { id: "lr", name: "Linear Regression" },
      { id: "rf", name: "Random Forest" },
      { id: "knn", name: "kNN" },
      { id: "svm", name: "SVM" }
    ],
    classification: [
      { id: "logreg", name: "Logistic Regression" },
      { id: "rf", name: "Random Forest" },
      { id: "knn", name: "kNN" },
      { id: "nb", name: "Naive Bayes" }
    ]
  };
  function makeModel(id, task, nClasses, seed) {
    if (id === "lr") return LinearRegression();
    if (id === "rf") return RandomForest(task, nClasses, seed);
    if (id === "knn") return kNN(5, task, nClasses);
    if (id === "svm") return SVR();
    if (id === "logreg") return LogisticRegression(nClasses);
    if (id === "nb") return NaiveBayes(nClasses);
    throw new Error("unknown model " + id);
  }

  // ---------- 평가 지표 ----------
  function regMetrics(yt, yp) {
    const n = yt.length;
    const my = yt.reduce((a, b) => a + b, 0) / n;
    let se = 0, ae = 0, st = 0;
    for (let i = 0; i < n; i++) { se += (yt[i] - yp[i]) ** 2; ae += Math.abs(yt[i] - yp[i]); st += (yt[i] - my) ** 2; }
    const mse = se / n;
    return { MSE: mse, RMSE: Math.sqrt(mse), MAE: ae / n, R2: st ? 1 - se / st : NaN };
  }
  function clsMetrics(yt, probs, K) {
    const yp = probs.map(p => p.indexOf(Math.max(...p)));
    const cm = [...Array(K)].map(() => new Array(K).fill(0));
    yt.forEach((t, i) => cm[t][yp[i]]++);
    const n = yt.length;
    const ca = yt.filter((t, i) => t === yp[i]).length / n;
    let P = 0, R = 0, F = 0;
    for (let c = 0; c < K; c++) {
      const tp = cm[c][c], fp = cm.reduce((s, r, i) => s + (i !== c ? r[c] : 0), 0), fn = cm[c].reduce((s, v, j) => s + (j !== c ? v : 0), 0);
      const support = tp + fn, w = support / n;
      const pr = tp + fp ? tp / (tp + fp) : 0, rc = tp + fn ? tp / (tp + fn) : 0, f1 = pr + rc ? 2 * pr * rc / (pr + rc) : 0;
      P += w * pr; R += w * rc; F += w * f1;
    }
    return { CA: ca, F1: F, Precision: P, Recall: R, cm, yp };
  }

  function fitPredict(id, task, K, seed, Xtr, ytr, Xte) {
    const m = makeModel(id, task, K, seed).fit(Xtr, ytr);
    return { model: m, preds: Xte.map(x => m.predict(x)) };
  }

  // 교차 검증 (Test and Score - Cross validation)
  function crossValidate(id, task, K, X, y, folds, seed) {
    const rand = rng(seed + 101);
    const idx = shuffle([...Array(X.length).keys()], rand);
    const yt = [], yp = [];
    for (let f = 0; f < folds; f++) {
      const te = idx.filter((_, i) => i % folds === f), teSet = new Set(te);
      const tr = idx.filter(i => !teSet.has(i));
      if (!tr.length || !te.length) continue;
      const r = fitPredict(id, task, K, seed, tr.map(i => X[i]), tr.map(i => y[i]), te.map(i => X[i]));
      te.forEach((i, k) => { yt.push(y[i]); yp.push(r.preds[k]); });
    }
    return task === "regression" ? regMetrics(yt, yp) : clsMetrics(yt, yp, K);
  }

  // 전체 실험: 분할 -> 각 모델 학습 -> 교차검증(훈련 데이터) + 테스트 데이터 평가
  function experiment(ds, opts) {
    const D = design(ds, opts.features, opts.target);
    if (D.X.length < 10) throw new Error("학습에 사용할 데이터가 너무 적습니다 (10개 미만).");
    const K = D.classes ? D.classes.length : 0;
    const sp = splitIdx(D.X.length, opts.ratio, opts.seed, D.task === "classification" ? D.y : null, opts.stratify);
    const Xtr = sp.train.map(i => D.X[i]), ytr = sp.train.map(i => D.y[i]);
    const Xte = sp.test.map(i => D.X[i]), yte = sp.test.map(i => D.y[i]);
    const results = opts.models.map(id => {
      const info = MODEL_INFO[D.task].find(m => m.id === id);
      const cv = crossValidate(id, D.task, K, Xtr, ytr, opts.folds || 5, opts.seed);
      const r = fitPredict(id, D.task, K, opts.seed, Xtr, ytr, Xte);
      const test = yte.length ? (D.task === "regression" ? regMetrics(yte, r.preds) : clsMetrics(yte, r.preds, K)) : null;
      return { id, name: info ? info.name : id, cv, test, preds: r.preds, model: r.model };
    });
    return { task: D.task, names: D.names, classes: D.classes, nTrain: Xtr.length, nTest: Xte.length, yte, results };
  }

  function round(v, d) { const p = Math.pow(10, d); return Math.round(v * p) / p; }

  const api = {
    rng, shuffle, parseCSV, inferTypes, buildDataset, column, numStats, catStats, missingInfo, quantile,
    impute, filterRows, suggestRanges, normalize, pearson, correlations, corrStrength,
    design, splitIdx, experiment, regMetrics, clsMetrics, MODEL_INFO, round, isMissing
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DSEngine = api;
})(typeof window !== "undefined" ? window : this);
