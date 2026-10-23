/**
 * Google Chat アプリとしてのイベント処理
 *
 * Apps Script を Chat アプリとして公開すると、以下の関数が Chat から呼び出される。
 *   onAddedToSpace : 利用者が DM を開いた／スペースに追加したとき → DM スペースを登録
 *   onMessage      : 利用者がメッセージを送ったとき → DM スペースを登録し、簡単なコマンドに応答
 *   onCardClick    : 通知カードの「承認」「却下」「受理」ボタンが押されたとき
 *   onRemovedFromSpace : 登録解除
 *
 * ボタン操作は event.user.email（操作した本人）で権限チェックする。
 */
var ChatApp = (function () {

  function registerSpace_(email, spaceName, displayName) {
    email = Users.normalize(email);
    if (!email || !spaceName) return;
    Db.withLock(function () {
      var row = Db.find(SHEET.CHAT_SPACES, function (r) { return Users.normalize(r['メールアドレス']) === email; });
      var data = { 'メールアドレス': email, 'スペース名': spaceName, '表示名': displayName || '', '登録日時': nowString_() };
      if (row) Db.updateRow(SHEET.CHAT_SPACES, row._row, data); else Db.insert(SHEET.CHAT_SPACES, data);
    });
    CacheService.getScriptCache().remove('space:' + email);
  }

  function unregisterSpace_(spaceName) {
    var rows = Db.filter(SHEET.CHAT_SPACES, function (r) { return r['スペース名'] === spaceName; });
    rows.forEach(function (r) { Db.updateRow(SHEET.CHAT_SPACES, r._row, { 'スペース名': '' }); CacheService.getScriptCache().remove('space:' + Users.normalize(r['メールアドレス'])); });
  }

  /** メールアドレスから DM スペース名を得る（シート → API 検索の順） */
  function spaceFor(email) {
    email = Users.normalize(email);
    var cache = CacheService.getScriptCache();
    var cached = cache.get('space:' + email);
    if (cached) return cached === '-' ? null : cached;
    var row = Db.find(SHEET.CHAT_SPACES, function (r) { return Users.normalize(r['メールアドレス']) === email && r['スペース名']; });
    var space = row ? String(row['スペース名']) : null;
    if (!space) {
      try {
        var found = Notify.chatApiRequest('GET', 'spaces:findDirectMessage?name=users/' + encodeURIComponent(email), null);
        if (found && found.name) { space = found.name; registerSpace_(email, space, ''); }
      } catch (e) {
        log_('INFO', 'findDirectMessage 失敗', { email: email, error: String(e) });
      }
    }
    cache.put('space:' + email, space || '-', 600);
    return space;
  }

  function listRegistered() {
    return Db.readAll(SHEET.CHAT_SPACES).map(function (r) {
      return { email: String(r['メールアドレス']), space: String(r['スペース名'] || ''), name: String(r['表示名'] || ''), at: String(r['登録日時'] || '') };
    });
  }

  // ---------------------------------------------------------------- イベントハンドラ
  function onAdded(event) {
    var email = event.user && event.user.email;
    var space = event.space && event.space.name;
    var isDm = event.space && (event.space.type === 'DM' || event.space.spaceType === 'DIRECT_MESSAGE');
    if (isDm) registerSpace_(email, space, event.user && event.user.displayName);
    var url = getSetting_('APP_URL', '');
    return { text: 'こんにちは、' + APP_NAME + ' です。承認依頼や申請の進捗をこのチャットでお知らせします。\n' +
      '「一覧」と送ると承認待ちの案件を表示します。' + (url ? '\nWebアプリ: ' + url : '') };
  }

  function onRemoved(event) {
    if (event.space && event.space.name) unregisterSpace_(event.space.name);
  }

  function onMessage(event) {
    var email = Users.normalize(event.user && event.user.email);
    var space = event.space && event.space.name;
    var isDm = event.space && (event.space.type === 'DM' || event.space.spaceType === 'DIRECT_MESSAGE');
    if (isDm) registerSpace_(email, space, event.user.displayName);
    var text = String((event.message && (event.message.argumentText || event.message.text)) || '').trim();
    if (/一覧|承認待ち|list|pending/i.test(text)) {
      var pending = Workflow.listPendingFor(email);
      if (!pending.length) return { text: '承認待ちの案件はありません。' };
      var lines = pending.map(function (p) { return '・' + p.id + ' ' + p.typeName + '（' + p.applicantName + '）' + p.summary; });
      return { text: '承認待ちの案件 ' + pending.length + ' 件\n' + lines.join('\n') + (getSetting_('APP_URL', '') ? '\n' + getSetting_('APP_URL', '') : '') };
    }
    if (/自分|申請|mine/i.test(text)) {
      var mine = Workflow.listMine(email).slice(0, 10);
      if (!mine.length) return { text: 'あなたの申請はありません。' };
      return { text: '最近の申請\n' + mine.map(function (m) { return '・' + m.id + ' ' + m.typeName + ' … ' + m.statusLabel; }).join('\n') };
    }
    return { text: (isDm ? 'このチャットを通知先として登録しました。' : '') + '\n使い方: 「一覧」= 承認待ち案件 / 「自分の申請」= 自分の申請状況' +
      (getSetting_('APP_URL', '') ? '\nWebアプリ: ' + getSetting_('APP_URL', '') : '') };
  }

  function param_(event, key) {
    var params = (event.common && event.common.parameters) || {};
    if (params[key] !== undefined) return params[key];
    var list = (event.action && event.action.parameters) || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].value;
    return '';
  }

  function formValue_(event, name) {
    var inputs = (event.common && event.common.formInputs) || {};
    var v = inputs[name];
    if (!v) return '';
    if (v.stringInputs && v.stringInputs.value) return v.stringInputs.value[0] || '';
    if (v[''] && v[''].stringInputs) return v[''].stringInputs.value[0] || '';
    return '';
  }

  function resultCard_(title, body) {
    return {
      header: { title: title, subtitle: APP_NAME },
      sections: [{ widgets: [{ textParagraph: { text: body } }] }]
    };
  }

  function updateMessage_(card) {
    return { actionResponse: { type: 'UPDATE_MESSAGE' }, cardsV2: [{ cardId: 'result-' + Utilities.getUuid(), card: card }] };
  }

  function onCardClick(event) {
    var email = Users.normalize(event.user && event.user.email);
    var fn = (event.common && event.common.invokedFunction) || (event.action && event.action.actionMethodName) || '';
    var id = param_(event, 'id');
    try {
      if (fn === 'approveFromChat') {
        var req = Workflow.approve(id, email, 'Chat から承認');
        return updateMessage_(resultCard_('✅ 承認しました', req.applicantName + ' さんの「' + req.typeName + '」（' + req.id + '）<br>現在の状態: ' + req.statusLabel));
      }
      if (fn === 'openRejectDialog') {
        return {
          actionResponse: {
            type: 'DIALOG',
            dialogAction: {
              dialog: {
                body: {
                  sections: [{
                    header: '申請 ' + id + ' を却下します',
                    widgets: [
                      { textInput: { name: 'reason', label: '却下理由（必須・申請者へ通知されます）', type: 'MULTIPLE_LINE' } },
                      { buttonList: { buttons: [{ text: '却下を確定', onClick: { action: { function: 'rejectFromChat', parameters: [{ key: 'id', value: id }] } } }] } }
                    ]
                  }]
                }
              }
            }
          }
        };
      }
      if (fn === 'rejectFromChat') {
        var reason = formValue_(event, 'reason');
        if (!reason) {
          return { actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode: 'INVALID_ARGUMENT', userFacingMessage: '却下理由を入力してください。' } } } };
        }
        var rejectedReq = Workflow.reject(id, email, reason);
        // ダイアログを閉じ、元のメッセージは更新せずに結果を DM で知らせる
        try {
          var space = spaceFor(email);
          if (space) Notify.chatApiRequest('POST', space + '/messages', { text: '❌ ' + rejectedReq.id + ' を却下しました。理由: ' + reason });
        } catch (e) { /* ignore */ }
        return { actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode: 'OK', userFacingMessage: '却下しました。' } } } };
      }
      if (fn === 'receiveFromChat') {
        var received = Workflow.receive(id, email, 'Chat から受理');
        return updateMessage_(resultCard_('📥 受理を記録しました', received.applicantName + ' さんの「' + received.typeName + '」（' + received.id + '）<br>現在の状態: ' + received.statusLabel));
      }
      return { text: '不明な操作です: ' + fn };
    } catch (e) {
      log_('WARN', 'Chat 操作エラー', { fn: fn, id: id, email: email, error: String(e) });
      var msg = String(e.message || e);
      if (event.isDialogEvent || (event.dialogEventType && event.dialogEventType !== 'TYPE_UNSPECIFIED')) {
        return { actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode: 'FAILED_PRECONDITION', userFacingMessage: msg } } } };
      }
      return { actionResponse: { type: 'NEW_MESSAGE' }, text: '⚠️ ' + msg };
    }
  }

  return {
    spaceFor: spaceFor,
    registerSpace: registerSpace_,
    listRegistered: listRegistered,
    onAdded: onAdded,
    onRemoved: onRemoved,
    onMessage: onMessage,
    onCardClick: onCardClick
  };
})();

// ---- Chat から呼ばれるグローバル関数（Chat アプリ設定の関数名と一致させる） ----
function onAddedToSpace(event) { return ChatApp.onAdded(event); }
function onRemovedFromSpace(event) { return ChatApp.onRemoved(event); }
function onMessage(event) { return ChatApp.onMessage(event); }
function onCardClick(event) { return ChatApp.onCardClick(event); }
