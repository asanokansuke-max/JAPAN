// FIFAランキング：試合結果でポイントが動き、W杯・アジアカップの抽選ポットに使われる
(function (root) {
  'use strict';
  const D = root.SBData;
  let S = null;

  // 大会ごとの重要度（実際のSUM方式に近い係数）
  const IMPORTANCE = { friendly: 10, q2: 25, q3: 25, q4: 25, e1: 15, olympic: 0, asiancup: 35, asiancupKO: 40, wc: 50, wcKO: 60 };

  function init(state) {
    S = state;
    S.fifa = {};
    D.NATIONS.forEach(n => { S.fifa[n.code] = Math.round(1000 + (n.rating - 60) * 30 + (Math.random() - 0.5) * 30); });
    S.fifa.JPN = 1565;
  }
  function bind(state) { S = state; if (!S.fifa) init(state); }

  // 1試合の更新。res: 0=A勝ち 1=B勝ち -1=引き分け、pens はPK戦（勝者0.75・敗者0.5）
  function update(a, b, res, comp, knockout, pens) {
    if (!S || !S.fifa) return 0;
    const I = IMPORTANCE[comp + (knockout ? 'KO' : '')] != null ? IMPORTANCE[comp + (knockout ? 'KO' : '')] : (IMPORTANCE[comp] || 10);
    if (!I) return 0;
    const pa = S.fifa[a], pb = S.fifa[b];
    const we = 1 / (Math.pow(10, -(pa - pb) / 600) + 1);
    let w = res === 0 ? 1 : res === 1 ? 0 : 0.5;
    if (pens) w = res === 0 ? 0.75 : 0.5;
    let da = I * (w - we);
    // 大会のノックアウトで負けてもポイントは減らない
    if (knockout && da < 0 && (comp === 'wc' || comp === 'asiancup')) da = 0;
    S.fifa[a] = pa + da;
    S.fifa[b] = pb - (knockout && (comp === 'wc' || comp === 'asiancup') && -da > 0 ? 0 : da);
    return da;
  }

  function table() { return Object.keys(S.fifa).map(c => ({ code: c, pts: S.fifa[c] })).sort((x, y) => y.pts - x.pts).map((r, i) => Object.assign(r, { rank: i + 1 })); }
  function rankOf(code) { const t = table(); const r = t.find(x => x.code === code); return r ? r.rank : null; }
  function points(code) { return S.fifa[code]; }

  root.SBRank = { IMPORTANCE, init, bind, update, table, rankOf, points };
})(typeof window !== 'undefined' ? window : globalThis);
