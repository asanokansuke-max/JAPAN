// バランス検証と通しプレイのスモークテスト
//   node tools/sim-test.js [キャリア試行回数]
'use strict';
const path = require('path');
const load = f => require(path.join(__dirname, '..', 'js', f));
['data.js', 'engine.js', 'world.js', 'game.js', 'staff.js', 'media.js', 'camp.js', 'extra.js', 'ranking.js', 'life.js'].forEach(load);
const { SBEngine: E, SBGame: G } = globalThis;

function autoSquad() {
  const S = G.state();
  S.squad = G.autoSquad();
  S.xi = G.autoPick(S.squad, S.formation);
}

// 1) 試合エンジンの勝率
function engineBalance() {
  G.newGame('テスト');
  autoSquad();
  G.confirmCamp('tactic');
  const S = G.state();
  console.log(`日本 推定XI ${S.jpnRating.toFixed(1)}  連携 ${G.teamChem(S.xi).toFixed(0)}`);
  for (const code of ['ESP', 'ARG', 'GER', 'KOR', 'AUS', 'KSA', 'IND']) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, sh = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      S.squad.forEach(id => { G.player(id).cond = 95; });
      const sim = G.createMatch({ opp: code, venue: 'neutral', knockout: false });
      const r = sim.runToEnd();
      const u = sim.userSide;
      gf += r.score[u]; ga += r.score[1 - u]; sh += r.stats[u].shots;
      if (r.score[u] > r.score[1 - u]) w++; else if (r.score[u] < r.score[1 - u]) l++; else d++;
    }
    console.log(`${G.nname(code).padEnd(8, '　')} (${G.nation(code).rating}) 勝${(w / N * 100).toFixed(0)}% 分${(d / N * 100).toFixed(0)}% 敗${(l / N * 100).toFixed(0)}%  平均 ${(gf / N).toFixed(2)}-${(ga / N).toFixed(2)}  シュート${(sh / N).toFixed(1)}`);
  }
}

// 2) 通しプレイ
function career(verbose) {
  G.newGame('テスト');
  let guard = 0;
  while (guard++ < 200) {
    const S = G.state();
    if (S.phase === 'over' || S.phase === 'ended') break;
    if (S.phase === 'prep') {
      const rep = S.cur.reports;
      if (!rep || !rep.coach.rec.length) throw new Error('staff reports missing');
      if (verbose && guard < 4) console.log('   スタッフ:', rep.coach.summary, '| 入替', rep.coach.swaps.length, '| スカウト', rep.scout.map(x => x.tag + ':' + G.player(x.id).name).join(' '), '| 医療', rep.medical.length);
      autoSquad();
      const issues = G.squadIssues(S.squad);
      if (issues.length) throw new Error('squad issues: ' + issues.join(','));
      G.confirmCamp(['tactic', 'attack', 'youth', 'team'][guard % 4]);
    }
    if (S.phase === 'match') {
      let fx, n = 0;
      while ((fx = G.nextFixture()) && n++ < 20) {
        S.xi = G.autoPick(S.squad, S.formation);
        globalThis.SBStaff.analyst(fx); globalThis.SBStaff.rotation();
        const sim = G.createMatch(fx);
        sim.runToEnd();
        G.applyResult(fx, sim);
      }
      G.endEvent();
    }
    if (G.state().phase === 'summary') G.advance();
  }
  const S = G.state();
  const best = G.active().slice().sort((a, b) => b.ovr - a.ovr).slice(0, 5).map(p => `${p.name}${p.ovr.toFixed(0)}`).join(' ');
  if (verbose) console.log(`  ${S.phase} ${S.overReason || ''} AC=${S.comps.asiancup && S.comps.asiancup.finish} WC=${S.wcResult} 評価=${S.board.toFixed(0)} 日本力=${G.japanStrength().toFixed(1)} | ${best}`);
  return S;
}

engineBalance();
const n = +process.argv[2] || 20;
const tally = {};
for (let i = 0; i < n; i++) {
  const S = career(i < 5);
  const k = S.phase === 'over' ? '敗退/解任' : (S.wcResult || '?');
  tally[k] = (tally[k] || 0) + 1;
}
console.log('W杯結果分布（自動采配）:', tally);
