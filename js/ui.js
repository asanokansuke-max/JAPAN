// 画面描画と操作
(function () {
  'use strict';
  const G = window.SBGame, E = window.SBEngine;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = id => document.getElementById(id);
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);

  let tab = 'home';
  const ui = { group: 'ALL', sort: 'ovr', dir: -1, q: '', onlyCalled: false, abroad: false, focus: null, confirm: null, modal: null };
  let live = null;

  // ---------- 小物 ----------
  const posChip = p => `<span class="pos ${E.POS_GROUP[p.pos]}">${E.POS_LABEL[p.pos]}</span>`;
  const ovrCls = v => v >= 84 ? 't1' : v >= 78 ? 't2' : v >= 70 ? 't3' : 't4';
  const ovrTag = v => `<span class="ovr ${ovrCls(v)}">${Math.round(v)}</span>`;
  const formTag = f => f >= 1 ? '<span class="form-up" title="好調">▲</span>' : f <= -1 ? '<span class="form-down" title="不調">▼</span>' : '<span class="muted" title="普通">－</span>';
  const nat = code => `<span class="nation"><span class="code ${code}">${code}</span>${esc(G.nname(code))}</span>`;
  const resChip = o => o === 'W' ? '<span class="chip good">勝</span>' : o === 'L' ? '<span class="chip bad">敗</span>' : '<span class="chip">分</span>';
  function toast(msg) {
    const t = $('toast');
    t.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, 2600);
  }
  function potText(p) {
    const [a, b] = G.potRange(p);
    if (p.know >= 3) return `${G.potGrade(b)} <span class="muted small num">${a}-${b}</span>`;
    return `${G.potGrade((a + b) / 2)}? <span class="muted small num">${a}-${b}</span>`;
  }
  function injTag(p) {
    if (p.injury >= 1) return `<span class="chip bad">負傷 ${Math.ceil(p.injury)}か月</span>`;
    if (p.injury > 0) return '<span class="chip bad">負傷</span>';
    if (p.susp) return '<span class="chip bad">出場停止</span>';
    return '';
  }

  // ---------- タイトル ----------
  function renderTitle() {
    let saved = null;
    try { saved = localStorage.getItem('samurai-blue-manager-v1'); } catch (e) { saved = null; }
    let info = null;
    if (saved) { try { const s = JSON.parse(saved); info = `${s.coach}監督 ・ ${s.date.y}年${s.date.m}月`; } catch (e) { info = null; } }
    $('app').innerHTML = `
      <div class="title-wrap"><div class="title-card card">
        <div class="eyebrow">日本代表監督シミュレーション</div>
        <div class="logo">サムライブルー<br><em>2030</em> への道</div>
        <p>2026年10月、あなたは日本代表の新監督に就任した。アジアカップ、W杯予選を勝ち抜き、2030年ワールドカップで優勝せよ。</p>
        <ul class="feat">
          <li>2026年時点の代表選手プール＋毎年現れる新星</li>
          <li>年齢・所属クラブ・出場機会で選手が成長／衰退</li>
          <li>フォーメーション・戦術・交代を采配する試合エンジン</li>
          <li>アジアカップ → W杯予選 → W杯本大会（48か国）</li>
        </ul>
        ${info ? `<div class="row" style="margin-bottom:8px"><button class="btn primary big" data-act="continue">続きから</button><span class="muted small">${esc(info)}</span></div>` : ''}
        <label for="coach-name">監督名</label>
        <input id="coach-name" maxlength="16" placeholder="例：山田太郎" value="">
        <div class="row" style="margin-top:12px">
          <button class="btn ${info ? '' : 'primary'} big" data-act="new-game">${info ? '新しく始める（セーブを上書き）' : '監督に就任する'}</button>
        </div>
        <p class="small muted" style="margin-top:16px">選手の能力値・所属はゲーム用の推定であり、実在選手の公式評価ではありません。</p>
      </div></div>`;
  }

  // ---------- ヘッダー ----------
  function header(S) {
    const ev = G.event();
    const str = S.jpnRating || G.japanStrength();
    const tabs = [['home', 'ホーム'], ['players', '選手'], ['squad', '招集'], ['tactics', '戦術'], ['schedule', '日程・大会'], ['records', '記録']];
    const dot = k => (k === 'squad' && S.phase === 'prep') || (k === 'home' && S.phase === 'summary') ? '<span class="dot"></span>' : '';
    return `<header class="top"><div class="top-in">
        <div class="brand"><span class="disc"></span>サムライブルー<small>MANAGER</small></div>
        <div class="top-meta">
          <div class="meta"><b class="num">${S.date.y}.${String(S.date.m).padStart(2, '0')}</b><span>${esc(ev ? ev.title : '大会終了')}</span></div>
          <div class="meta"><b class="num">${fmt1(str)}</b><span>チーム力</span></div>
          <div class="meta"><b class="num">${Math.round(S.board)}</b><span>協会評価</span><div class="meter ${S.board < 30 ? 'low' : ''}"><i style="width:${S.board}%"></i></div></div>
        </div>
      </div>
      <nav class="nav" aria-label="メニュー">${tabs.map(([k, l]) => `<button data-act="tab" data-v="${k}" aria-current="${tab === k}">${l}${dot(k)}</button>`).join('')}</nav>
    </header>`;
  }

  function render() {
    const S = G.state();
    if (!S) { renderTitle(); return; }
    let body = '';
    if (S.phase === 'over' || S.phase === 'ended') body = ending(S);
    else body = ({ home, players, squad, tactics, schedule, records })[tab](S);
    $('app').innerHTML = header(S) + `<main>${body}</main>`;
    renderModal();
  }

  // ---------- ホーム ----------
  function home(S) {
    const ev = G.event();
    let hero = '';
    if (S.phase === 'prep') {
      const opp = S.cur.friendlies ? `<div class="vs">${S.cur.friendlies.map(c => { const n = G.nation(c); return `<div class="opp"><b>${esc(n.name)}</b><span>戦力 ${Math.round(n.rating)}</span></div>`; }).join('')}</div>` : '';
      let compInfo = '';
      if (ev.kind === 'tour') { const t = S.comps[ev.comp]; const g = G.tourGroupOfJapan(t); compInfo = `<div class="vs">${g.teams.filter(c => c !== 'JPN').map(c => { const n = G.nation(c); return `<div class="opp"><b>${esc(n.name)}</b><span>グループ${g.name}・戦力 ${Math.round(n.rating)}</span></div>`; }).join('')}</div>`; }
      hero = `<section class="hero">
        <div class="eyebrow">${S.date.y}年${S.date.m}月 ・ 代表活動</div>
        <h1>${esc(S.cur.title || ev.title)}</h1>
        ${opp}${compInfo}
        <p>${ev.kind === 'tour' ? '大会登録メンバー（23〜26人）を決めて、事前合宿のテーマを選ぼう。大会中はメンバーを変更できない。' : '招集メンバー（20〜26人）を決めて、合宿のテーマを選ぼう。'}現在 ${S.squad.length}人を選出中。</p>
        <div class="row"><button class="btn go big" data-act="tab" data-v="squad">招集メンバーを決める</button></div>
      </section>`;
    } else if (S.phase === 'match') {
      const fx = G.nextFixture();
      if (fx) {
        const n = G.nation(fx.opp);
        const venue = fx.oppHost ? '敵地（開催国）' : fx.venue === 'home' ? 'ホーム' : fx.venue === 'away' ? 'アウェー' : '中立地';
        hero = `<section class="hero">
          <div class="eyebrow">${esc(fx.label)} ・ ${venue}${fx.knockout ? ' ・ ノックアウト' : ''}</div>
          <h1>日本 vs ${esc(n.name)}</h1>
          <div class="vs"><div class="opp"><b>${esc(n.name)}</b><span>戦力 ${Math.round(n.rating)}${n.stars && n.stars.length ? ' ・ 注目：' + esc(n.stars.slice(0, 3).map(s => s.split('/')[0]).join('、')) : ''}</span></div>
            <div class="opp"><b>日本</b><span>先発 ${fmt1(G.xiRating(S.xi, S.formation))} ・ ${esc(S.formation)} ・ ${E.MENT[S.tactics.ment]}／${E.STYLE[S.tactics.style]}</span></div></div>
          <div class="row"><button class="btn big" data-act="tab" data-v="tactics">スタメンを確認</button><button class="btn go big" data-act="kickoff">キックオフ</button></div>
        </section>`;
      } else {
        hero = `<section class="hero"><h1>全試合終了</h1><div class="row"><button class="btn go big" data-act="end-event">活動を締めくくる</button></div></section>`;
      }
    } else if (S.phase === 'summary') {
      const sm = S.lastSummary || { title: '', lines: [] };
      const nx = G.CALENDAR[S.ev + 1];
      hero = `<section class="hero">
        <div class="eyebrow">活動終了</div>
        <h1>${esc(sm.title)}</h1>
        ${sm.lines.map(l => `<p style="margin:0 0 4px">${esc(l)}</p>`).join('')}
        <div class="row" style="margin-top:12px"><button class="btn go big" data-act="advance">${nx ? `${nx.y}年${nx.m}月へ進む` : '次へ'}</button>${nx ? `<span style="opacity:.8">次：${esc(nx.title)}</span>` : ''}</div>
      </section>`;
    }
    const str = S.jpnRating || G.japanStrength();
    const xi = S.xi.filter(Boolean);
    const st = `<div class="stats3">
      <div class="stat"><b>${fmt1(str)}</b><span>チーム力</span></div>
      <div class="stat"><b>${xi.length ? Math.round(G.teamChem(xi)) : '－'}</b><span>連携</span></div>
      <div class="stat"><b>${Math.round(S.fam[S.formation])}</b><span>${esc(S.formation)} 熟成</span></div>
      <div class="stat"><b>${S.scoutPts}</b><span>視察ポイント</span></div></div>`;
    const ac = S.comps.asiancup && S.comps.asiancup.finish;
    const acOK = ac ? ['優勝', '準優勝', 'ベスト4'].includes(ac) : null;
    const wc = S.wcResult;
    const obj = [
      ['アジアカップ2027 ベスト4以上', acOK, ac],
      ['W杯2030 出場権獲得', S.wcQualified ? true : null, S.wcQualified ? '獲得' : ''],
      ['W杯2030 ベスト8以上', wc ? ['優勝', '準優勝', 'ベスト4', 'ベスト8'].includes(wc) : null, wc],
      ['W杯2030 優勝', wc ? wc === '優勝' : null, '']
    ];
    const W = S.matches.filter(m => m.out === 'W').length, Dr = S.matches.filter(m => m.out === 'D').length, L = S.matches.filter(m => m.out === 'L').length;
    return `<div class="grid" style="gap:16px">
      ${hero}
      <div class="grid g2">
        <section class="card"><h2>ニュース<span class="sub">クラブでの活躍・移籍・負傷</span></h2>
          <ul class="news">${S.news.slice(0, 14).map(n => `<li class="${n.kind}"><span class="d">${esc(n.d)}</span><span><span class="tag">${esc(n.tag)}</span>${esc(n.text)}</span></li>`).join('')}</ul>
        </section>
        <div class="grid" style="align-content:start">
          <section class="card"><h2>チーム状況</h2>${st}
            <p class="small muted" style="margin:10px 0 0">通算 ${W}勝 ${Dr}分 ${L}敗 ・ 視察ポイントは選手詳細から使うと潜在能力の見積もりが正確になる。</p></section>
          <section class="card"><h2>協会からの目標</h2><ul class="objectives">${obj.map(([t, ok, note]) => `<li><span class="st ${ok === true ? 'ok' : ok === false ? 'ng' : ''}">${ok === true ? '✓' : ok === false ? '×' : ''}</span><span>${esc(t)}${note ? ` <span class="muted small">（${esc(note)}）</span>` : ''}</span></li>`).join('')}</ul></section>
          ${resetBlock()}
        </div>
      </div></div>`;
  }

  function resetBlock() {
    if (ui.confirm === 'reset') return `<div class="confirm">セーブを消して最初からやり直しますか？<button class="btn sm" data-act="reset-yes">やり直す</button><button class="btn sm" data-act="reset-no">やめる</button></div>`;
    return `<div class="row"><button class="btn sm" data-act="reset">最初からやり直す</button><button class="btn sm" data-act="theme">表示テーマ切替</button></div>`;
  }

  function ending(S) {
    const champ = S.phase === 'ended' && S.wcResult === '優勝';
    const W = S.matches.filter(m => m.out === 'W').length, Dr = S.matches.filter(m => m.out === 'D').length, L = S.matches.filter(m => m.out === 'L').length;
    const top = G.active().concat(S.players.filter(p => p.retired)).filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);
    const msg = S.phase === 'over' ? (S.overReason || '監督の任期が終了しました。')
      : champ ? '日本サッカー史上初のワールドカップ制覇。あなたの名前は永遠に語り継がれる。'
        : ({ '準優勝': '頂点まであと一歩。それでも日本サッカーは新しい景色を見た。', 'ベスト4': '史上初のベスト4。世界が日本を見る目が変わった。', 'ベスト8': '悲願のベスト8の壁を越えた。目標達成だ。' })[S.wcResult] || 'ベスト8の壁はまだ厚かった。次の世代に夢を託す。';
    return `<section class="card ending ${champ ? 'champ' : ''}">
      <div class="eyebrow">${S.phase === 'over' ? 'GAME OVER' : 'FIFAワールドカップ2030'}</div>
      <div class="res">${S.phase === 'over' ? '解任' : esc(S.wcResult || '')}</div>
      <p style="max-width:52ch;margin:0 auto 16px">${esc(msg)}</p>
      <p class="muted">${esc(S.coach)}監督 通算 ${W}勝 ${Dr}分 ${L}敗 ・ アジアカップ ${esc((S.comps.asiancup && S.comps.asiancup.finish) || '－')}${S.comps.wc ? ` ・ W杯優勝国 ${esc(G.nname(S.comps.wc.champion))}` : ''}</p>
      ${top.length ? `<p class="small">得点ランキング：${top.map(p => `${esc(p.name)} ${p.goals}`).join(' / ')}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary big" data-act="reset-yes">新しいゲーム</button><button class="btn big" data-act="tab" data-v="records">記録を見る</button></div>
    </section>${tab === 'records' ? records(S) : ''}`;
  }

  // ---------- 選手 ----------
  function players(S) {
    const canCall = S.phase === 'prep';
    let ps = G.active().slice();
    if (ui.group !== 'ALL') ps = ps.filter(p => E.POS_GROUP[p.pos] === ui.group);
    if (ui.q) ps = ps.filter(p => p.name.includes(ui.q) || p.club.includes(ui.q));
    if (ui.onlyCalled) ps = ps.filter(p => S.squad.includes(p.id));
    if (ui.abroad) ps = ps.filter(p => p.tier <= 4);
    const key = {
      ovr: p => p.ovr, age: p => G.age(p), pot: p => { const r = G.potRange(p); return (r[0] + r[1]) / 2; }, form: p => p.form,
      caps: p => p.caps, chem: p => p.chem, name: p => p.name, pos: p => ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].indexOf(p.pos), club: p => p.tier
    }[ui.sort];
    ps.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });
    const th = (k, l) => `<th data-act="sort" data-v="${k}">${l}${ui.sort === k ? (ui.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
    return `<div class="filters">
        <div class="seg">${['ALL', 'GK', 'DF', 'MF', 'FW'].map(g => `<button data-act="group" data-v="${g}" aria-pressed="${ui.group === g}">${g === 'ALL' ? '全員' : g}</button>`).join('')}</div>
        <input type="search" id="q" placeholder="選手名・クラブで検索" value="${esc(ui.q)}" aria-label="検索">
        <button class="btn sm" data-act="only-called" aria-pressed="${ui.onlyCalled}">${ui.onlyCalled ? '✓ ' : ''}招集中のみ</button>
        <button class="btn sm" data-act="abroad" aria-pressed="${ui.abroad}">${ui.abroad ? '✓ ' : ''}海外組のみ</button>
        <span class="spacer"></span>
        <span class="small muted">招集 <b class="num" style="font-size:16px;color:var(--ink)">${S.squad.length}</b>/26 ${canCall ? '' : '（活動中は変更不可）'}</span>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>招集</th>${th('name', '選手')}${th('pos', 'ポジ')}${th('age', '年齢')}${th('club', 'クラブ')}<th>出場</th>${th('ovr', '能力')}${th('pot', '潜在')}${th('form', '調子')}${th('chem', '連携')}${th('caps', '出場/得点')}<th>状態</th></tr></thead>
        <tbody>${ps.map(p => {
          const on = S.squad.includes(p.id);
          return `<tr class="${on ? 'called' : ''}">
            <td><button class="check" data-act="call" data-id="${p.id}" aria-pressed="${on}" aria-label="${esc(p.name)}を招集" ${canCall ? '' : 'disabled'}>${on ? '✓' : ''}</button></td>
            <td class="nm" data-act="player" data-id="${p.id}">${esc(p.name)}${p.real ? '' : ' <span class="chip ai">新星</span>'}</td>
            <td>${posChip(p)}${p.alt.length ? ` <span class="muted small">${p.alt.map(a => E.POS_LABEL[a]).join('/')}</span>` : ''}</td>
            <td class="num">${G.ageInt(p)}</td>
            <td><span class="tierdot t${p.tier}"></span>${esc(p.club)}</td>
            <td class="small">${G.STATUS_LABEL[p.status]}</td>
            <td>${ovrTag(p.ovr)}</td>
            <td>${potText(p)}</td>
            <td>${formTag(p.form)}</td>
            <td class="num">${Math.round(p.chem)}</td>
            <td class="num">${p.caps} / ${p.goals}</td>
            <td>${injTag(p)}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="small muted">クラブ格：<span class="tierdot t1"></span>欧州トップ <span class="tierdot t2"></span>欧州強豪 <span class="tierdot t3"></span>欧州主要 <span class="tierdot t4"></span>欧州中堅 <span class="tierdot t5"></span>国内/学生。上位クラブほど成長しやすいが、控えになると伸び悩む。</p>`;
  }

  // ---------- 招集 ----------
  function squad(S) {
    const ev = G.event();
    const prep = S.phase === 'prep';
    const ps = S.squad.map(G.player).filter(Boolean);
    const groups = [['GK', 'GK'], ['DF', 'DF'], ['MF', 'MF'], ['FW', 'FW']];
    const issues = prep ? G.squadIssues(S.squad) : [];
    const item = p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)} ${injTag(p)}</div><div class="c">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ ${G.STATUS_LABEL[p.status]}${prep ? '' : ` ・ コンディション ${Math.round(p.cond)}`}</div></div>${ovrTag(p.ovr)}${prep ? `<button class="btn sm" data-act="call" data-id="${p.id}" aria-label="${esc(p.name)}を外す">外す</button>` : formTag(p.form)}</div>`;
    const recs = prep ? G.active().filter(p => !S.squad.includes(p.id) && G.available(p)).sort((a, b) => (b.ovr + b.form * 0.6) - (a.ovr + a.form * 0.6)).slice(0, 10) : [];
    return `<div class="grid g2">
      <section class="card">
        <h2>${prep ? (ev.kind === 'tour' ? '大会登録メンバー' : '招集メンバー') : '招集メンバー（確定）'}<span class="sub num">${ps.length}/26</span></h2>
        ${issues.length ? `<ul class="issues">${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
        ${prep ? `<div class="row" style="margin-bottom:12px"><button class="btn sm" data-act="auto-squad">自動選考（能力・調子順）</button><button class="btn sm" data-act="drop-injured">負傷者を外す</button><button class="btn sm" data-act="clear-squad">全員外す</button><button class="btn sm" data-act="tab" data-v="players">選手一覧から選ぶ</button></div>` : ''}
        <div class="squad-groups">${groups.map(([g, l]) => { const list = ps.filter(p => E.POS_GROUP[p.pos] === g).sort((a, b) => b.ovr - a.ovr); return `<div class="sg"><h3><span>${l}</span><span class="num">${list.length}</span></h3><div class="plist">${list.map(item).join('') || '<span class="muted small">未選出</span>'}</div></div>`; }).join('')}</div>
      </section>
      <div class="grid" style="align-content:start">
        ${prep ? `<section class="card"><h2>合宿テーマ</h2>
          <div class="trainings">${Object.entries(G.TRAINING).map(([k, t]) => `<button class="train" data-act="focus" data-v="${k}" aria-pressed="${ui.focus === k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
          <div class="row" style="margin-top:14px"><button class="btn go big" data-act="camp" ${issues.length || !ui.focus ? 'disabled' : ''}>合宿開始</button><span class="small muted">${!ui.focus ? 'テーマを選んでください' : ''}</span></div>
        </section>
        <section class="card"><h2>未招集の好調・実力者</h2><div class="plist">${recs.map(p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}</div><div class="c">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ ${G.STATUS_LABEL[p.status]}</div></div>${ovrTag(p.ovr)}<button class="btn sm" data-act="call" data-id="${p.id}">招集</button></div>`).join('')}</div></section>`
        : `<section class="card"><h2>合宿テーマ</h2><p>${esc(S.training ? G.TRAINING[S.training].name + '：' + G.TRAINING[S.training].desc : '－')}</p></section>`}
      </div></div>`;
  }

  // ---------- 戦術 ----------
  function lineEstimate(S) {
    if (S.xi.filter(Boolean).length < 11) return null;
    try {
      const spec = G.japanSpec(S.squad.length ? S.squad : S.xi);
      const sim = new E.MatchSim(spec, G.nationSpec('KOR', 80), { neutral: true });
      sim.teams[0].dayForm = 0;
      return sim.lines(sim.teams[0]);
    } catch (e) { return null; }
  }

  function pitchSVG() {
    const st = 'fill="none" style="stroke:var(--pitch-line)" stroke-width="0.4"';
    return `<svg viewBox="0 0 68 90" preserveAspectRatio="none" aria-hidden="true">
      <rect x="1" y="1" width="66" height="88" ${st}/><line x1="1" y1="45" x2="67" y2="45" ${st}/><circle cx="34" cy="45" r="9" ${st}/>
      <rect x="14" y="1" width="40" height="16" ${st}/><rect x="25" y="1" width="18" height="5.5" ${st}/>
      <rect x="14" y="73" width="40" height="16" ${st}/><rect x="25" y="83.5" width="18" height="5.5" ${st}/></svg>`;
  }

  function tactics(S) {
    const F = E.FORMATIONS[S.formation];
    if (!S.squad.length) return `<section class="card"><h2>戦術</h2><p>まず招集メンバーを決めてください。</p><button class="btn primary" data-act="tab" data-v="squad">招集へ</button></section>`;
    if (S.xi.length !== 11) S.xi = G.autoPick(S.squad, S.formation);
    const slots = F.map((s, i) => {
      const p = G.player(S.xi[i]);
      const fit = p ? E.fit(p, s[0]) : 0;
      return `<button class="slot ${s[0] === 'GK' ? 'gk' : ''} ${p ? '' : 'empty'}" style="left:${s[1]}%;top:${s[2]}%" data-act="slot" data-i="${i}" aria-label="${E.SLOT_LABEL[s[0]]} ${p ? esc(p.name) : '未選択'}">
        <span class="shirt">${p ? Math.round(p.ovr * fit) : '+'}</span><span class="nm">${p ? esc(p.name) : '選択'}</span><span class="lb">${E.SLOT_LABEL[s[0]]}${p && !G.available(p) ? ' ・ 出場不可' : ''}</span>${p && fit < 0.95 ? `<span class="fit">適性 ${Math.round(fit * 100)}%</span>` : ''}</button>`;
    }).join('');
    const bench = S.squad.filter(id => !S.xi.includes(id)).map(G.player).filter(Boolean).sort((a, b) => b.ovr - a.ovr);
    const L = lineEstimate(S);
    const bar = (l, v) => `<div class="bar"><span>${l}</span><span class="tr"><i style="width:${Math.max(0, Math.min(100, (v - 60) * 3.3))}%"></i></span><b>${Math.round(v)}</b></div>`;
    return `<div class="grid g2">
      <section class="card"><h2>スターティングイレブン<span class="sub">選手をタップして入れ替え</span></h2>
        <div class="pitch">${pitchSVG()}${slots}</div>
        <div class="row" style="margin-top:12px;justify-content:center"><button class="btn sm" data-act="auto-xi">ベストメンバーを自動選択</button></div>
      </section>
      <div class="grid" style="align-content:start">
        <section class="card"><h2>フォーメーション</h2>
          <div class="seg">${Object.keys(E.FORMATIONS).map(f => `<button data-act="formation" data-v="${f}" aria-pressed="${S.formation === f}">${f}</button>`).join('')}</div>
          <p class="small muted" style="margin:8px 0 0">熟成度：${Object.entries(S.fam).map(([f, v]) => `${f} <b class="num">${Math.round(v)}</b>`).join(' ・ ')}</p>
          <h2 style="margin-top:16px;font-size:15px">メンタリティ</h2>
          <div class="seg" style="margin-top:8px">${Object.entries(E.MENT).map(([k, l]) => `<button data-act="ment" data-v="${k}" aria-pressed="${S.tactics.ment === k}">${l}</button>`).join('')}</div>
          <h2 style="margin-top:16px;font-size:15px">スタイル</h2>
          <div class="seg" style="margin-top:8px">${Object.entries(E.STYLE).map(([k, l]) => `<button data-act="style" data-v="${k}" aria-pressed="${S.tactics.style === k}">${l}</button>`).join('')}</div>
          <p class="small muted" style="margin:8px 0 0">${({ bal: '状況に応じて戦う標準的なスタイル。', pos: 'ボールを保持して中盤を支配。相手のハイプレスにはやや弱い。', counter: '保持率は下がるが、前がかりの相手を一撃で仕留める。', press: '前線から奪いに行き相手のシュートを減らすが、後半に消耗する。' })[S.tactics.style]}</p>
          <div class="row" style="margin-top:14px"><button class="btn sm" data-act="autosub" aria-pressed="${S.autoSub}">${S.autoSub ? '✓ ' : ''}交代をコーチに任せる</button></div>
        </section>
        <section class="card"><h2>推定戦力<span class="sub">連携 ${Math.round(G.teamChem(S.xi))} ・ 熟成 ${Math.round(S.fam[S.formation])}</span></h2>
          ${L ? `<div class="bars">${bar('攻撃', L.att)}${bar('中盤', L.mid)}${bar('守備', L.def)}${bar('GK', L.gk)}</div>` : '<p class="muted">11人を選ぶと表示</p>'}
        </section>
        <section class="card"><h2>ベンチ<span class="sub num">${bench.length}人</span></h2><div class="plist">${bench.map(p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)} ${injTag(p)}</div><div class="c">コンディション ${Math.round(p.cond)} ・ 連携 ${Math.round(p.chem)}</div></div>${ovrTag(p.ovr)}${formTag(p.form)}</div>`).join('')}</div></section>
      </div></div>`;
  }

  // ---------- 日程・大会 ----------
  function groupTable(g, title, opts) {
    const rows = G.table(g);
    const adv = (opts && opts.adv) || 2;
    return `<div class="tbl-wrap"><table><thead><tr><th>${esc(title)}</th><th>試</th><th>勝</th><th>分</th><th>敗</th><th>得失</th><th>勝点</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.code === 'JPN' ? 'me' : ''}"><td><span class="num muted">${i + 1}</span> ${nat(r.code)}${i < adv ? ' <span class="chip good">↑</span>' : ''}</td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function fixtures(g) {
    return `<div class="small" style="display:grid;gap:2px;margin-top:8px">${g.rounds.map((r, i) => r.filter(m => m.h === 'JPN' || m.a === 'JPN').map(m => `<div>第${i + 1}節 ${esc(G.nname(m.h))} ${m.res ? `<b class="num">${m.res.ga}-${m.res.gb}</b>` : 'vs'} ${esc(G.nname(m.a))}</div>`).join('')).join('')}</div>`;
  }

  function tourView(t) {
    const g = G.tourGroupOfJapan(t);
    let html = `<section class="card"><h2>${esc(t.name)}<span class="sub">${t.champion ? '優勝：' + esc(G.nname(t.champion)) : t.stage === 'group' ? `グループステージ 第${t.md + 1}節` : t.roundNames[t.round] || ''}${t.finish ? ' ・ 日本：' + esc(t.finish) : ''}</span></h2>`;
    html += groupTable(g, 'グループ' + g.name, { adv: 2 });
    if (t.ko.length) {
      html += `<h3 style="font-size:13px;margin:16px 0 8px">決勝トーナメント</h3><div class="bracket">${t.ko.map((r, i) => `<div class="col"><h4>${esc(t.roundNames[i])}</h4>${r.map(m => {
        const w = m.res ? (m.res.winner === 0 ? m.h : m.a) : null;
        const sc = (c, v) => m.res ? `${v}${m.res.pens ? `<span class="muted">(${c === m.h ? m.res.pens[0] : m.res.pens[1]})</span>` : ''}` : '';
        return `<div class="tie ${m.h === 'JPN' || m.a === 'JPN' ? 'j' : ''}"><div class="${w === m.h ? 'w' : ''}"><span>${esc(G.nname(m.h))}</span><span class="num">${sc(m.h, m.res ? m.res.ga : '')}</span></div><div class="${w === m.a ? 'w' : ''}"><span>${esc(G.nname(m.a))}</span><span class="num">${sc(m.a, m.res ? m.res.gb : '')}</span></div></div>`;
      }).join('')}</div>`).join('')}</div>`;
    }
    html += `<details style="margin-top:14px"><summary class="small" style="cursor:pointer;font-weight:700">全グループを見る</summary><div class="groups" style="margin-top:10px">${t.groups.map(x => groupTable(x, 'グループ' + x.name)).join('')}</div></details></section>`;
    return html;
  }

  function schedule(S) {
    const cal = G.CALENDAR.map((e, i) => {
      const cls = i < S.ev ? 'done' : i === S.ev ? 'now' : '';
      const big = e.kind === 'tour' ? 'big' : '';
      return `<li class="${cls} ${big}"><span class="d">${e.y}.${String(e.m).padStart(2, '0')}</span><span class="pt"></span><span class="t">${esc(e.title)}</span></li>`;
    }).join('');
    const comps = [];
    const ev = G.event();
    if (S.comps.wc) comps.push(tourView(S.comps.wc));
    if (S.comps.q4 && S.comps.q4.teams.includes('JPN')) comps.push(`<section class="card"><h2>W杯アジア4次予選<span class="sub">1位のみ出場権</span></h2>${groupTable(S.comps.q4, 'グループ', { adv: 1 })}${fixtures(S.comps.q4)}</section>`);
    if (S.comps.q3) comps.push(`<section class="card"><h2>W杯アジア最終予選<span class="sub">上位2位が出場権、3-4位は4次予選</span></h2>${groupTable(S.comps.q3, 'グループ' + S.comps.q3.name)}${fixtures(S.comps.q3)}</section>`);
    if (S.comps.q2) comps.push(`<section class="card"><h2>W杯アジア2次予選<span class="sub">上位2位が最終予選へ</span></h2>${groupTable(S.comps.q2, 'グループ' + S.comps.q2.name)}${fixtures(S.comps.q2)}</section>`);
    if (S.comps.asiancup) comps.push(tourView(S.comps.asiancup));
    void ev;
    return `<div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr)">
      <section class="card"><h2>日程<span class="sub">2026年10月〜2030年7月</span></h2><ul class="timeline">${cal}</ul></section>
      <div class="grid" style="align-content:start">${comps.join('') || '<section class="card"><p class="muted">公式大会はまだ始まっていない。最初の公式戦は2027年1月のアジアカップ。</p></section>'}</div></div>`;
  }

  // ---------- 記録 ----------
  function records(S) {
    const ps = S.players.filter(p => p.caps > 0);
    const scorers = ps.slice().sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
    const caps = ps.slice().sort((a, b) => b.caps - a.caps).slice(0, 10);
    const compName = { friendly: '親善試合', q2: '2次予選', q3: '最終予選', q4: '4次予選', asiancup: 'アジア杯', wc: 'W杯' };
    return `<div class="grid g2">
      <section class="card"><h2>試合結果<span class="sub">${S.matches.length}試合</span></h2>
        ${S.matches.length ? `<div class="tbl-wrap"><table><thead><tr><th>日付</th><th>大会</th><th>相手</th><th>結果</th><th>スコア</th><th>得点者</th><th>MOM</th></tr></thead><tbody>
        ${S.matches.map(m => `<tr><td class="num">${esc(m.d)}</td><td>${esc(compName[m.comp] || m.comp)}</td><td>${nat(m.opp)}</td><td>${resChip(m.out)}</td><td class="num"><b>${m.gf}-${m.ga}</b>${m.pens ? ` <span class="muted">PK${m.pens[0]}-${m.pens[1]}</span>` : ''}</td><td class="small">${esc(m.scorers.join('、'))}</td><td class="small">${esc(m.motm)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">まだ試合をしていない。</p>'}
      </section>
      <div class="grid" style="align-content:start">
        <section class="card"><h2>得点ランキング</h2>${scorers.length ? `<div class="plist">${scorers.map(p => `<div class="pitem">${posChip(p)}<div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}${p.retired ? ' <span class="muted small">引退</span>' : ''}</div><span class="num"><b>${p.goals}</b>点</span><span class="num muted">${p.assists}A</span></div>`).join('')}</div>` : '<p class="muted">－</p>'}</section>
        <section class="card"><h2>出場数</h2>${caps.length ? `<div class="plist">${caps.map(p => `<div class="pitem">${posChip(p)}<div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}</div><span class="num"><b>${p.caps}</b>試合</span><span></span></div>`).join('')}</div>` : '<p class="muted">－</p>'}</section>
      </div></div>`;
  }

  // ---------- モーダル ----------
  function renderModal() {
    const m = ui.modal;
    const host = $('modal');
    if (!m) { host.innerHTML = ''; return; }
    const S = G.state();
    if (m.type === 'player') host.innerHTML = playerModal(S, G.player(m.id));
    if (m.type === 'slot') host.innerHTML = slotModal(S, m.i);
  }

  function spark(hist) {
    if (!hist || hist.length < 2) return '';
    const vs = hist.map(h => h[1]);
    const lo = Math.min(...vs) - 2, hi = Math.max(...vs) + 2;
    const W = 300, H = 70;
    const pts = vs.map((v, i) => `${(i / (vs.length - 1) * (W - 20) + 10).toFixed(1)},${(H - 12 - (v - lo) / (hi - lo) * (H - 24)).toFixed(1)}`);
    const last = pts[pts.length - 1].split(',');
    const y0 = hist[0][0], y1 = hist[hist.length - 1][0];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="能力の推移">
      <polyline points="${pts.join(' ')}" fill="none" style="stroke:var(--ai)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="3.5" style="fill:var(--hi)"/>
      <text x="10" y="${H - 1}" style="fill:var(--ink-3)" font-size="10">${Math.floor(y0 / 100)}.${y0 % 100}</text>
      <text x="${W - 10}" y="${H - 1}" text-anchor="end" style="fill:var(--ink-3)" font-size="10">${Math.floor(y1 / 100)}.${y1 % 100}</text></svg>`;
  }

  function playerModal(S, p) {
    if (!p) return '';
    const on = S.squad.includes(p.id);
    const attrs = G.attributes(p);
    const tierL = window.SBData.CLUB_TIER_LABEL[p.tier] || 'ユース/学生';
    const avgR = p.ratings.length ? (p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length).toFixed(2) : '－';
    return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <div class="modal-h"><div><div class="eyebrow">${E.POS_LABEL[p.pos]}${p.alt.length ? ' / ' + p.alt.map(a => E.POS_LABEL[a]).join(' / ') : ''} ・ ${G.ageInt(p)}歳${p.real ? '' : ' ・ 新星'}</div><h2>${esc(p.name)}</h2>
        <div class="row" style="margin-top:4px">${p.traits.map(t => `<span class="chip ${t === 'ガラスの体' ? 'bad' : 'ai'}">${esc(t)}</span>`).join('')} ${injTag(p)}</div></div>
        <button class="x" data-act="close" aria-label="閉じる">×</button></div>
      <div class="kv">
        <div><span>能力</span><b>${ovrTag(p.ovr)} <span class="muted small num">${fmt1(p.ovr)}</span></b></div>
        <div><span>潜在（見積）</span><b>${potText(p)}</b></div>
        <div><span>所属</span><b class="small">${esc(p.club)}</b><div class="small muted">${esc(tierL)}</div></div>
        <div><span>クラブでの立場</span><b class="small">${G.STATUS_LABEL[p.status]}</b></div>
        <div><span>調子</span><b>${formTag(p.form)} <span class="num">${p.form > 0 ? '+' : ''}${fmt1(p.form)}</span></b></div>
        <div><span>連携</span><b class="num">${Math.round(p.chem)}</b></div>
        <div><span>代表 出場/得点/A</span><b class="num">${p.caps} / ${p.goals} / ${p.assists}</b></div>
        <div><span>直近評価点</span><b class="num">${avgR}</b></div>
      </div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px">
        <div class="bars">${Object.entries(attrs).map(([k, v]) => `<div class="bar"><span>${k}</span><span class="tr"><i style="width:${v}%"></i></span><b>${v}</b></div>`).join('')}</div>
        <div><div class="eyebrow">能力の推移</div>${spark(p.hist)}<p class="small muted" style="margin:6px 0 0">${p.know >= 3 ? '代表で直接見ており、潜在能力の見積もりは正確。' : `視察するほど潜在能力の見積もりが正確になる（現在 ${p.know}/3）。`}</p></div>
      </div>
      <div class="row" style="margin-top:16px">
        ${S.phase === 'prep' ? `<button class="btn ${on ? '' : 'primary'}" data-act="call" data-id="${p.id}">${on ? '招集から外す' : '招集する'}</button>` : ''}
        ${p.know < 3 ? `<button class="btn" data-act="scout" data-id="${p.id}" ${S.scoutPts > 0 ? '' : 'disabled'}>視察する（残り${S.scoutPts}）</button>` : ''}
      </div></div></div>`;
  }

  function slotModal(S, i) {
    const slot = E.FORMATIONS[S.formation][i][0];
    const cands = S.squad.map(G.player).filter(Boolean).map(p => ({ p, v: p.ovr * E.fit(p, slot), f: E.fit(p, slot) })).sort((a, b) => b.v - a.v);
    return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="選手選択">
      <div class="modal-h"><div><div class="eyebrow">スロット</div><h2>${E.SLOT_LABEL[slot]} に起用する選手</h2></div><button class="x" data-act="close" aria-label="閉じる">×</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>選手</th><th>ポジ</th><th>実効</th><th>適性</th><th>調子</th><th>コンディション</th><th>連携</th><th></th></tr></thead><tbody>
      ${cands.map(({ p, v, f }) => { const cur = S.xi.indexOf(p.id); const ok = G.available(p); return `<tr class="${cur === i ? 'called' : ''}"><td class="nm" data-act="${ok ? 'pick-slot' : ''}" data-i="${i}" data-id="${p.id}">${esc(p.name)} ${injTag(p)}</td><td>${posChip(p)}</td><td>${ovrTag(v)}</td><td class="num">${Math.round(f * 100)}%</td><td>${formTag(p.form)}</td><td class="num">${Math.round(p.cond)}</td><td class="num">${Math.round(p.chem)}</td><td>${ok ? `<button class="btn sm" data-act="pick-slot" data-i="${i}" data-id="${p.id}">${cur >= 0 && cur !== i ? '入替' : '起用'}</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div></div>`;
  }

  // ---------- 試合 ----------
  function kickoff() {
    const S = G.state();
    const fx = G.nextFixture();
    if (!fx) return;
    void S;
    const sim = G.createMatch(fx);
    live = { fx, sim, speed: 2, paused: false, panel: false, sel: null, msg: '', timer: null, done: false };
    sim.next();
    renderLive();
    schedule_();
  }

  const SPEEDS = { 1: 420, 2: 180, 4: 55 };
  function schedule_() {
    clearTimeout(live && live.timer);
    if (!live || live.paused || live.done) return;
    live.timer = setTimeout(tick, SPEEDS[live.speed]);
  }

  function tick() {
    if (!live || live.paused || live.done) return;
    step();
    updateLive();
    schedule_();
  }

  // 1分進め、停止が必要か判定
  function step() {
    const sim = live.sim, us = sim.userSide;
    const evs = sim.next();
    if (sim.phase === 'done') { finishLive(); return true; }
    if (sim.phase === 'ht') { live.paused = true; live.panel = true; live.msg = 'ハーフタイム。交代や戦術変更ができる。'; return true; }
    if (sim.phase === 'ft90') { live.paused = true; live.panel = true; live.msg = '90分で決着つかず。延長戦の前に采配を。'; return true; }
    const dec = evs.find(e => e.needsDecision && e.side === us);
    if (dec) { live.paused = true; live.panel = true; live.msg = dec.type === 'injury' ? '負傷者が出た。交代するか判断を。' : '退場者が出た。布陣を見直そう。'; return true; }
    return false;
  }

  function skipToBreak() {
    let g = 0;
    while (live && !live.done && g++ < 200) { if (step()) break; }
    if (live && !live.done) { updateLive(); }
  }

  function finishLive() {
    const S = G.state();
    live.done = true; live.paused = true; live.panel = false;
    live.rec = G.applyResult(live.fx, live.sim);
    void S;
    renderLive();
  }

  function feedHTML(sim) {
    const us = sim.userSide;
    return sim.events.slice().reverse().map(e => {
      const who = e.side === -1 ? 'sys' : e.side === us ? 'us' : 'them';
      return `<div class="${e.type} ${who}"><span class="m">${e.side === -1 && e.min === 0 ? '' : e.min + "'"}</span><span class="t">${e.side >= 0 && e.type !== 'sub' && e.type !== 'goal' ? `<b>${esc(sim.teams[e.side].spec.code)}</b> ` : ''}${esc(e.text)}</span></div>`;
    }).join('');
  }

  function boardHTML(sim) {
    const [A, B] = sim.teams;
    const ph = { pre: '', first: '前半', ht: 'ハーフタイム', second: '後半', ft90: '90分', et: '延長', pens: 'PK戦', done: '試合終了' }[sim.phase];
    const poss = sim.possession();
    return `<div class="board">
        <div class="tm"><span>${esc(A.spec.name)}</span><small>${esc(A.spec.formation)} ・ ${E.MENT[A.spec.tactics.ment]}</small></div>
        <div><div class="sc">${sim.score[0]} - ${sim.score[1]}</div><span class="clock num">${sim.minute}' ${ph}${sim.pens ? ` ・ PK ${sim.pens[0]}-${sim.pens[1]}` : ''}</span></div>
        <div class="tm r"><span>${esc(B.spec.name)}</span><small>${esc(B.spec.formation)} ・ ${E.MENT[B.spec.tactics.ment]}</small></div>
      </div>
      <div class="possbar" title="支配率"><i style="width:${poss[0]}%"></i><u></u></div>
      <div class="row small muted"><span>支配率 ${poss[0]}%</span><span class="spacer"></span><span>${poss[1]}%</span></div>`;
  }

  function statsHTML(sim) {
    const [a, b] = sim.teams.map(t => t.stats);
    const row = (l, x, y) => `<div class="r3"><b>${x}</b><span class="muted">${l}</span><b>${y}</b></div>`;
    return `<div class="mstats">${row('シュート', a.shots, b.shots)}${row('枠内', a.sot, b.sot)}${row('xG', a.xg.toFixed(2), b.xg.toFixed(2))}${row('CK/FK', a.corners, b.corners)}${row('警告', a.yellow, b.yellow)}${row('退場', a.red, b.red)}</div>`;
  }

  function ctrlHTML() {
    if (live.done) return `<button class="btn primary big" data-act="live-close">結果を確定して戻る</button>`;
    const sp = [1, 2, 4].map(s => `<button data-act="live-speed" data-v="${s}" aria-pressed="${live.speed === s && !live.paused}">${s}×</button>`).join('');
    return `<div class="seg">${sp}</div>
      <button class="btn ${live.paused ? 'go' : ''}" data-act="live-pause">${live.paused ? (live.sim.phase === 'ht' ? '後半開始' : live.sim.phase === 'ft90' ? '延長開始' : '再開') : '一時停止・采配'}</button>
      <button class="btn" data-act="live-skip">次の区切りまで進める</button>
      <span class="small muted">${esc(live.msg || '')}</span>`;
  }

  function panelHTML() {
    const sim = live.sim, us = sim.userSide, T = sim.teams[us];
    const items = T.onPitch.map((e, i) => {
      const st = Math.round(e.stamina);
      return `<button class="op ${e.sent ? 'out' : ''}" data-act="${e.sent ? '' : 'live-sel'}" data-i="${i}" aria-pressed="${live.sel === i}"><span class="num muted">${E.SLOT_LABEL[e.slot]}</span><span>${esc(e.p.name)}${e.yc ? ' <span class="chip">警告</span>' : ''}${e.injured ? ' <span class="chip bad">負傷</span>' : ''}${e.sent ? ' 退場' : ''}</span><span class="stm"><i class="${st < 45 ? 'low' : st < 65 ? 'mid' : ''}" style="width:${st}%"></i></span><span class="num">${Math.round(sim.eff(e))}</span></button>`;
    }).join('');
    const bench = T.bench.slice().sort((a, b) => b.ovr - a.ovr).map(p => {
      const slot = live.sel != null ? T.onPitch[live.sel].slot : null;
      const f = slot ? E.fit(p, slot) : 1;
      return `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n">${esc(p.name)}</div><div class="c">${slot ? `${E.SLOT_LABEL[slot]}適性 ${Math.round(f * 100)}% ・ ` : ''}コンディション ${Math.round(p.cond)}</div></div>${ovrTag(p.ovr * f)}<button class="btn sm" data-act="live-sub" data-id="${p.id}" ${live.sel == null || T.subsLeft <= 0 ? 'disabled' : ''}>投入</button></div>`;
    }).join('');
    return `<section class="card" style="margin-top:14px"><h2>采配<span class="sub">交代枠 残り${T.subsLeft}</span></h2>
      <div class="grid g2">
        <div><div class="eyebrow" style="margin-bottom:6px">ピッチ上（交代する選手を選択）</div><div class="onpitch">${items}</div></div>
        <div>
          <div class="eyebrow" style="margin-bottom:6px">メンタリティ</div>
          <div class="seg">${Object.entries(E.MENT).map(([k, l]) => `<button data-act="live-ment" data-v="${k}" aria-pressed="${T.spec.tactics.ment === k}">${l}</button>`).join('')}</div>
          <div class="eyebrow" style="margin:10px 0 6px">スタイル</div>
          <div class="seg">${Object.entries(E.STYLE).map(([k, l]) => `<button data-act="live-style" data-v="${k}" aria-pressed="${T.spec.tactics.style === k}">${l}</button>`).join('')}</div>
          <div class="eyebrow" style="margin:12px 0 6px">ベンチ</div><div class="plist" style="max-height:300px;overflow-y:auto">${bench || '<span class="muted small">控えなし</span>'}</div>
        </div>
      </div></section>`;
  }

  function resultHTML() {
    const sim = live.sim, us = sim.userSide, r = sim.result(), rec = live.rec;
    const ps = r.players[us].slice().sort((a, b) => (b.minutes > 0) - (a.minutes > 0) || b.rating - a.rating);
    const title = rec.out === 'W' ? '勝利' : rec.out === 'L' ? '敗戦' : '引き分け';
    return `<section class="card" style="margin-top:14px"><h2>${title}<span class="sub">協会評価 ${rec.board >= 0 ? '+' : ''}${rec.board} ・ MOM ${esc(rec.motm)}</span></h2>
      <div class="tbl-wrap"><table><thead><tr><th>選手</th><th>位置</th><th>出場</th><th>得点</th><th>A</th><th>評価</th></tr></thead><tbody>
      ${ps.map(x => `<tr><td>${esc(x.name)}${x.injured ? ' <span class="chip bad">負傷</span>' : ''}${x.red ? ' <span class="chip bad">退場</span>' : ''}</td><td class="small">${E.SLOT_LABEL[x.slot]}</td><td class="num">${x.minutes}'</td><td class="num">${x.goals || ''}</td><td class="num">${x.assists || ''}</td><td><span class="rt ${x.rating >= 7.5 ? 'hi' : x.rating < 5.8 ? 'lo' : ''}">${x.rating.toFixed(1)}</span></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  function renderLive() {
    const host = $('live');
    if (!live) { host.innerHTML = ''; return; }
    const sim = live.sim;
    host.innerHTML = `<div class="overlay"><div class="modal wide live" role="dialog" aria-modal="true" aria-label="試合">
      <div class="eyebrow" style="margin-bottom:8px">${esc(live.fx.label)}</div>
      <div id="lv-board">${boardHTML(sim)}</div>
      <div class="ctrls" id="lv-ctrl">${ctrlHTML()}</div>
      ${live.done ? resultHTML() : ''}
      ${live.panel && !live.done ? panelHTML() : ''}
      <div class="live-grid">
        <div class="feed" id="lv-feed" aria-live="polite">${feedHTML(sim)}</div>
        <div class="card"><h2>スタッツ<span class="sub">${esc(sim.teams[0].spec.code)} - ${esc(sim.teams[1].spec.code)}</span></h2><div id="lv-stats">${statsHTML(sim)}</div></div>
      </div></div></div>`;
  }

  function updateLive() {
    if (!live) return;
    if (live.paused || live.done) { renderLive(); return; }
    $('lv-board').innerHTML = boardHTML(live.sim);
    $('lv-feed').innerHTML = feedHTML(live.sim);
    $('lv-stats').innerHTML = statsHTML(live.sim);
  }

  // ---------- 操作 ----------
  const actions = {
    'new-game'() {
      const name = ($('coach-name').value || '').trim() || '監督';
      G.newGame(name); tab = 'home'; ui.focus = null; render();
    },
    continue() { G.load(); tab = 'home'; render(); },
    tab(d) { tab = d.v; ui.modal = null; render(); window.scrollTo(0, 0); },
    reset() { ui.confirm = 'reset'; render(); },
    'reset-no'() { ui.confirm = null; render(); },
    'reset-yes'() { ui.confirm = null; G.clearSave(); G.setState(null); tab = 'home'; render(); },
    theme() {
      const r = document.documentElement;
      const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      r.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('sbm-theme', r.dataset.theme); } catch (e) { /* 無視 */ }
    },
    group(d) { ui.group = d.v; render(); },
    sort(d) { if (ui.sort === d.v) ui.dir *= -1; else { ui.sort = d.v; ui.dir = d.v === 'name' || d.v === 'pos' || d.v === 'club' ? 1 : -1; } render(); },
    'only-called'() { ui.onlyCalled = !ui.onlyCalled; render(); },
    abroad() { ui.abroad = !ui.abroad; render(); },
    call(d) {
      const S = G.state(); if (S.phase !== 'prep') return;
      const i = S.squad.indexOf(d.id);
      if (i >= 0) { S.squad.splice(i, 1); S.xi = S.xi.map(x => x === d.id ? null : x); }
      else { if (S.squad.length >= 26) { toast('招集は最大26人まで'); return; } S.squad.push(d.id); }
      G.save(); render();
    },
    'auto-squad'() { const S = G.state(); S.squad = G.autoSquad(26); S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); toast('26人を自動選考した'); },
    'drop-injured'() { const S = G.state(); S.squad = S.squad.filter(id => G.available(G.player(id))); G.save(); render(); },
    'clear-squad'() { const S = G.state(); S.squad = []; S.xi = []; G.save(); render(); },
    focus(d) { ui.focus = d.v; render(); },
    camp() {
      const S = G.state();
      if (G.squadIssues(S.squad).length || !ui.focus) return;
      G.confirmCamp(ui.focus); ui.focus = null; tab = 'home'; render(); toast('合宿開始。スタメンと戦術を確認しよう');
    },
    player(d) { ui.modal = { type: 'player', id: d.id }; renderModal(); },
    close() { ui.modal = null; renderModal(); },
    'close-bg'(d, el, ev) { if (ev.target === el) { ui.modal = null; renderModal(); } },
    scout(d) { if (G.scout(d.id)) { G.save(); render(); toast('視察で見積もりが更新された'); } },
    slot(d) { ui.modal = { type: 'slot', i: +d.i }; renderModal(); },
    'pick-slot'(d) {
      const S = G.state(); const i = +d.i; const cur = S.xi.indexOf(d.id);
      if (cur >= 0 && cur !== i) S.xi[cur] = S.xi[i];
      S.xi[i] = d.id; ui.modal = null; G.save(); render();
    },
    'auto-xi'() { const S = G.state(); S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); },
    formation(d) { const S = G.state(); S.formation = d.v; S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); },
    ment(d) { G.state().tactics.ment = d.v; G.save(); render(); },
    style(d) { G.state().tactics.style = d.v; G.save(); render(); },
    autosub() { const S = G.state(); S.autoSub = !S.autoSub; G.save(); render(); },
    kickoff() { kickoff(); },
    'end-event'() { G.endEvent(); render(); },
    advance() { G.advance(); tab = 'home'; render(); window.scrollTo(0, 0); },
    // 試合中
    'live-speed'(d) { live.speed = +d.v; if (live.paused) { live.paused = false; live.panel = false; live.msg = ''; live.sel = null; resumeSim(); renderLive(); } else updateCtrl(); schedule_(); },
    'live-pause'() {
      if (live.paused) { live.paused = false; live.panel = false; live.msg = ''; live.sel = null; resumeSim(); renderLive(); schedule_(); }
      else { live.paused = true; live.panel = true; clearTimeout(live.timer); renderLive(); }
    },
    'live-skip'() { if (live.paused) { live.paused = false; live.panel = false; live.msg = ''; live.sel = null; resumeSim(); } clearTimeout(live.timer); skipToBreak(); if (!live.done) renderLive(); },
    'live-sel'(d) { live.sel = +d.i; renderLive(); },
    'live-sub'(d) {
      const sim = live.sim; if (live.sel == null) return;
      if (sim.substitute(sim.userSide, live.sel, d.id)) { live.sel = null; live.msg = '交代を行った'; renderLive(); }
    },
    'live-ment'(d) { live.sim.teams[live.sim.userSide].spec.tactics.ment = d.v; renderLive(); },
    'live-style'(d) { live.sim.teams[live.sim.userSide].spec.tactics.style = d.v; renderLive(); },
    'live-close'() {
      clearTimeout(live.timer); live = null; renderLive();
      if (G.eventFinished()) G.endEvent();
      tab = 'home'; render(); window.scrollTo(0, 0);
    }
  };
  function updateCtrl() { const c = $('lv-ctrl'); if (c) c.innerHTML = ctrlHTML(); }
  function resumeSim() { const sim = live.sim; if (sim.phase === 'ht' || sim.phase === 'ft90') sim.resume(); }

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || !el.dataset.act) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el.dataset, el, ev);
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'q') {
      ui.q = ev.target.value;
      const pos = ev.target.selectionStart;
      render();
      const q = $('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* 無視 */ } }
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && ui.modal) { ui.modal = null; renderModal(); }
    if (ev.key === 'Enter' && ev.target.id === 'coach-name') actions['new-game']();
  });

  try { const t = localStorage.getItem('sbm-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* 無視 */ }

  function boot() {
    if (G.load()) render(); else renderTitle();
  }
  // 公開中の画面への更新時に試合以外の状態を保つ
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ tab }));
  if (hot && hot.ready) hot.ready(d => { if (d && d.tab) tab = d.tab; boot(); }); else boot();
})();
