(function () {
  const local = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const raw = window.__API_BASE__ || "";
  const unresolved = raw.startsWith("__PORT_");
  const API = unresolved ? "" : raw;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let DATA = null, TAB = "big";

  // Her Notion progress-bar style: dashes + % + dashes
  function dashBar(p) {
    const d = "––––––––––––––––––––";
    const n = Math.round(20 * Math.max(0, Math.min(1, p)));
    return d.slice(0, n) + " " + Math.round(100 * p) + "% " + d.slice(0, 20 - n);
  }
  const pct = (a, b) => (b ? a / b : 0);

  // date → fraction of year
  function yearFrac(d, year, endOfDay) {
    const t0 = Date.UTC(year, 0, 1), t1 = Date.UTC(year + 1, 0, 1);
    const [y, m, dd] = d.split("-").map(Number);
    let t = Date.UTC(y, m - 1, dd) + (endOfDay ? 86400000 : 0);
    return Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  }
  const fmt = (d) => { const [, m, dd] = d.split("-"); return MONTHS[+m - 1] + " " + +dd; };

  async function load(force) {
    $("status").className = "status";
    $("status").textContent = DATA ? "Refreshing…" : "Loading your 2026 data…";
    $("refresh").disabled = true;
    try {
      if (unresolved && !local.has(location.hostname) && location.protocol !== "file:") throw new Error("Backend address was not set at deploy time.");
      const r = await fetch(API + "/api/review" + (force ? "?refresh=1" : ""));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      DATA = j;
      render();
      $("status").textContent = "";
    } catch (e) {
      $("status").className = "status error";
      $("status").textContent = "Couldn't load Notion data: " + e.message;
    } finally { $("refresh").disabled = false; }
  }

  function state(it, today) {
    if (it.done) return "done";
    if (it.end && it.end < today) return "late";
    return "planned";
  }

  function render() {
    const D = DATA, today = D.today, Y = D.year;
    // header
    const yp = yearFrac(today, Y, true);
    $("year-progress").textContent = "Year " + dashBar(yp);
    $("updated").textContent = "Updated " + new Date(D.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    // KPIs
    const cnt = (arr) => ({ done: arr.filter((x) => x.done).length, total: arr.length });
    const habitsP = pct(D.habits.doneToDate, D.habits.possibleToDate);
    const kp = [
      ["Goals", cnt(D.goals)], ["Projects", cnt(D.projects)], ["Milestones", cnt(D.milestones)],
      ["Tasks", { done: D.tasks.done, total: D.tasks.total }],
      ["Big Wins", { value: D.journal.filter((e) => e.big).length }],
      ["Daily habits", { pct: habitsP, sub: D.habits.doneToDate + "/" + D.habits.possibleToDate }],
    ];
    $("kpis").innerHTML = kp.map(([label, v]) => {
      let val, p = null;
      if (v.value != null) val = `<span class="num">${v.value}</span> <small>logged</small>`;
      else if (v.pct != null) { val = `<span class="num">${Math.round(v.pct * 100)}%</span> <small>${esc(v.sub)}</small>`; p = v.pct; }
      else { val = `<span class="num">${v.done}</span> <small>of ${v.total} done</small>`; p = pct(v.done, v.total); }
      const id = label.toLowerCase().replace(/\s+/g, "-");
      return `<div class="kpi" data-testid="kpi-${id}"><div class="label">${esc(label)}</div><div class="value">${val}</div>${p != null ? `<div class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></div>` : ""}</div>`;
    }).join("");

    renderTimeline(D, today, Y);
    renderQuarters(D, today);
    renderHeatmap(D, today, Y);
    renderJournal(D);
  }

  function renderTimeline(D, today, Y) {
    const L = (f) => (f * 100).toFixed(3) + "%";
    const todayX = yearFrac(today, Y, false);
    let h = `<div class="tl">`;
    // month header
    h += `<div></div><div class="tl-head">${MONTHS.map((m, i) => `<span style="left:${L(i / 12)}">${m}</span>`).join("")}</div>`;
    // quarters
    h += `<div class="tl-label">Quarters</div><div class="tl-track">${D.quarters.map((q, i) => {
      const s = q.start || `${Y}-${String(i * 3 + 1).padStart(2, "0")}-01`;
      const e = q.end || `${Y}-${String(i * 3 + 3).padStart(2, "0")}-${[31, 30, 30, 31][i] || 30}`;
      const a = yearFrac(s, Y), b = yearFrac(e, Y, true);
      return `<a class="tl-q" href="${esc(q.url)}" target="_blank" rel="noopener" style="left:calc(${L(a)} + 2px);width:calc(${L(b - a)} - 4px)" title="${esc((q.name || "") + (q.theme ? " · " + q.theme : ""))}">${esc(q.name || "")}${q.theme ? " · " + esc(q.theme) : ""}</a>`;
    }).join("")}<div class="tl-today" style="left:${L(todayX)}"></div></div>`;

    const groups = [["Goals", D.goals, "bar"], ["Projects", D.projects, "bar"], ["Milestones", D.milestones, "dot"], ["Practices", D.practices, "bar"]];
    for (const [name, items, kind] of groups) {
      h += `<div class="tl-group">${name} <span class="num">(${items.filter((x) => x.done).length}/${items.length})</span></div>`;
      const dated = items.filter((x) => x.start || x.end).sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end));
      const undated = items.filter((x) => !x.start && !x.end);
      if (!items.length) { h += `<div class="tl-empty">No ${name.toLowerCase()} yet</div><div class="tl-track"><div class="tl-today" style="left:${L(todayX)}"></div></div>`; continue; }
      for (const it of dated.concat(undated)) {
        const st = state(it, today);
        const label = `<div class="tl-label"><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a></div>`;
        let mark = "";
        const tip = esc(`${it.name}${it.status ? " · " + it.status : ""}${it.start ? " · " + fmt(it.start) : ""}${it.end && it.end !== it.start ? " → " + fmt(it.end) : ""}`);
        if (it.start || it.end) {
          if (kind === "dot") {
            const x = yearFrac(it.end || it.start, Y, false);
            mark = `<a class="tl-dot ${st}" href="${esc(it.url)}" target="_blank" rel="noopener" style="left:${L(x)}" title="${tip}"></a>`;
          } else {
            const a = yearFrac(it.start || it.end, Y), b = yearFrac(it.end || it.start, Y, true);
            mark = `<a class="tl-bar ${st}" href="${esc(it.url)}" target="_blank" rel="noopener" style="left:${L(a)};width:${L(Math.max(b - a, 0.004))}" title="${tip}">${esc(it.status || "")}</a>`;
          }
        } else mark = `<span class="muted" style="position:absolute;top:6px;left:6px">No date set</span>`;
        h += `${label}<div class="tl-track" data-testid="tl-${name.toLowerCase()}-${esc(it.id)}">${mark}<div class="tl-today" style="left:${L(todayX)}"></div></div>`;
      }
    }
    h += `</div>`;
    $("timeline").innerHTML = h;
  }

  function quarterOf(d) { return d ? Math.floor((+d.slice(5, 7) - 1) / 3) : -1; }

  function renderQuarters(D, today) {
    const curQ = quarterOf(today);
    const by = (arr, qi) => {
      const planned = arr.filter((x) => quarterOf(x.end || x.start) === qi);
      return { total: planned.length, done: planned.filter((x) => x.done).length };
    };
    const html = [0, 1, 2, 3].map((qi) => {
      const q = D.quarters[qi] || { name: "Q" + (qi + 1) };
      const tm = D.tasks.byMonth.slice(qi * 3, qi * 3 + 3).reduce((s, m) => ({ total: s.total + m.planned, done: s.done + m.done }), { total: 0, done: 0 });
      const qDays = D.habits.days.filter((d) => quarterOf(d.date) === qi && d.date <= today);
      const hab = { done: qDays.reduce((s, d) => s + d.done, 0), total: qDays.reduce((s, d) => s + d.possible, 0) };
      const wins = D.journal.filter((e) => quarterOf(e.date) === qi);
      const lines = [["Goals", by(D.goals, qi)], ["Projects", by(D.projects, qi)], ["Milestones", by(D.milestones, qi)], ["Tasks", tm], ["Habits", hab]];
      const extra = [q.bigWins && "Big wins: " + q.bigWins, q.smallWins && "Small wins: " + q.smallWins].filter(Boolean).join("\n");
      return `<div class="q ${qi === curQ ? "current" : ""}" data-testid="card-quarter-${qi + 1}">
        <h3><span>${esc(q.name || "Q" + (qi + 1))}</span><span class="muted num">${wins.filter((e) => e.big).length} big · ${wins.filter((e) => e.small).length} small · ${wins.filter((e) => e.pivot).length} ▲</span></h3>
        <div class="theme">${esc(q.theme || "")}</div>
        ${lines.map(([n, v]) => `<div class="q-line"><span>${n}</span><div class="bar"><i style="width:${(pct(v.done, v.total) * 100).toFixed(1)}%"></i></div><span class="num">${v.done}/${v.total}</span></div>`).join("")}
        ${extra ? `<div class="q-wins">${esc(extra)}</div>` : ""}
      </div>`;
    }).join("");
    $("quarters").innerHTML = html;
  }

  function renderHeatmap(D, today, Y) {
    const map = new Map(D.habits.days.map((d) => [d.date, d]));
    const start = new Date(Date.UTC(Y, 0, 1));
    const pad = start.getUTCDay(); // Sunday-start weeks
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let t = start.getTime(); new Date(t).getUTCFullYear() === Y; t += 86400000) cells.push(new Date(t).toISOString().slice(0, 10));
    const weeks = Math.ceil(cells.length / 7);
    let h = `<div class="hm" role="img" aria-label="Daily habit boxes checked, ${Y}">`;
    let lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const last = cells.slice(w * 7, w * 7 + 7).filter(Boolean).pop();
      const mi = last ? +last.slice(5, 7) - 1 : -1;
      const lbl = mi !== lastM ? MONTHS[mi] : "";
      lastM = mi;
      h += `<b>${lbl}</b>`;
      for (let d = 0; d < 7; d++) {
        const ds = cells[w * 7 + d];
        if (!ds) { h += `<i class="blank"></i>`; continue; }
        const r = map.get(ds);
        const p = r && r.possible ? r.done / r.possible : 0;
        const l = !r || !r.done ? 0 : p < 0.25 ? 1 : p < 0.5 ? 2 : p < 0.75 ? 3 : 4;
        h += `<i data-l="${l}" class="${ds > today ? "future" : ""}" title="${fmt(ds)}: ${r ? r.done + "/" + r.possible : "no entry"}"></i>`;
      }
    }
    h += `</div><div class="hm-months">`;
    for (let m = 0; m < 12; m++) {
      const ds = D.habits.days.filter((d) => +d.date.slice(5, 7) === m + 1 && d.date <= today);
      const done = ds.reduce((s, d) => s + d.done, 0), tot = ds.reduce((s, d) => s + d.possible, 0);
      h += `<div class="hm-month"><span>${MONTHS[m]}</span> <span class="muted num">${tot ? Math.round((done / tot) * 100) + "%" : "–"}</span><div class="bar"><i style="width:${(pct(done, tot) * 100).toFixed(1)}%"></i></div></div>`;
    }
    $("heatmap").innerHTML = h + `</div>`;
    $("habit-summary").textContent = `${D.habits.slotsPerDay} boxes a day · ${D.habits.doneToDate}/${D.habits.possibleToDate} checked so far`;
  }

  const TABS = [["big", "Big Wins"], ["small", "Small Wins"], ["notable", "Notable Happenings"], ["pivot", "Pivots ▲"]];
  function renderJournal(D) {
    $("tabs").innerHTML = TABS.map(([k, n]) => `<button role="tab" type="button" aria-selected="${k === TAB}" data-k="${k}" data-testid="tab-${k}">${n}<span class="count">${D.journal.filter((e) => e[k]).length}</span></button>`).join("");
    const rows = D.journal.filter((e) => e[TAB]);
    if (!rows.length) { $("journal").innerHTML = `<div class="empty">Nothing logged yet. Entries come from the 2026 Daily Routines BuJo.</div>`; return; }
    const byM = {};
    for (const e of rows) (byM[e.date.slice(5, 7)] ||= []).push(e);
    $("journal").innerHTML = Object.keys(byM).sort().reverse().map((m) => `<div class="j-month"><h4>${MONTHS[+m - 1]} <span class="num">(${byM[m].length})</span></h4><ul>${byM[m].map((e) => `<li><time datetime="${e.date}">${fmt(e.date)}</time><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e[TAB])}</a></li>`).join("")}</ul></div>`).join("");
  }

  $("tabs").addEventListener("click", (ev) => { const b = ev.target.closest("button[data-k]"); if (!b) return; TAB = b.dataset.k; renderJournal(DATA); });
  $("refresh").addEventListener("click", () => load(true));
  load(false);
})();
