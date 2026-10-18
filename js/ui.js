// 画面描画と操作
(function () {
  'use strict';
  const G = window.SBGame, E = window.SBEngine, W = window.SBWorld, ST = window.SBStaff, M = window.SBMedia, C = window.SBCamp, X = window.SBExtra, LF = window.SBLife, RK = window.SBRank;
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
  const FORM5 = f => f >= 2 ? ['⬆', '絶好調', 'f5'] : f >= 0.7 ? ['↗', '好調', 'f4'] : f > -0.7 ? ['➡', '普通', 'f3'] : f > -2 ? ['↘', '不調', 'f2'] : ['⬇', '絶不調', 'f1'];
  const formTag = f => { const [i, l, c] = FORM5(f); return `<span class="farrow ${c}" title="${l}" aria-label="調子：${l}">${i}</span>`; };
  // 招集リスト用の状態チップ
  function stateChips(p, opts) {
    const S = G.state();
    const out = [];
    if (S.captain === p.id) out.push('<span class="chip cap">主将</span>'); else if (S.vice === p.id) out.push('<span class="chip cap">副主将</span>');
    if (p.injury > 0) out.push(injTag(p));
    else if (G.suspended(p)) out.push('<span class="chip bad">出場停止</span>');
    if (p.awayGames > 0) out.push('<span class="chip bad">次戦欠場</span>');
    const yc = p.yc && p.yc[G.curGroup()];
    if (yc >= 1) out.push(`<span class="chip warn">警告${yc}枚</span>`);
    if (p.minCap) out.push(`<span class="chip warn">出場${p.minCap}分まで</span>`);
    if (p.dual && p.dual.status === 'undecided') out.push(`<span class="chip ai">二重国籍（${esc(p.dual.nation)}）</span>`);
    if (G.isOly() && !G.olyEligible(p)) out.push('<span class="chip">OA</span>');
    const f = p.form + (p.mood || 0) * 0.35;
    if (f >= 2) out.push('<span class="chip good">絶好調</span>'); else if (f >= 1) out.push('<span class="chip good">好調</span>');
    else if (f <= -2) out.push('<span class="chip bad">絶不調</span>'); else if (f <= -1) out.push('<span class="chip warn">不調</span>');
    if (p.injury <= 0 && (p.sharp == null ? 70 : p.sharp) < 45) out.push('<span class="chip warn">試合勘↓</span>');
    if ((p.load || 0) > 500 && p.injury <= 0) out.push('<span class="chip warn">疲労</span>');
    if (p.injury <= 0 && W.weeksSinceReturn(S, p) < 6) out.push('<span class="chip warn">復帰明け</span>');
    if ((p.mood || 0) >= 1.5) out.push('<span class="chip ai">意欲◎</span>'); else if ((p.mood || 0) <= -1.2) out.push('<span class="chip bad">不満</span>');
    if (opts && opts.rumor && p.rumor) out.push('<span class="chip ai">噂</span>');
    if (p.status === 'bench') out.push('<span class="chip">クラブで控え</span>');
    return out.join(' ');
  }
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
    if (p.injury > 0 && G.minorInjury(p)) return `<span class="chip warn" title="${esc(W.injText(p))}">軽傷 約${Math.max(1, Math.ceil(p.injury))}週${p.sepMenu ? '・別メニュー' : ''}</span>`;
    if (p.injury > 0) { const w = Math.max(1, Math.ceil(p.injury)); return `<span class="chip bad" title="${esc(W.injText(p))}">負傷 ${w >= 9 ? `約${Math.round(w / 4.33)}か月` : `約${w}週`}</span>`; }
    if (p.susp) return '<span class="chip bad">出場停止</span>';
    return '';
  }

  // ---------- タイトル ----------
  function renderTitle() {
    let saved = null;
    try { saved = localStorage.getItem('samurai-blue-manager-v2'); } catch (e) { saved = null; }
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
    const tabs = [['home', 'ホーム'], ['staff', 'スタッフ'], ['squad', '招集'], ['players', '選手'], ['scout', '視察'], ['tactics', '戦術'], ['schedule', '日程・大会'], ['records', '記録']];
    const dot = k => (k === 'staff' && S.phase === 'prep' && S.cur.reports && !S.cur.reportsSeen) || (k === 'squad' && S.phase === 'prep') || (k === 'home' && S.phase === 'summary') ? '<span class="dot"></span>' : '';
    return `<header class="top"><div class="top-in">
        <div class="brand"><span class="disc"></span>サムライブルー<small>MANAGER</small></div>
        <div class="top-meta">
          <div class="meta"><b class="num">${S.date.y}.${String(S.date.m).padStart(2, '0')}</b><span>${esc(ev ? ev.title : '大会終了')}</span></div>
          <div class="meta"><b class="num">${fmt1(str)}</b><span>チーム力</span></div>
          ${RK && S.fifa ? `<div class="meta"><b class="num">${RK.rankOf('JPN')}位</b><span>FIFAランク</span></div>` : ''}
          <div class="meta"><b class="num">${Math.round(S.morale)}</b><span>チーム士気</span><div class="meter ${S.morale < 35 ? 'low' : ''}"><i style="width:${S.morale}%"></i></div></div>
          <div class="meta"><b class="num">${Math.round(S.fans)}</b><span>世論</span><div class="meter ${S.fans < 30 ? 'low' : ''}"><i style="width:${S.fans}%"></i></div></div>
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
    else body = ({ home, staff, players, squad, scout, tactics, schedule, records })[tab](S);
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
      if (ev.kind === 'tour') { const t = G.tourOf(ev); const g = G.tourGroupOfJapan(t); compInfo = `<div class="vs">${g.teams.filter(c => c !== 'JPN').map(c => { const n = G.nation(c); return `<div class="opp"><b>${esc(n.name)}</b><span>グループ${g.name}・戦力 ${Math.round(n.rating)}</span></div>`; }).join('')}</div>`; }
      hero = `<section class="hero">
        <div class="eyebrow">${S.date.y}年${S.date.m}月 ・ 代表活動</div>
        <h1>${esc(S.cur.title || ev.title)}</h1>
        ${opp}${compInfo}
        <p>${G.isE1() ? 'E-1選手権は国内組（Jリーグ所属）だけで戦う。18〜23人を選考する。' : G.isOly() ? '五輪はU-23（2005年以降生まれ）とオーバーエイジ3人までの16〜18人で戦う。' : ev.kind === 'tour' ? '大会登録メンバー（23〜26人）を選考する。大会中はメンバーを変更できない。' : '招集メンバー（20〜26人）を選考する。'}選考が固まったらメンバー発表と記者会見、そして合宿へ。現在 ${S.squad.length}人を選出中。視察ポイント ${S.scoutPts}。</p>
        ${S.cur.reports ? `<p style="margin:0 0 12px">スタッフ会議：ヘッドコーチから${S.cur.reports.coach.swaps.length ? `入れ替え提案${S.cur.reports.coach.swaps.length}件` : '招集案'}、スカウトから推薦${S.cur.reports.scout.length}名、メディカルから報告${S.cur.reports.medical.length}件。</p>` : ''}
        <div class="row"><button class="btn big" data-act="tab" data-v="staff">スタッフの報告を聞く</button><button class="btn big" data-act="tab" data-v="scout">視察に行く</button><button class="btn go big" data-act="tab" data-v="squad">招集メンバーを決める</button></div>
      </section>`;
    } else if (S.phase === 'announce') {
      return announceView(S);
    } else if (S.phase === 'press') {
      return pressView(S);
    } else if (S.phase === 'camp') {
      return campView(S);
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
          ${(() => { const vi = X.venueInfo(fx); return `<p style="margin:0 0 6px">会場：${esc(vi.city)}${vi.climate ? ` ・ 気候：<b>${esc(vi.climate)}</b>（${vi.oppAcclim ? '相手は慣れている。' : ''}消耗が激しい）` : ''}</p>`; })()}
          ${(() => { const cd = G.oppPlan(fx).cond; const pr = LF.pressure(fx); return cd ? `<p style="margin:0 0 6px">天候：${esc(cd.weather)} ・ ピッチ：${esc(cd.pitch)} ・ 主審：${esc(cd.ref.nat)}出身（${esc(cd.ref.label)}） ・ プレッシャー：<b>${LF.pressureLabel(pr)}</b></p>` : ''; })()}
          <p style="margin:0 0 12px">分析担当：${esc(ST.analyst(fx).why)}${S.cur.focus && S.cur.focus[X.focusKey(fx)] ? ` 分析の重点：${esc(X.FOCUS[S.cur.focus[X.focusKey(fx)]].name)}` : ''}</p>
          ${S.cur.leaveReq ? `<div class="hero-ask"><b>選手からの申し出</b><p>${esc(S.cur.leaveReq.text)}</p><div class="row"><button class="btn" data-act="leave" data-v="allow">許可する（離脱）</button><button class="btn" data-act="leave" data-v="refuse">チームに残ってもらう</button></div></div>` : ''}
          ${LF.needsPrePress(fx) ? (() => { const q = LF.prePressQuestion(fx); return `<div class="hero-ask"><b>前日会見</b><p>${esc(q.q)}</p><div class="answers">${q.a.map(([k, tone, t]) => `<button class="ans" data-act="prepress" data-v="${k}"><span class="chip">${tone}</span><span>${esc(t)}</span></button>`).join('')}</div><p class="small" style="margin:6px 0 0;opacity:.8">強気は士気が上がるが重圧も増す。平常心は重圧を和らげ、選手を守れば若手が硬くなりにくい。</p></div>`; })() : ''}
          <div class="row"><button class="btn big" data-act="tab" data-v="staff">スタッフの分析</button><button class="btn big" data-act="tab" data-v="tactics">スタメンを確認</button><button class="btn go big" data-act="kickoff" ${S.cur.leaveReq || LF.needsPrePress(fx) ? 'disabled' : ''}>キックオフ</button></div>
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
      </section>${meetingCard(S)}`;
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
      ['ロサンゼルス五輪 メダル獲得', S.olyResult ? /メダル/.test(S.olyResult) : null, S.olyResult],
      ['W杯2030 出場権獲得', S.wcQualified ? true : null, S.wcQualified ? '獲得' : ''],
      ['W杯2030 ベスト8以上', wc ? ['優勝', '準優勝', 'ベスト4', 'ベスト8'].includes(wc) : null, wc],
      ['W杯2030 優勝', wc ? wc === '優勝' : null, '']
    ];
    const W = S.matches.filter(m => m.out === 'W').length, Dr = S.matches.filter(m => m.out === 'D').length, L = S.matches.filter(m => m.out === 'L').length;
    return `<div class="grid" style="gap:16px">
      ${hero}
      ${consultCard(S)}
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

  function consultCard(S) {
    const cs = (S.phase === 'prep' && S.cur.consults) || [];
    if (!cs.length) return '';
    return `<section class="card"><h2>選手からの相談<span class="sub">答え方で選手の進路や気持ちが変わる</span></h2><div class="plist">${cs.map((c, i) => {
      const p = G.player(c.id);
      return `<div class="consult"><div>${posChip(p)} ${pLink(p)} <span class="small muted">${esc(p.club)} ・ ${G.ageInt(p)}歳</span></div><p style="margin:6px 0 4px">${esc(c.text)}</p><p class="small muted" style="margin:0 0 8px">${esc(c.note)}</p>
        ${c.done ? `<div class="small"><b>回答：</b>${esc(c.opts.find(o => o[0] === c.done)[1])} → ${esc(c.result)}</div>` : `<div class="answers">${c.opts.map(([k, t]) => `<button class="ans" data-act="consult" data-i="${i}" data-v="${k}"><span>${esc(t)}</span></button>`).join('')}</div>`}</div>`;
    }).join('')}</div></section>`;
  }

  function meetingCard(S) {
    const m = S.meeting;
    if (!m) return '';
    const offer = m.offer === 'extend' ? `<div class="sugg"><div><b>契約延長のオファー</b><div class="small">協会は2034年までの契約延長を提示している。受ければ解任されにくくなる。</div></div>${m.offerDone ? `<span class="small muted">${m.offerDone === 'accept' ? '合意した' : '保留した'}</span>` : '<div class="row"><button class="btn sm primary" data-act="offer" data-v="1">受ける</button><button class="btn sm" data-act="offer" data-v="0">保留する</button></div>'}</div>`
      : m.offer === 'warning' ? '<div class="med bad"><b>最後通告</b><div class="small">会長から「次の活動で結果を」と告げられた。評価が下がると解任の危険が高い。</div></div>' : '';
    return `<section class="card"><h2>協会との面談<span class="sub">${esc(m.title)} ・ 協会評価 ${Math.round(S.board)}</span></h2>
      <p class="quote">技術委員長と今後の強化方針を話し合う。要望は1つまで。評価が高いほど通りやすい。</p>
      <div class="plist">${offer}
      ${m.asked ? `<div class="med ${/承認/.test(m.result) ? '' : 'warn'}"><div class="small">${esc(m.result)}</div></div>` : m.options.map(k => `<div class="sugg"><div><b>${esc(X.UPGRADES[k].name)}</b><div class="small muted">${esc(X.UPGRADES[k].desc)}</div></div><button class="btn sm" data-act="ask" data-v="${k}">要望する</button></div>`).join('') || '<p class="small muted">すべての強化策が実施済み。</p>'}</div>
      ${Object.keys(S.upgrades || {}).length ? `<p class="small muted" style="margin:10px 0 0">実施済み：${Object.keys(S.upgrades).map(k => esc(X.UPGRADES[k].name)).join('・')}</p>` : ''}
    </section>`;
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

  // ---------- スタッフ ----------
  const staffHead = k => { const m = ST.STAFF[k]; return `<div class="staff-h"><span class="badge">${esc(m.name.slice(0, 1))}</span><div><b>${esc(m.name)}</b><span class="muted small">${esc(m.role)}</span></div></div>`; };
  const pLink = p => `<span class="plink" data-act="player" data-id="${p.id}">${esc(p.name)}</span>`;
  const pMeta = p => `${E.POS_LABEL[p.pos]} ・ ${G.ageInt(p)}歳 ・ ${esc(p.club)} ・ 能力${Math.round(p.ovr)}`;

  function staff(S) {
    S.cur.reportsSeen = true;
    const fx = S.phase === 'match' ? G.nextFixture() : null;
    if (fx) return matchStaff(S, fx);
    const r = S.cur.reports;
    if (S.phase !== 'prep' || !r) return `<section class="card"><h2>スタッフ</h2><p class="muted">次の代表活動が始まると、スタッフが招集に向けたレポートを持ってくる。</p></section>`;
    const prep = S.phase === 'prep';
    const coach = r.coach;
    const swaps = coach.swaps.map((x, k) => {
      const o = G.player(x.out), i = x.in ? G.player(x.in) : null;
      if (!o) return '';
      if (!i) {
        const gone = !S.squad.includes(o.id);
        return `<div class="sugg ${gone ? 'done' : ''}"><div><span class="chip bad">外す</span> ${pLink(o)}<div class="small muted">${pMeta(o)}</div><div class="small">${esc(x.outWhy)}</div></div>${gone ? '<span class="small muted">外した</span>' : `<button class="btn sm primary" data-act="call" data-id="${o.id}">外す</button>`}</div>`;
      }
      const done = !S.squad.includes(o.id) && S.squad.includes(i.id);
      return `<div class="sugg ${done ? 'done' : ''}">
        <div class="sw"><div><span class="chip bad">外す</span> ${pLink(o)}<div class="small muted">${pMeta(o)}</div><div class="small">${esc(x.outWhy)}</div></div>
        <div><span class="chip good">入れる</span> ${pLink(i)}<div class="small muted">${pMeta(i)}</div><div class="small">${esc(x.inWhy)}</div></div></div>
        ${done ? '<span class="small muted">採用済み</span>' : `<button class="btn sm primary" data-act="staff-swap" data-k="${k}">入れ替える</button>`}</div>`;
    }).join('');
    const recBtn = !S.squad.length ? `<button class="btn primary" data-act="staff-rec">推奨${coach.rec.length}人を採用する</button>` : (coach.swaps.length ? `<button class="btn sm" data-act="staff-all">提案をすべて採用</button>` : '');
    const scout = r.scout.map(x => { const p = G.player(x.id); if (!p) return ''; const on = S.squad.includes(p.id); return `<div class="sugg"><div><span class="chip ai">${esc(x.tag)}</span> ${pLink(p)}<div class="small muted">${pMeta(p)}</div><div class="small">${esc(x.text)}</div></div>${on ? '<span class="small muted">招集済み</span>' : `<button class="btn sm" data-act="call" data-id="${p.id}">招集する</button>`}</div>`; }).join('');
    return `<div class="grid g2">
      <section class="card">${staffHead('coach')}
        <p class="quote">${esc(coach.summary)}</p>
        ${coach.notes.map(n => `<p class="small" style="margin:0 0 6px">・${esc(n)}</p>`).join('')}
        <div class="row" style="margin:8px 0 12px">${recBtn}${prep ? '<button class="btn sm" data-act="tab" data-v="squad">招集画面へ</button>' : ''}</div>
        <div class="plist">${swaps}</div>
        ${coach.injured && coach.injured.length ? `<h3 style="font-size:13px;margin:16px 0 6px">負傷で選外とする選手</h3><div class="plist">${coach.injured.map(x => { const p = G.player(x.id); return p ? `<div class="med bad"><div>${pLink(p)} <span class="small muted">${pMeta(p)}</span></div><div class="small">${esc(x.text)}</div></div>` : ''; }).join('')}</div>` : ''}
      </section>
      <div class="grid" style="align-content:start">
        <section class="card">${staffHead('scout')}<p class="quote">${r.scout.length ? '現地で見てきた選手を推薦します。' : '今回は特に推薦したい選手はいません。'}</p><div class="plist">${scout}</div></section>
        <section class="card">${staffHead('medical')}${medList(r.medical)}</section>
      </div></div>`;
  }

  function medList(list) {
    if (!list.length) return '<p class="quote">気になる選手はいません。全員問題なしです。</p>';
    return `<p class="quote">メディカルチェックの結果です。</p><div class="plist">${list.map(m => { const p = G.player(m.id); if (!p) return ''; return `<div class="med ${m.lv}"><div>${pLink(p)} <span class="small muted">${esc(p.club)}</span></div><div class="small">${esc(m.text)}</div></div>`; }).join('')}</div>`;
  }

  function matchStaff(S, fx) {
    const a = ST.analyst(fx);
    const rot = ST.rotation();
    const applied = S.tactics.ment === a.rec.ment && S.tactics.style === a.rec.style;
    return `<div class="grid g2">
      <section class="card">${staffHead('analyst')}
        <div class="eyebrow" style="margin-top:4px">${esc(fx.label)}</div>
        <p class="quote">${esc(a.text)}</p>
        ${a.stars.length ? `<p class="small">警戒すべき選手：<b>${esc(a.stars.join('、'))}</b></p>` : ''}
        <p class="quote">${esc(a.why)}</p>
        <div class="row"><span class="small">推奨：<b>${E.MENT[a.rec.ment]} ／ ${E.STYLE[a.rec.style]}</b></span>${applied ? '<span class="chip good">適用中</span>' : `<button class="btn sm primary" data-act="apply-plan" data-m="${a.rec.ment}" data-s="${a.rec.style}">この作戦にする</button>`}</div>
        ${(() => { const vi = X.venueInfo(fx); return `<p class="small" style="margin:10px 0 0">会場：${esc(vi.city)}${vi.climate ? ` ・ <b>${esc(vi.climate)}</b>。日本は体力の消耗が15%増える${vi.oppAcclim ? '（相手は慣れている）' : ''}。ハイプレスは避けたい` : ''}</p>`; })()}
        ${(() => { const cd = G.oppPlan(fx).cond; return cd ? `<p class="small" style="margin:6px 0 0">予報：${esc(cd.weather)}${cd.weather !== '晴れ' ? (cd.weather === '強風' ? '。セットプレーの精度が落ちる' : '。ボールが走り、パスをつなぐサッカーは難しくなる') : ''} ・ ピッチ：${esc(cd.pitch)}${cd.pitch === '荒れ' ? '（ポゼッションは不利）' : ''} ・ 主審は${esc(cd.ref.nat)}出身で${esc(cd.ref.label)}${cd.ref.strict >= 1.15 ? '。警告の多い選手は注意' : ''}</p>` : ''; })()}
        <h3 style="font-size:13px;margin:16px 0 6px">分析の重点<span class="muted small">（試合ごとに1つ${S.upgrades && S.upgrades.analysis ? '・分析部門強化で効果1.5倍' : ''}）</span></h3>
        <div class="trainings">${Object.entries(X.FOCUS).map(([k, f]) => { const on = S.cur.focus && S.cur.focus[X.focusKey(fx)] === k; const extra = k === 'star' && a.stars[0] ? `（${a.stars[0]}）` : ''; return `<button class="train" data-act="focus" data-v="${k}" aria-pressed="${on}"><b>${esc(f.name)}${esc(extra)}</b><span>${esc(f.desc)}</span></button>`; }).join('')}</div>
      </section>
      <div class="grid" style="align-content:start">
        <section class="card">${staffHead('coach')}${rot.length ? `<p class="quote">先発について提案があります。</p><div class="plist">${rot.map((x, k) => `<div class="sugg"><div class="small">${esc(x.text)}</div><button class="btn sm" data-act="rotate" data-i="${x.i}" data-id="${x.in}">入れ替える</button></div>`).join('')}</div>` : '<p class="quote">現在の先発で問題ありません。</p>'}</section>
        <section class="card">${staffHead('medical')}${medList(ST.matchMedical())}</section>
      </div></div>`;
  }

  // ---------- 選手 ----------
  function players(S) {
    const canCall = S.phase === 'prep';
    let ps = G.visible().slice();
    if (ui.group !== 'ALL') ps = ps.filter(p => E.POS_GROUP[p.pos] === ui.group);
    if (ui.q) ps = ps.filter(p => p.name.includes(ui.q) || p.club.includes(ui.q));
    if (ui.onlyCalled) ps = ps.filter(p => S.squad.includes(p.id));
    if (ui.abroad) ps = ps.filter(p => p.tier <= 4);
    const STF = { inj: p => p.injury > 0, hot: p => p.form >= 1, cold: p => p.form <= -1, sharp: p => p.injury <= 0 && (p.sharp == null ? 70 : p.sharp) < 45, bench: p => p.status === 'bench' };
    if (ui.st && STF[ui.st]) ps = ps.filter(STF[ui.st]);
    const stCount = k => G.visible().filter(STF[k]).length;
    const key = {
      ovr: p => p.ovr, age: p => G.age(p), pot: p => { const r = G.potRange(p); return (r[0] + r[1]) / 2; }, form: p => p.form,
      caps: p => p.caps, chem: p => p.chem, name: p => p.name, pos: p => ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].indexOf(p.pos), club: p => p.tier
    }[ui.sort];
    ps.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });
    const th = (k, l) => `<th data-act="sort" data-v="${k}">${l}${ui.sort === k ? (ui.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
    return `<div class="filters">
        <div class="seg">${['ALL', 'GK', 'DF', 'MF', 'FW'].map(g => `<button data-act="group" data-v="${g}" aria-pressed="${ui.group === g}">${g === 'ALL' ? '全員' : g}</button>`).join('')}</div>
        <div class="seg">${[['', '全状態'], ['inj', '負傷'], ['hot', '好調'], ['cold', '不調'], ['sharp', '試合勘↓'], ['bench', 'クラブで控え']].map(([k, l]) => `<button data-act="stf" data-v="${k}" aria-pressed="${(ui.st || '') === k}">${l}${k ? ` <span class="num">${stCount(k)}</span>` : ''}</button>`).join('')}</div>
        <input type="search" id="q" placeholder="選手名・クラブで検索" value="${esc(ui.q)}" aria-label="検索">
        <button class="btn sm" data-act="only-called" aria-pressed="${ui.onlyCalled}">${ui.onlyCalled ? '✓ ' : ''}招集中のみ</button>
        <button class="btn sm" data-act="abroad" aria-pressed="${ui.abroad}">${ui.abroad ? '✓ ' : ''}海外組のみ</button>
        <span class="spacer"></span>
        <span class="small muted">招集 <b class="num" style="font-size:16px;color:var(--ink)">${S.squad.length}</b>/${G.squadMax()} ${canCall ? '' : '（活動中は変更不可）'}</span>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>招集</th>${th('name', '選手')}${th('pos', 'ポジ')}${th('age', '年齢')}${th('club', 'クラブ')}<th>クラブでの立場・今季</th>${th('ovr', '能力')}${th('pot', '潜在')}${th('form', '調子')}${th('chem', '連携')}${th('caps', '出場/得点')}</tr></thead>
        <tbody>${ps.map(p => {
          const on = S.squad.includes(p.id);
          return `<tr class="${on ? 'called' : ''}">
            <td><button class="check" data-act="call" data-id="${p.id}" aria-pressed="${on}" aria-label="${esc(p.name)}を招集" ${canCall ? '' : 'disabled'}>${on ? '✓' : ''}</button></td>
            <td class="nm" data-act="player" data-id="${p.id}">${esc(p.name)}${p.real ? '' : ' <span class="chip ai">新星</span>'}<div class="chips">${stateChips(p, { rumor: true })}</div></td>
            <td>${posChip(p)}${p.alt.length ? ` <span class="muted small">${p.alt.map(a => E.POS_LABEL[a]).join('/')}</span>` : ''}</td>
            <td class="num">${G.ageInt(p)}</td>
            <td><span class="tierdot t${p.tier}"></span>${esc(p.club)}</td>
            <td class="small">${G.STATUS_LABEL[p.status]}${p.season && p.season.apps ? ` <span class="muted num">${p.season.apps}試合${p.pos === 'GK' ? '' : ` ${p.season.g}G ${p.season.a}A`}</span>` : ''}</td>
            <td>${ovrTag(p.ovr)}</td>
            <td>${potText(p)}</td>
            <td>${formTag(p.form)}</td>
            <td class="num">${Math.round(p.chem)}</td>
            <td class="num">${p.caps} / ${p.goals}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="small muted">クラブ格：<span class="tierdot t1"></span>欧州トップ <span class="tierdot t2"></span>欧州強豪 <span class="tierdot t3"></span>欧州主要 <span class="tierdot t4"></span>欧州中堅 <span class="tierdot t5"></span>国内/学生。上位クラブほど成長しやすいが、控えになると伸び悩む。</p>`;
  }

  // ---------- 招集 ----------
  function squad(S) {
    const ev = G.event();
    const prep = S.phase === 'prep';
    const camp = S.phase === 'camp';
    const ps = S.squad.map(G.player).filter(Boolean);
    const groups = [['GK', 'GK'], ['DF', 'DF'], ['MF', 'MF'], ['FW', 'FW']];
    const issues = prep ? G.squadIssues(S.squad) : [];
    const canRemove = p => prep || (camp && p.injury > 0);
    const item = p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}</div><div class="c">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ ${prep ? esc(ST.seasonLine(p)) : `コンディション ${Math.round(p.cond)}`}</div><div class="chips">${stateChips(p)}</div></div>${ovrTag(p.ovr)}${canRemove(p) ? `<button class="btn sm" data-act="call" data-id="${p.id}" aria-label="${esc(p.name)}を外す">${camp ? '離脱' : '外す'}</button>` : formTag(p.form)}</div>`;
    const oaFull = G.isOly() && ps.filter(p => !G.olyEligible(p)).length >= 3;
    const recs = (prep || (camp && ps.length < G.squadMax())) ? G.visible().filter(p => !S.squad.includes(p.id) && G.callable(p) && (G.isOly() ? (!oaFull || G.olyEligible(p)) : G.eligibleNow(p))).sort((a, b) => ST.value(b) - ST.value(a)).slice(0, 10) : [];
    const cnt = g => ps.filter(p => E.POS_GROUP[p.pos] === g).length;
    const counts = groups.map(([g]) => `${g} ${cnt(g)}`).join(' ・ ');
    const hurt = ps.filter(p => p.injury > 0).length, hot = ps.filter(p => p.form >= 1).length, cold = ps.filter(p => p.form <= -1).length;
    return `<div class="grid g2">
      <section class="card">
        <h2>${prep ? (ev.kind === 'tour' ? '大会登録メンバー（選考中）' : '招集メンバー（選考中）') : '招集メンバー'}<span class="sub num">${ps.length}/${G.squadMax()} ・ ${counts}${G.isOly() ? ` ・ U-23 ${ps.filter(G.olyEligible).length} ・ OA ${ps.filter(p => !G.olyEligible(p)).length}/3` : ''}</span></h2>
        <p class="small muted" style="margin:-6px 0 10px">好調 ${hot}人 ・ 不調 ${cold}人 ・ 負傷 ${hurt}人</p>
        ${issues.length ? `<ul class="issues">${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
        ${prep ? `<div class="row" style="margin-bottom:12px"><button class="btn sm" data-act="auto-squad">自動選考</button><button class="btn sm" data-act="drop-injured">間に合わない負傷者を外す</button><button class="btn sm" data-act="clear-squad">全員外す</button><button class="btn sm" data-act="tab" data-v="players">選手一覧から選ぶ</button></div>` : ''}
        <div class="squad-groups">${groups.map(([g, l]) => { const list = ps.filter(p => E.POS_GROUP[p.pos] === g).sort((a, b) => b.ovr - a.ovr); return `<div class="sg"><h3><span>${l}</span><span class="num">${list.length}</span></h3><div class="plist">${list.map(item).join('') || '<span class="muted small">未選出</span>'}</div></div>`; }).join('')}</div>
      </section>
      <div class="grid" style="align-content:start">
        ${prep ? `<section class="card"><h2>選考を締め切る</h2>
          <p class="small muted" style="margin:0 0 10px">メンバーを発表すると記者会見が行われる。選考理由や落選について質問されるので、答え方が世論や選手の気持ちに影響する。</p>
          <button class="btn go big" data-act="announce" ${issues.length ? 'disabled' : ''}>メンバーを発表する</button></section>` : ''}
        ${recs.length ? `<section class="card"><h2>${camp ? '追加招集の候補' : '未招集の注目選手'}<span class="sub">スタッフ評価順</span></h2><div class="plist">${recs.map(p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}</div><div class="c">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ ${esc(ST.seasonLine(p))}</div><div class="chips">${stateChips(p)}</div></div>${ovrTag(p.ovr)}<button class="btn sm" data-act="call" data-id="${p.id}">${camp ? '追加招集' : '招集'}</button></div>`).join('')}</div></section>` : ''}
        ${ps.length ? captainCard(S, ps) : ''}
        ${!prep && S.cur.camp ? `<section class="card"><h2>合宿の記録</h2>${campLog(S.cur.camp)}</section>` : ''}
      </div></div>`;
  }

  function captainCard(S, ps) {
    const opts = (sel, k) => `<select data-cap="${k}" id="cap-${k}"><option value="">未指名（合宿で自動）</option>${ps.slice().sort((a, b) => X.leadership(b) - X.leadership(a)).map(p => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)}（統率${X.leadership(p)}）</option>`).join('')}</select>`;
    const c = G.player(S.captain);
    return `<section class="card"><h2>キャプテン<span class="sub">統率力が高いほど士気が安定し、合宿のもめ事が減る</span></h2>
      <div class="spgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label class="spsel"><span>主将</span>${opts(S.captain, 'c')}</label><label class="spsel"><span>副主将</span>${opts(S.vice, 'v')}</label></div>
      <p class="small muted" style="margin:8px 0 0">${c ? `${esc(c.name)}が先発すると士気に${X.leaderBonus([c.id]) >= 0.5 ? '大きな' : ''}プラス。主将を途中で代えると前任者が不満を持つ。` : '統率力は「リーダー」の特徴、代表経験、年齢、連携、意欲で決まる。'}</p></section>`;
  }

  // ---------- メンバー発表 ----------
  function announceView(S) {
    const an = S.cur.announce;
    const ev = G.event();
    const ps = S.squad.map(G.player).filter(Boolean);
    const ord = ['GK', 'DF', 'MF', 'FW'];
    const tag = p => an.firsts.includes(p.id) ? '<span class="chip hi">初招集</span>' : an.returns.includes(p.id) ? '<span class="chip ai">復帰</span>' : '';
    return `<section class="announce">
      <div class="eyebrow">${S.date.y}年${S.date.m}月 ・ 日本サッカー協会</div>
      <h1 class="h-display">${esc(S.cur.title || ev.title)}<br>日本代表メンバー発表</h1>
      <p class="muted">監督 ${esc(S.coach)} ・ ${ps.length}名</p>
      <div class="an-grid">${ord.map(g => `<div class="an-col"><h3>${g === 'GK' ? 'GK（ゴールキーパー）' : g === 'DF' ? 'DF（ディフェンダー）' : g === 'MF' ? 'MF（ミッドフィールダー）' : 'FW（フォワード）'}</h3>
        ${ps.filter(p => E.POS_GROUP[p.pos] === g).sort((a, b) => b.ovr - a.ovr).map(p => `<div class="an-row"><span class="nm plink" data-act="player" data-id="${p.id}">${esc(p.name)}</span>${tag(p)}<span class="cl">${esc(p.club)}</span></div>`).join('')}</div>`).join('')}</div>
      ${an.omissions.length ? `<p class="small" style="margin-top:14px"><b>主な落選：</b>${an.omissions.map(id => esc(G.player(id).name)).join('、')}</p>` : ''}
      ${an.injured.length ? `<p class="small"><b>負傷で選外：</b>${an.injured.map(id => `${esc(G.player(id).name)}（${esc(W.injText(G.player(id)))}）`).join('、')}</p>` : ''}
      ${(an.declined || []).length ? `<p class="small"><b>招集辞退：</b>${an.declined.map(id => esc(G.player(id).name)).join('、')}</p>` : ''}
      ${clubReqBlock(S)}
      <div class="row" style="margin-top:16px"><button class="btn go big" data-act="press-start" ${(S.cur.clubReq || []).some(r => !r.done) ? 'disabled' : ''}>記者会見に臨む</button>${(S.cur.clubReq || []).some(r => !r.done) ? '<span class="small muted">クラブからの要望に回答してください</span>' : ''}</div>
    </section>`;
  }

  function clubReqBlock(S) {
    const rs = S.cur.clubReq || [];
    if (!rs.length) return '';
    return `<div class="clubreq"><h3>クラブからの要望</h3><div class="plist">${rs.map((r, i) => { const p = G.player(r.id); const rel = Math.round(X.clubRel(r.club)); return `<div class="sugg"><div><div class="small">${esc(r.text)}</div><div class="small muted">${esc(p.name)} ・ ${esc(r.club)}との関係 ${rel}${rel < 40 ? '（悪化中）' : ''}</div></div>${r.done ? `<span class="small muted">${r.done === 'accept' ? '受け入れた' : '断った'}</span>` : `<div class="row"><button class="btn sm primary" data-act="club-req" data-i="${i}" data-v="1">受け入れる</button><button class="btn sm" data-act="club-req" data-i="${i}" data-v="0">断る</button></div>`}</div>`; }).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">受け入れるとクラブとの関係が良くなる。断るとクラブの心証が悪くなり、選手のクラブでの立場にも響くことがある。</p></div>`;
  }

  // ---------- 記者会見 ----------
  function pressView(S) {
    const pr = S.cur.press;
    const done = pr.answers.length >= pr.qs.length;
    const past = pr.answers.map((ai, i) => `<div class="qa"><div class="q"><span class="muted small">${esc(pr.qs[i].from)}</span>${esc(pr.qs[i].q)}</div><div class="a">${esc(pr.qs[i].a[ai].t)}</div></div>`).join('');
    let cur = '';
    if (!done) {
      const q = pr.qs[pr.answers.length];
      cur = `<div class="qa now"><div class="q"><span class="muted small">${esc(q.from)} の記者 ・ 質問 ${pr.answers.length + 1}/${pr.qs.length}</span>${esc(q.q)}</div>
        <div class="answers">${q.a.map((a, i) => `<button class="ans" data-act="answer" data-v="${i}"><span class="chip ${a.tone === '強気' ? 'hi' : a.tone === '慎重' ? 'ai' : a.tone === 'はぐらかす' ? '' : 'good'}">${a.tone}</span><span>${esc(a.t)}</span></button>`).join('')}</div></div>`;
    }
    const media = done && pr.media ? `<div class="media"><h3>報道</h3>${pr.media.heads.map(h => `<div class="headline"><span class="outlet">${esc(h.outlet)}</span><b>${esc(h.text)}</b></div>`).join('')}
      <h3 style="margin-top:12px">ネットの反応</h3><div class="sns">${pr.media.fans.map(f => `<div>${esc(f)}</div>`).join('')}</div></div>` : '';
    return `<section class="card press">
      <div class="eyebrow">JFAハウス ・ 記者会見</div>
      <h2 class="h-display" style="font-size:22px;margin:4px 0 14px">メンバー発表会見</h2>
      ${past}${cur}${media}
      ${done ? '<div class="row" style="margin-top:16px"><button class="btn go big" data-act="camp-start">合宿へ</button></div>' : ''}
    </section>`;
  }

  // ---------- 合宿 ----------
  function campLog(c) {
    if (!c.log.length) return '<p class="muted small">まだ練習していない。</p>';
    return `<ol class="camplog">${c.log.map(e => `<li><b>${e.day}日目：${esc(e.name)}</b>${e.lines.map(l => `<div class="small">${esc(l)}</div>`).join('')}</li>`).join('')}</ol>`;
  }

  function campView(S) {
    const c = S.cur.camp;
    const left = c.days - c.done.length;
    const sq = S.squad.map(G.player).filter(Boolean);
    const avgCond = sq.length ? sq.reduce((a, p) => a + p.cond, 0) / sq.length : 0;
    const injured = sq.filter(p => p.injury > 0);
    const sp = S.setPlay;
    return `<div class="grid g2">
      <section class="card">
        <div class="eyebrow">代表合宿 ・ ${left ? `残り${left}日` : '全日程終了'}</div>
        <h2 class="h-display" style="font-size:22px;margin:4px 0 12px">${left ? `${c.done.length + 1}日目のメニュー` : '合宿を打ち上げる'}</h2>
        ${c.pending && c.pending.kind === 'family' ? `<div class="discipline"><b>選手からの申し出</b><p style="margin:4px 0 10px">${esc(c.pending.text)}</p><div class="answers">
          <button class="ans" data-act="disc" data-v="allow"><span class="chip good">許可</span><span>家族を優先してほしい（次の試合は不在）</span></button>
          <button class="ans" data-act="disc" data-v="refuse"><span class="chip">残留</span><span>チームに残ってほしい（本人は不満、報道されるおそれ）</span></button></div></div>` : ''}
        ${c.pending && c.pending.kind !== 'family' ? `<div class="discipline"><b>規律問題</b><p style="margin:4px 0 10px">${esc(c.pending.text)}。どう対処する？</p><div class="answers">
          <button class="ans" data-act="disc" data-v="strict"><span class="chip hi">厳罰</span><span>次の試合はメンバー外とする（本人は不満、規律は締まる）</span></button>
          <button class="ans" data-act="disc" data-v="warn"><span class="chip ai">注意</span><span>口頭で厳重注意にとどめる</span></button>
          <button class="ans" data-act="disc" data-v="ignore"><span class="chip">不問</span><span>大ごとにしない（チームに不満、報道されるおそれ）</span></button></div></div>` : ''}
        ${left && !c.pending ? `<div class="trainings">${Object.entries(C.MENU).map(([k, m]) => `<button class="train" data-act="session" data-v="${k}"><b>${m.name}${c.done.includes(k) ? ` <span class="muted small">×${c.done.filter(x => x === k).length}</span>` : ''}</b><span>${m.desc}</span></button>`).join('')}</div>`
          : c.pending ? '' : `<p>練習はすべて終わった。スタメンと戦術、セットプレーを確認して試合へ。</p><div class="row"><button class="btn big" data-act="tab" data-v="tactics">戦術・セットプレー</button><button class="btn go big" data-act="camp-end">合宿を打ち上げる</button></div>`}
        ${injured.length ? `<div class="confirm" style="margin-top:12px">${injured.map(p => esc(p.name)).join('・')}が負傷中。<button class="btn sm" data-act="tab" data-v="squad">追加招集を検討</button></div>` : ''}
        <h3 style="font-size:13px;margin:16px 0 6px">合宿の記録</h3>${campLog(c)}
      </section>
      <div class="grid" style="align-content:start">
        <section class="card"><h2>チームの状態</h2><div class="stats3">
          <div class="stat"><b>${Math.round(S.morale)}</b><span>士気</span></div>
          <div class="stat"><b>${Math.round(G.teamChem(S.squad))}</b><span>連携</span></div>
          <div class="stat"><b>${Math.round(avgCond)}</b><span>平均コンディション</span></div>
          <div class="stat"><b>${Math.round(S.spFam || 40)}</b><span>セットプレー完成度</span></div></div>
          <p class="small muted" style="margin:10px 0 0">攻撃 +${((c.bonus.att) || 0).toFixed(1)} ・ 守備 +${((c.bonus.def) || 0).toFixed(1)} ・ ${esc(S.formation)} 熟成 ${Math.round(S.fam[S.formation])}</p></section>
        <section class="card"><h2>セットプレー<span class="sub">戦術画面で変更</span></h2>
          <p class="small" style="margin:0">CK：${({ near: 'ニア', far: 'ファー', short: 'ショート', mix: '混合' })[sp.ck]} ・ 守備：${sp.defend === 'zone' ? 'ゾーン' : 'マンツーマン'}<br>CKキッカー：${esc(nm(sp.ckTaker))} ・ FK：${esc(nm(sp.fkTaker))} ・ PK：${esc(nm(sp.pkTaker))}</p></section>
        <section class="card"><h2>コンディション</h2><div class="plist">${sq.slice().sort((a, b) => a.cond - b.cond).slice(0, 8).map(p => `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)}</div><div class="chips">${stateChips(p)}</div></div><span class="num">${Math.round(p.cond)}</span>${formTag(p.form)}</div>`).join('')}</div></section>
      </div></div>`;
  }
  const nm = id => { const p = id && G.player(id); return p ? p.name : '自動'; };

  function dualCard(S) {
    const ds = X.duals().filter(p => !p.hidden || p.dual.status !== 'undecided');
    const known = ds.filter(p => !p.hidden || p.dual.status === 'japan');
    const lost = X.duals().filter(p => p.dual.status === 'other' && p.know > 0);
    if (!known.length && !lost.length) return `<section class="card"><h2>二重国籍の有望株</h2><p class="small muted" style="margin:0">欧州の視察で、日本と他国の両方の代表資格を持つ若手が見つかることがある。見つけたらここで説得できる。</p></section>`;
    const st = p => p.dual.status === 'japan' ? '<span class="chip good">日本代表を選択</span>' : p.dual.status === 'other' ? `<span class="chip bad">${esc(p.dual.nation)}を選択</span>` : `<span class="chip ai">検討中</span>`;
    return `<section class="card"><h2>二重国籍の有望株<span class="sub">公式戦に出場させれば日本代表で確定</span></h2><div class="plist">${known.concat(lost.filter(p => !known.includes(p))).map(p => {
      const ja = Math.round(p.dual.ja);
      return `<div class="sugg"><div>${posChip(p)} ${pLink(p)} ${st(p)}<div class="small muted">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ ${esc(p.dual.nation)}と日本の二重国籍 ・ 潜在 ${potText(p)}</div>
        ${p.dual.status === 'undecided' ? `<div class="small">日本への気持ち <b class="num">${ja}</b>/100 <span class="tr2" style="display:inline-block;width:120px;vertical-align:middle"><i style="width:${ja}%" class="${ja < 35 ? 'low' : ja < 60 ? 'mid' : ''}"></i></span>${(p.dual.log || []).length ? `<div class="muted">${esc(p.dual.log[p.dual.log.length - 1])}</div>` : ''}</div>` : ''}</div>
        ${p.dual.status === 'undecided' ? `<div class="row"><button class="btn sm" data-act="persuade" data-id="${p.id}" data-v="call" ${S.scoutPts >= 1 ? '' : 'disabled'}>電話で説得（1pt）</button><button class="btn sm primary" data-act="persuade" data-id="${p.id}" data-v="visit" ${S.scoutPts >= 2 ? '' : 'disabled'}>現地で面会（2pt）</button></div>` : ''}</div>`;
    }).join('')}</div><p class="small muted" style="margin:8px 0 0">気持ちが低いまま招集すると辞退されることがある。相手国のA代表に呼ばれると一気に気持ちが離れる。</p></section>`;
  }

  // ---------- 視察 ----------
  function scout(S) {
    const trips = S.cur.trips || [];
    const can = S.phase === 'prep';
    const kindL = { J: 'Jリーグ', youth: '育成年代', EU: '欧州' };
    return `<div class="grid g2">
      <section class="card"><h2>視察の予定<span class="sub">視察ポイント ${S.scoutPts}</span></h2>
        <p class="small muted" style="margin:0 0 12px">視察すると対象クラブの選手の潜在能力の見積もりが正確になり、まだリストにない若手が見つかることもある。${can ? '' : '視察は代表活動の合間（選考期間）にしか行けない。'}</p>
        <div class="plist">${trips.map(t => `<div class="sugg ${t.done ? 'done' : ''}"><div><span class="chip ${t.kind === 'EU' ? 'ai' : t.kind === 'youth' ? 'hi' : ''}">${kindL[t.kind]}</span> <b>${esc(t.title)}</b><div class="small muted">${t.clubs ? esc(t.clubs.slice(0, 6).join('・')) : esc(t.leagues.join('・'))}</div></div>${t.done ? '<span class="small muted">視察済み</span>' : `<button class="btn sm primary" data-act="trip" data-v="${t.id}" ${can && S.scoutPts >= t.cost ? '' : 'disabled'}>視察する（${t.cost}pt）</button>`}</div>`).join('')}</div>
      </section>
      <div class="grid" style="align-content:start">${dualCard(S)}${trips.filter(t => t.report).map(t => `<section class="card"><h2>${esc(t.title)}<span class="sub">視察レポート${t.report.found ? ` ・ 新たに${t.report.found}人を発見` : ''}</span></h2>
        <div class="plist">${t.report.rows.map(r => { const p = G.player(r.id); return `<div class="pitem">${posChip(p)}<div style="min-width:0"><div class="n" data-act="player" data-id="${p.id}">${esc(p.name)} ${r.found ? '<span class="chip hi">発見</span>' : ''}</div><div class="c">${esc(p.club)} ・ ${G.ageInt(p)}歳 ・ 潜在 ${potText(p)}</div><div class="small">${esc(r.text)}</div></div>${ovrTag(p.ovr)}${S.phase === 'prep' && !S.squad.includes(p.id) && G.callable(p) ? `<button class="btn sm" data-act="call" data-id="${p.id}">招集</button>` : formTag(p.form)}</div>`; }).join('')}</div></section>`).join('') || '<section class="card"><p class="muted">まだ視察していない。</p></section>'}</div>
    </div>`;
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

  function instrCard(S) {
    const F = E.FORMATIONS[S.formation];
    const rows = S.xi.map((id, i) => {
      const p = G.player(id); if (!p || F[i][0] === 'GK') return '';
      return `<label class="spsel ins"><span>${E.SLOT_LABEL[F[i][0]]} ${esc(p.name)}</span><select data-ins="${p.id}" id="ins-${i}"><option value="">標準</option>${Object.entries(E.INSTR).map(([k, x]) => `<option value="${k}" ${S.instr[p.id] === k ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>`;
    }).join('');
    return `<section class="card"><h2>個別指示<span class="sub">選手ごとの役割</span></h2><div class="spgrid">${rows}</div>
      <p class="small muted" style="margin:8px 0 0">${Object.values(E.INSTR).map(x => `${x.name}：${x.desc}`).join(' ／ ')}</p></section>`;
  }

  function pairCard(S) {
    const ps = LF.pairs(S.xi);
    const rv = LF.rivals(S.squad);
    if (!ps.length && !rv.length) return '';
    return `<section class="card"><h2>コンビと競争<span class="sub">連携ボーナス +${LF.pairBonus(S.xi).toFixed(2)}</span></h2>
      ${ps.length ? `<div class="plist">${ps.map(x => `<div class="small">${esc(G.player(x.a).name)} × ${esc(G.player(x.b).name)} ・ ${esc(x.why)}</div>`).join('')}</div>` : '<p class="small muted">先発に息の合うコンビはいない。</p>'}
      ${rv.length ? `<p class="small" style="margin:10px 0 0"><b>ポジション争い：</b>${rv.slice(0, 5).map(([a, b]) => `${esc(G.player(a).name)} vs ${esc(G.player(b).name)}`).join('、')}<br><span class="muted">先発争いに敗れた側は意欲が少し下がる。</span></p>` : ''}</section>`;
  }

  function setPieceCard(S) {
    const sp = S.setPlay;
    const sq = S.squad.map(G.player).filter(p => p && p.pos !== 'GK').sort((a, b) => b.ovr - a.ovr);
    const sel = (k, label, prefer) => `<label class="spsel"><span>${label}</span><select data-sp="${k}" id="sp-${k}"><option value="">自動（ピッチ上の最適な選手）</option>${sq.slice().sort((a, b) => (prefer(b) - prefer(a)) || b.ovr - a.ovr).map(p => `<option value="${p.id}" ${sp[k] === p.id ? 'selected' : ''}>${esc(p.name)}${p.traits.filter(t => ['FK', 'クロス', '決定力'].includes(t)).map(t => '・' + t).join('')}</option>`).join('')}</select></label>`;
    const aerial = S.xi.map(G.player).filter(p => p && p.traits.includes('空中戦')).length;
    const ckDesc = { mix: 'ニアとファーを使い分ける標準形。', near: 'ニアで触ってコースを変える。キッカーの精度が重要。', far: `ファーの高さ勝負。先発に空中戦の強い選手が2人以上いると効果大（現在${aerial}人）。`, short: 'ショートで繋いでミドル。高さで劣るときの選択肢。' };
    return `<section class="card"><h2>セットプレー<span class="sub">完成度 ${Math.round(S.spFam || 40)}（合宿のセットプレー練習で上がる）</span></h2>
      <div class="eyebrow" style="margin-bottom:6px">攻撃CK</div>
      <div class="seg">${[['mix', '混合'], ['near', 'ニア'], ['far', 'ファー'], ['short', 'ショート']].map(([k, l]) => `<button data-act="sp" data-k="ck" data-v="${k}" aria-pressed="${sp.ck === k}">${l}</button>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 10px">${ckDesc[sp.ck]}</p>
      <div class="eyebrow" style="margin-bottom:6px">守備</div>
      <div class="seg">${[['zone', 'ゾーン'], ['man', 'マンツーマン']].map(([k, l]) => `<button data-act="sp" data-k="defend" data-v="${k}" aria-pressed="${sp.defend === k}">${l}</button>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 10px">${sp.defend === 'zone' ? '安定して失点を減らす。' : 'CB・FW・DMFに空中戦の強い選手が2人以上いれば強力、いなければ逆効果。'}</p>
      <div class="spgrid">${sel('ckTaker', 'CKキッカー', p => p.traits.includes('クロス') || p.traits.includes('FK') ? 1 : 0)}${sel('fkTaker', 'FKキッカー', p => p.traits.includes('FK') ? 1 : 0)}${sel('pkTaker', 'PKキッカー', p => p.pos === 'ST' || p.traits.includes('決定力') ? 1 : 0)}</div>
    </section>`;
  }

  function tactics(S) {
    const F = E.FORMATIONS[S.formation];
    if (!S.squad.length) return `<section class="card"><h2>戦術</h2><p>まず招集メンバーを決めてください。</p><button class="btn primary" data-act="tab" data-v="squad">招集へ</button></section>`;
    if (S.xi.length !== 11) S.xi = G.autoPick(S.squad, S.formation);
    const slots = F.map((s, i) => {
      const p = G.player(S.xi[i]);
      const fit = p ? E.fit(p, s[0]) : 0;
      return `<button class="slot ${s[0] === 'GK' ? 'gk' : ''} ${p ? '' : 'empty'}" style="left:${s[1]}%;top:${s[2]}%" data-act="slot" data-i="${i}" aria-label="${E.SLOT_LABEL[s[0]]} ${p ? esc(p.name) : '未選択'}">
        <span class="shirt">${p ? Math.round(p.ovr * fit) : '+'}${p && p.id === S.captain ? '<i class="arm">C</i>' : ''}</span><span class="nm">${p ? esc(p.name) : '選択'}</span><span class="lb">${E.SLOT_LABEL[s[0]]}${p && !G.available(p) ? ' ・ 出場不可' : ''}</span>${p && fit < 0.95 ? `<span class="fit">適性 ${Math.round(fit * 100)}%</span>` : ''}</button>`;
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
        ${instrCard(S)}
        ${pairCard(S)}
        ${setPieceCard(S)}
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
    if (S.comps.e129) comps.push(tourView(S.comps.e129));
    if (S.comps.olympic) comps.push(tourView(S.comps.olympic));
    if (S.comps.e127) comps.push(tourView(S.comps.e127));
    if (S.comps.asiancup) comps.push(tourView(S.comps.asiancup));
    if (RK && S.fifa) {
      const tb = RK.table();
      const j = tb.find(r => r.code === 'JPN');
      const rows = tb.slice(0, 20).concat(j.rank > 20 ? [j] : []);
      comps.unshift(`<section class="card"><h2>FIFAランキング<span class="sub">W杯本大会の抽選ポットはこの順位で決まる（開催国＋上位9か国がポット1）</span></h2><div class="tbl-wrap"><table><thead><tr><th>順位</th><th>国</th><th>ポイント</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.code === 'JPN' ? 'me' : ''}"><td class="num">${r.rank}</td><td>${nat(r.code)}</td><td class="num">${Math.round(r.pts)}</td></tr>`).join('')}</tbody></table></div></section>`);
    }
    void ev;
    return `<div class="grid">
      <section class="card"><h2>日程<span class="sub">2026年10月〜2030年7月</span></h2><ul class="timeline">${cal}</ul></section>
      ${comps.join('') || '<section class="card"><p class="muted">公式大会はまだ始まっていない。最初の公式戦は2027年1月のアジアカップ。</p></section>'}</div>`;
  }

  // ---------- 記録 ----------
  function records(S) {
    const ps = S.players.filter(p => p.caps > 0);
    const scorers = ps.slice().sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 10);
    const caps = ps.slice().sort((a, b) => b.caps - a.caps).slice(0, 10);
    const compName = { friendly: '親善試合', q2: '2次予選', q3: '最終予選', q4: '4次予選', asiancup: 'アジア杯', wc: 'W杯', olympic: '五輪', e1: 'E-1' };
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

  function clubBlock(S, p, tierL) {
    const c = W.club(S, p.club);
    const s = p.season, ls = p.lastSeason;
    const sh = Math.round(p.sharp == null ? 70 : p.sharp);
    const recentCoach = p.coachChange && (S.date.y * 100 + S.date.m) - p.coachChange < 4;
    const injH = (p.injHist || []).slice().reverse();
    return `<div class="clubbox">
        <div class="row"><span class="tierdot t${p.tier}"></span><b>${esc(p.club)}</b><span class="muted small">${esc(W.league(p.club))} ・ ${esc(tierL)}</span>
          <span class="spacer"></span>${W.isYouth(p.club) ? '' : `<span class="chip ${c.form >= 0.8 ? 'good' : c.form <= -0.8 ? 'bad' : ''}">チーム${W.clubFormLabel(c.form)}</span>`}${c.cl ? ' <span class="chip ai">CL出場</span>' : ''}</div>
        <div class="cb-grid">
          <div><span>立場</span><b>${G.STATUS_LABEL[p.status]}</b>${recentCoach ? '<div class="small muted">最近監督が交代した</div>' : ''}</div>
          <div><span>試合勘</span><b class="num">${sh}</b><div class="tr2"><i style="width:${sh}%" class="${sh < 45 ? 'low' : sh < 65 ? 'mid' : ''}"></i></div></div>
          <div class="wide"><span>今季 ${esc(s ? s.label : '')}</span><b class="small">${esc(ST.seasonLine(p))}</b>${ls && ls.apps ? `<div class="small muted">前季 ${esc(ls.label)}：${ls.apps}試合 ${ls.g}得点 ${ls.a}アシスト</div>` : ''}</div>
        </div>
        ${p.rumor ? `<p class="small" style="margin:8px 0 0"><span class="chip ai">移籍の噂</span> ${esc(W.league(p.rumor.club))}の${esc(p.rumor.club)}が関心</p>` : ''}
        ${p.injury > 0 ? `<p class="small" style="margin:8px 0 0;color:var(--bad);font-weight:700">${esc(W.injText(p))}（${esc(W.returnDateText(S, p))}復帰見込み）</p>` : ''}
        ${injH.length ? `<p class="small muted" style="margin:6px 0 0">負傷歴：${injH.map(h => `${Math.floor(h.d / 100)}.${h.d % 100} ${esc(h.t)}（${h.w}週）`).join(' / ')}</p>` : ''}
        ${p.moves && p.moves.length ? `<p class="small muted" style="margin:4px 0 0">移籍歴：${p.moves.map(m => `${Math.floor(m.d / 100)}.${m.d % 100} ${esc(m.from)}→${esc(m.to)}`).join(' / ')}</p>` : ''}
      </div>`;
  }

  function playerModal(S, p) {
    if (!p) return '';
    const on = S.squad.includes(p.id);
    const attrs = G.attributes(p);
    const tierL = window.SBData.CLUB_TIER_LABEL[p.tier] || 'ユース/学生';
    const avgR = p.ratings.length ? (p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length).toFixed(2) : '－';
    return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <div class="modal-h"><div><div class="eyebrow">${E.POS_LABEL[p.pos]}${p.alt.length ? ' / ' + p.alt.map(a => E.POS_LABEL[a]).join(' / ') : ''} ・ ${G.ageInt(p)}歳${p.real ? '' : ' ・ 新星'}</div><h2>${esc(p.name)}</h2>
        <div class="row" style="margin-top:4px">${p.traits.map(t => `<span class="chip ${t === 'ガラスの体' ? 'bad' : 'ai'}">${esc(t)}</span>`).join('')} ${stateChips(p, { rumor: true })}</div></div>
        <button class="x" data-act="close" aria-label="閉じる">×</button></div>
      <div class="kv">
        <div><span>能力</span><b>${ovrTag(p.ovr)} <span class="muted small num">${fmt1(p.ovr)}</span></b></div>
        <div><span>潜在（見積）</span><b>${potText(p)}</b></div>
        <div><span>調子</span><b>${formTag(p.form)} <span class="num">${p.form > 0 ? '+' : ''}${fmt1(p.form)}</span></b></div>
        <div><span>連携</span><b class="num">${Math.round(p.chem)}</b></div>
        <div><span>代表への意欲</span><b>${(p.mood || 0) >= 1.5 ? '非常に高い' : (p.mood || 0) >= 0.5 ? '高い' : (p.mood || 0) <= -1.2 ? '不満あり' : (p.mood || 0) <= -0.5 ? 'やや低い' : '普通'}</b></div>
        <div><span>代表 出場/得点/A</span><b class="num">${p.caps} / ${p.goals} / ${p.assists}</b></div>
        <div><span>代表 直近評価点</span><b class="num">${avgR}</b></div>
      </div>
      ${clubBlock(S, p, tierL)}
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
      <div class="row small muted"><span>支配率 ${poss[0]}%</span>${sim.opts.weather ? `<span>・ ${esc(sim.opts.weather)} ・ ピッチ${esc(sim.opts.pitch)}</span>` : ''}<span class="spacer"></span><span>${poss[1]}%</span></div>`;
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
    const md = rec.media;
    const fifaLine = rec.fifa ? `FIFAポイント ${rec.fifa > 0 ? '+' : ''}${rec.fifa}` : '';
    return `<section class="card" style="margin-top:14px"><h2>${title}<span class="sub">協会評価 ${rec.board >= 0 ? '+' : ''}${rec.board} ・ ${fifaLine} ・ MOM ${esc(rec.motm)}</span></h2>${rec.travel ? `<p class="small muted" style="margin:0 0 8px">${esc(rec.travel)}</p>` : ''}
      ${md ? `<div class="media" style="margin-bottom:12px"><div class="headline"><span class="outlet">${esc(md.outlet)}</span><b>${esc(md.head)}</b></div><div class="sns">${md.comments.map(c => `<div>${esc(c)}</div>`).join('')}</div><p class="small muted" style="margin:6px 0 0">世論 ${md.fansD >= 0 ? '+' : ''}${md.fansD} ・ 士気 ${md.moraleD >= 0 ? '+' : ''}${md.moraleD}</p></div>` : ''}
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
      G.newGame(name); tab = 'home'; render();
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
    stf(d) { ui.st = d.v; render(); },
    call(d) {
      const S = G.state();
      const i = S.squad.indexOf(d.id);
      if (S.phase === 'camp') {
        const p = G.player(d.id);
        if (i >= 0 && p.injury > 0) { S.squad.splice(i, 1); S.xi = S.xi.map(x => x === d.id ? null : x); G.addNews('招集', `${p.name}が負傷のため代表チームを離脱。`); }
        else if (i < 0 && S.squad.length < G.squadMax() && G.callable(p)) { S.squad.push(d.id); p.know = 3; p.cond = G.campCondition(p); p.campCount = (p.campCount || 0) + 1; G.addNews('招集', `${p.name}を追加招集。`); toast(`${p.name}を追加招集した`); }
        G.save(); render(); return;
      }
      if (S.phase !== 'prep') return;
      if (i >= 0) { S.squad.splice(i, 1); S.xi = S.xi.map(x => x === d.id ? null : x); }
      else { if (S.squad.length >= G.squadMax()) { toast(`招集は最大${G.squadMax()}人まで`); return; } S.squad.push(d.id); }
      G.save(); render();
    },
    'auto-squad'() { const S = G.state(); S.squad = G.autoSquad(); S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); toast(`${S.squad.length}人を自動選考した`); },
    'drop-injured'() { const S = G.state(); S.squad = S.squad.filter(id => G.callable(G.player(id))); G.save(); render(); toast('間に合わない負傷者を外した（軽傷の選手は残している）'); },
    'clear-squad'() { const S = G.state(); S.squad = []; S.xi = []; G.save(); render(); },
    'staff-swap'(d) {
      const S = G.state(); const x = S.cur.reports.coach.swaps[+d.k]; if (!x || S.phase !== 'prep') return;
      S.squad = S.squad.filter(id => id !== x.out); S.xi = S.xi.map(id => id === x.out ? null : id);
      if (x.in && !S.squad.includes(x.in)) S.squad.push(x.in);
      G.save(); render(); toast(`${G.player(x.in).name}を招集し、${G.player(x.out).name}を外した`);
    },
    'staff-all'() {
      const S = G.state(); if (S.phase !== 'prep') return;
      S.cur.reports.coach.swaps.forEach(x => { S.squad = S.squad.filter(id => id !== x.out); if (x.in && !S.squad.includes(x.in)) S.squad.push(x.in); });
      S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); toast('ヘッドコーチの提案をすべて採用した');
    },
    'staff-rec'() { const S = G.state(); if (S.phase !== 'prep') return; S.squad = S.cur.reports.coach.rec.slice(); S.xi = G.autoPick(S.squad, S.formation); G.save(); render(); toast(`推奨の${S.squad.length}人を招集リストにした`); },
    'apply-plan'(d) { const S = G.state(); S.tactics.ment = d.m; S.tactics.style = d.s; G.save(); render(); toast('分析担当の作戦を採用した'); },
    rotate(d) { const S = G.state(); const i = +d.i; const cur = S.xi.indexOf(d.id); if (cur >= 0) S.xi[cur] = S.xi[i]; S.xi[i] = d.id; G.save(); render(); toast('先発を入れ替えた'); },
    announce() { if (G.announce()) { tab = 'home'; render(); window.scrollTo(0, 0); } },
    'press-start'() { G.startPress(); render(); },
    consult(d) { const r = LF.resolveConsult(+d.i, d.v); render(); if (r) toast(r); },
    leave(d) { const r = LF.resolveLeave(d.v); render(); if (r) toast(r); },
    prepress(d) { const fx = G.nextFixture(); if (fx) { LF.answerPrePress(fx, d.v); render(); toast('前日会見を終えた'); } },
    'club-req'(d) { X.resolveClub(+d.i, d.v === '1'); render(); },
    disc(d) { const l = X.resolveDiscipline(d.v); render(); if (l) toast(l); },
    focus(d) { const S = G.state(); const fx = G.nextFixture(); if (!fx) return; S.cur.focus = S.cur.focus || {}; S.cur.focus[X.focusKey(fx)] = d.v; G.save(); render(); toast(`分析の重点：${X.FOCUS[d.v].name}`); },
    persuade(d) { const l = X.persuade(d.id, d.v); render(); if (l) toast(l); },
    ask(d) { const r = X.ask(d.v); render(); if (r) toast(r); },
    offer(d) { X.answerOffer(d.v === '1'); render(); },
    answer(d) { G.answerPress(+d.v); render(); },
    'camp-start'() { G.startCamp(); tab = 'home'; render(); window.scrollTo(0, 0); },
    session(d) { const e = G.trainSession(d.v); render(); if (e) toast(`${e.day}日目：${e.name}`); },
    'camp-end'() { G.finishCamp(); tab = 'home'; render(); toast('合宿打ち上げ。いよいよ試合だ'); },
    trip(d) { const r = C.doTrip(d.v); render(); if (r) toast(r.found ? `視察で${r.found}人の新しい選手を見つけた` : '視察レポートが届いた'); },
    sp(d) { const S = G.state(); S.setPlay[d.k] = d.v || null; G.save(); render(); },
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
  document.addEventListener('change', ev => {
    const ik = ev.target.dataset && ev.target.dataset.ins;
    if (ik) { const S = G.state(); if (ev.target.value) S.instr[ik] = ev.target.value; else delete S.instr[ik]; G.save(); render(); toast('個別指示を設定した'); return; }
    const ck = ev.target.dataset && ev.target.dataset.cap;
    if (ck) { if (ev.target.value) X.setCaptain(ev.target.value, ck === 'v'); else { const S = G.state(); if (ck === 'v') S.vice = null; else S.captain = null; G.save(); } render(); return; }
    const k = ev.target.dataset && ev.target.dataset.sp;
    if (k) { const S = G.state(); S.setPlay[k] = ev.target.value || null; G.save(); render(); toast('キッカーを設定した'); }
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
