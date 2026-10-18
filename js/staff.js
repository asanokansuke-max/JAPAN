// 代表スタッフのレポート：ヘッドコーチ・スカウト・メディカル・分析担当
(function (root) {
  'use strict';
  const G = root.SBGame, W = root.SBWorld, E = root.SBEngine;

  const STAFF = {
    coach: { name: '堀江 誠', role: 'ヘッドコーチ' },
    scout: { name: '森本 拓也', role: 'チーフスカウト' },
    medical: { name: '三浦 千尋', role: 'チームドクター' },
    analyst: { name: '高見 遼', role: '分析担当' }
  };

  const sharp = p => p.sharp == null ? 70 : p.sharp;
  const seasonLine = p => {
    const s = p.season;
    if (!s || !s.apps) return '今季出場なし';
    const avg = s.rsum && s.apps ? ` ・ 平均評価${(s.rsum / s.apps).toFixed(2)}` : '';
    const ga = p.pos === 'GK' ? '' : ` ${s.g}得点${s.a}アシスト`;
    return `今季${s.apps}試合（先発${s.starts}）${ga}${avg}`;
  };

  // スタッフ目線の評価：能力に加えて、調子・試合勘・クラブでの立場・負傷明けを重視
  function value(p) {
    const S = G.state();
    let v = p.ovr + p.form * 0.7 + (sharp(p) - 70) * 0.05 + (p.chem || 0) * 0.01;
    if (p.status === 'bench') v -= 1;
    if (W.weeksSinceReturn(S, p) < 6) v -= 1;
    return v;
  }

  function recommend(n) {
    const ps = G.visible().filter(G.available);
    const quota = [[['GK'], 3], [['CB'], 5], [['LB', 'RB'], 4], [['DM', 'CM'], 5], [['AM', 'LW', 'RW'], 6], [['ST'], 3]];
    const pick = new Set();
    for (const [poss, q] of quota) ps.filter(p => poss.includes(p.pos)).sort((a, b) => value(b) - value(a)).slice(0, q).forEach(p => pick.add(p.id));
    ps.filter(p => p.pos !== 'GK' && !pick.has(p.id)).sort((a, b) => value(b) - value(a)).forEach(p => { if (pick.size < n) pick.add(p.id); });
    return [...pick];
  }

  function outReason(p) {
    const S = G.state();
    if (p.injury > 0) return `${W.injText(p)}。今回は招集できません`;
    if (p.status === 'bench') return `${p.club}で出場機会を失っています（${seasonLine(p)}）`;
    if (sharp(p) < 50) return 'クラブでの出場時間が少なく、試合勘に不安があります';
    if (W.weeksSinceReturn(S, p) < 6) return '負傷から復帰して間もなく、無理をさせたくありません';
    if (p.form <= -1) return `調子を落としています（${seasonLine(p)}）`;
    if (G.age(p) >= 32) return '経験は貴重ですが、ピークは過ぎつつあります';
    return '序列を考えると、今回は見送ってもいいでしょう';
  }

  function inReason(p) {
    const s = p.season || {};
    if (p.status === 'bench' || sharp(p) < 45) return `${p.club}では出番が少ない（${seasonLine(p)}）が、能力は代表級。試合勘には注意が必要です`;
    if (p.form >= 1 && s.g >= 3) return `${p.club}で好調です。${seasonLine(p)}`;
    if (p.form >= 1) return `クラブでの評価が上がっています（${seasonLine(p)}）`;
    if (p.status === 'reg' && p.tier <= 3) return `${W.league(p.club)}の${p.club}で主力に定着しています`;
    if (G.age(p) <= 22 && p.pot >= 82) return '将来の中心選手。いまのうちに代表の経験を積ませたい';
    if (p.status === 'reg') return `${p.club}で先発を続けています（${seasonLine(p)}）`;
    return '総合的に見て招集に値します';
  }

  // 招集前のスタッフ会議
  function prepReports() {
    const S = G.state();
    const ev = G.event();
    const rec = recommend(26);
    const cur = S.squad.filter(id => { const p = G.player(id); return p && !p.retired; });
    const coach = { rec, swaps: [], notes: [] };
    if (!cur.length) {
      coach.summary = `${ev.kind === 'tour' ? '大会に向けて' : '今回の活動に向けて'}、クラブでの状態を踏まえた26人を用意しました。たたき台にしてください。`;
    } else {
      const outs = cur.filter(id => !rec.includes(id)).map(G.player);
      const ins = rec.filter(id => !cur.includes(id)).map(G.player);
      const grp = p => E.POS_GROUP[p.pos];
      // 同じポジション群で入れ替えを組む
      outs.sort((a, b) => ((b.injury > 0) - (a.injury > 0)) || value(a) - value(b));
      const used = new Set();
      for (const o of outs) {
        const i = ins.find(x => !used.has(x.id) && grp(x) === grp(o)) || ins.find(x => !used.has(x.id) && o.pos !== 'GK' && x.pos !== 'GK');
        if (!i) continue;
        used.add(i.id);
        coach.swaps.push({ out: o.id, in: i.id, outWhy: outReason(o), inWhy: inReason(i) });
      }
      const hurt = coach.swaps.filter(x => G.player(x.out).injury > 0);
      coach.swaps = hurt.concat(coach.swaps.filter(x => !hurt.includes(x)).slice(0, Math.max(0, 6 - hurt.length)));
      // 代わりが見つからなかった負傷者も外す提案に含める
      outs.filter(o => o.injury > 0 && !coach.swaps.some(x => x.out === o.id)).forEach(o => coach.swaps.unshift({ out: o.id, in: null, outWhy: outReason(o), inWhy: '' }));
      coach.summary = coach.swaps.length ? `前回のメンバーから${coach.swaps.length}件の入れ替えを提案します。クラブでの状態を見て判断しました。` : '前回のメンバーで問題ありません。全員クラブで順調です。';
    }
    // 負傷で選外にした主な選手
    coach.injured = G.visible().filter(p => p.injury > 0 && (cur.includes(p.id) || (S.cur.prevSquad || []).includes(p.id) || p.chem >= 40 || p.ovr >= 74 || p.caps > 0))
      .sort((a, b) => b.ovr - a.ovr).map(p => ({ id: p.id, text: `${W.injText(p)}。${W.returnDateText(S, p)}の復帰見込みのため、今回は選外とします。` }));
    const gk = cur.map(G.player).filter(p => p && p.pos === 'GK' && G.available(p)).length;
    if (cur.length && gk < 3) coach.notes.push(`使えるGKが${gk}人しかいません。最低3人は必要です。`);
    if (ev.kind === 'tour') coach.notes.push('大会中はメンバーを入れ替えられません。複数ポジションをこなせる選手が重宝します。');
    if (ev.kind === 'qual') coach.notes.push('予選はアウェーの移動も厳しい。コンディションを最優先にしましょう。');

    // スカウト推薦
    const pool = G.visible().filter(p => G.available(p) && !cur.includes(p.id) && (cur.length || !rec.includes(p.id)));
    const fresh = p => !p.scoutedAt || (S.date.y * 12 + S.date.m) - p.scoutedAt > 5;
    const picks = [];
    const add = (p, tag, text) => { if (p && !picks.some(x => x.id === p.id)) { picks.push({ id: p.id, tag, text }); p.scoutedAt = S.date.y * 12 + S.date.m; } };
    const hot = pool.filter(p => p.season && p.season.apps >= 4 && p.ovr >= 68 && p.pos !== 'GK').sort((a, b) => (b.season.g + b.season.a * 0.6) / b.season.apps + b.form * 0.1 - (a.season.g + a.season.a * 0.6) / a.season.apps - a.form * 0.1)[0];
    if (hot) add(hot, '好調', `${seasonLine(hot)}。数字が示すとおり、いま最も勢いがある選手です。`);
    const young = pool.filter(p => G.age(p) < 22 && p.ovr >= 62).sort((a, b) => b.pot - (fresh(b) ? 0 : 6) - a.pot + (fresh(a) ? 0 : 6)).slice(0, 2);
    young.forEach(p => {
      if (p.know < 3) p.know++;
      const [lo, hi] = G.potRange(p);
      add(p, '有望株', `${G.ageInt(p)}歳。${p.club}で${G.STATUS_LABEL[p.status]}。現地で見てきましたが、潜在能力は${G.potGrade((lo + hi) / 2)}級（見積もり${lo}〜${hi}）。`);
    });
    const abroad = pool.filter(p => p.tier <= 3 && p.status === 'reg' && !p.campCount && p.chem < 40 && p.ovr >= 70).sort((a, b) => b.ovr - a.ovr)[0];
    if (abroad) add(abroad, '未招集', `${W.league(abroad.club)}の${abroad.club}でレギュラー。まだ代表に呼んでいませんが、一度見ておく価値があります。`);
    const vet = pool.filter(p => G.age(p) >= 27 && p.form >= 1.2 && p.ovr >= 72).sort((a, b) => b.form - a.form)[0];
    if (vet) add(vet, '復調', `${seasonLine(vet)}。ここ数か月で状態を上げています。`);
    const jl = pool.filter(p => W.isJ(p.club) && p.form >= 0.8 && p.ovr >= 70).sort((a, b) => value(b) - value(a))[0];
    if (jl) add(jl, 'Jリーグ', `J1で存在感。${seasonLine(jl)}。国内組からの推薦です。`);

    // メディカル
    const watch = G.visible().filter(p => cur.includes(p.id) || rec.includes(p.id) || (S.cur.prevSquad || []).includes(p.id) || p.chem >= 30 || p.ovr >= 72 || p.caps > 0);
    const medical = [];
    watch.forEach(p => {
      if (p.injury > 0) medical.push({ id: p.id, lv: 'bad', text: `${W.injText(p)}。${W.returnDateText(S, p)}の復帰見込み。` });
      else if (W.weeksSinceReturn(S, p) < 9) medical.push({ id: p.id, lv: 'warn', text: `${p.inj ? p.inj.t : '負傷'}から復帰したばかり。再発リスクが高く、フル出場は避けたい。` });
      else if ((p.load || 0) > 500 && (cur.includes(p.id) || rec.includes(p.id))) medical.push({ id: p.id, lv: 'warn', load: p.load, text: `${W.club(S, p.club).cl ? 'CLを含む' : ''}過密日程で、先月は${p.month ? p.month.min : 0}分出場。疲労が心配です。` });
      else if (sharp(p) < 45 && (cur.includes(p.id) || rec.includes(p.id))) medical.push({ id: p.id, lv: 'warn', text: 'クラブでの出場が少なく、試合勘と体力が落ちています。' });
      else if (p.traits.includes('ガラスの体') && cur.includes(p.id)) medical.push({ id: p.id, lv: 'info', text: '負傷歴が多い選手です。出場時間の管理を。' });
    });
    // 疲労の報告は特に稼働の多い3人まで
    const tired = medical.filter(m => m.load).sort((a, b) => b.load - a.load).slice(3).map(m => m.id);
    for (let i = medical.length - 1; i >= 0; i--) if (tired.includes(medical[i].id) && medical[i].load) medical.splice(i, 1);
    const lvRank = { bad: 0, warn: 1, info: 2 };
    medical.sort((a, b) => (lvRank[a.lv] - lvRank[b.lv]) || (cur.includes(b.id) - cur.includes(a.id)) || (G.player(b.id).ovr - G.player(a.id).ovr));
    return { coach, scout: picks.slice(0, 5), medical: medical.slice(0, 16), made: S.date.y * 100 + S.date.m };
  }

  // 試合前：分析担当のレポート
  function analyst(fx) {
    const S = G.state();
    const plan = G.oppPlan(fx);
    const n = G.nation(fx.opp);
    const jr = S.jpnRating || G.japanStrength();
    const diff = n.rating - jr;
    const lines = ['GK', '守備', '中盤', '攻撃'];
    const prof = n.prof || [0, 0, 0, 0];
    const strong = lines[prof.indexOf(Math.max(...prof))], weak = lines[prof.indexOf(Math.min(...prof))];
    const stars = (n.stars || []).map(s => s.split('/')[0]).slice(0, 3);
    let ment = 'bal', style = 'bal', why;
    if (plan.style === 'press') { style = 'counter'; why = '相手は前から強く来ます。プレスをはがして背後のスペースを突くカウンターが有効です。'; }
    else if (plan.ment === 'att') { style = 'counter'; ment = diff > 3 ? 'def' : 'bal'; why = '相手は攻撃的に出てきます。ブロックを作り、奪ってから一気に出ましょう。'; }
    else if (plan.style === 'counter' && plan.ment === 'def') { style = 'pos'; ment = 'bal'; why = '相手は引いてカウンター狙い。前がかりになりすぎず、ボールを握って崩しましょう。攻撃的に出ると逆襲を受けます。'; }
    else if (diff > 4) { ment = 'def'; style = 'counter'; why = '格上です。守備的に入り、少ないチャンスを確実に。'; }
    else if (diff < -4) { ment = 'att'; style = 'pos'; why = '力では上回っています。主導権を握って押し込みましょう。'; }
    else { style = 'press'; why = '力は拮抗。前線からのプレスで主導権を取りたい。ただし後半の消耗に注意。'; }
    const mx = Math.max(...prof), mn = Math.min(...prof);
    const strText = mx <= 0 && mn >= 0 ? '目立った偏りはありません' : [mx > 0 ? `${strong}が強み` : '', mn < 0 ? `${weak}に隙があります` : ''].filter(Boolean).join('、');
    return {
      plan, rec: { ment, style }, stars,
      text: `${n.name}は${plan.formation}で、${E.MENT[plan.ment]}な${E.STYLE[plan.style]}で来る見込み。戦力は${Math.round(n.rating)}（日本${Math.round(jr)}）。${strText}。`,
      why
    };
  }

  // 試合前：ヘッドコーチのローテーション提案
  function rotation() {
    const S = G.state();
    const slots = G.slotsOf();
    const out = [];
    const bench = S.squad.filter(id => !S.xi.includes(id)).map(G.player).filter(p => p && G.available(p));
    S.xi.forEach((id, i) => {
      const p = G.player(id);
      if (!p) return;
      const s = slots[i];
      const cur = p.ovr * E.fit(p, s) * (0.9 + p.cond / 1000);
      if (!G.available(p)) {
        const alt = bench.filter(b => !out.some(o => o.in === b.id)).sort((a, b) => b.ovr * E.fit(b, s) - a.ovr * E.fit(a, s))[0];
        if (alt) out.push({ i, out: p.id, in: alt.id, text: `${p.name}は${p.injury > 0 ? '負傷' : '出場停止'}で起用できません。${alt.name}を${E.SLOT_LABEL[s]}に。` });
        return;
      }
      if (p.cond >= 82) return;
      const alt = bench.filter(b => !out.some(o => o.in === b.id) && b.cond >= 88).sort((a, b) => b.ovr * E.fit(b, s) - a.ovr * E.fit(a, s))[0];
      if (!alt) return;
      const altV = alt.ovr * E.fit(alt, s) * (0.9 + alt.cond / 1000);
      if (altV >= cur - 2.5) out.push({ i, out: p.id, in: alt.id, text: `${p.name}はコンディション${Math.round(p.cond)}と疲れが見えます。${alt.name}（${Math.round(alt.cond)}）の先発を推します。` });
    });
    return out.slice(0, 4);
  }

  function matchMedical() {
    const S = G.state();
    return S.squad.map(G.player).filter(Boolean).filter(p => p.injury > 0 || p.susp || p.cond < 78).map(p => ({
      id: p.id, lv: p.injury > 0 || p.susp ? 'bad' : 'warn',
      text: p.susp ? '出場停止です。' : p.injury > 0 ? `${W.injText(p)}。` : `コンディション${Math.round(p.cond)}。疲労が溜まっています。`
    }));
  }

  root.SBStaff = { STAFF, prepReports, analyst, rotation, matchMedical, seasonLine, value };
})(typeof window !== 'undefined' ? window : globalThis);
