/**
 * 通知（Google Chat ダイレクトメッセージ優先、メールはフォールバック）
 *
 * ■ Chat の DM 送信の仕組み
 *   - 利用者が Chat でこのアプリ（Chat アプリ）に話しかける／追加すると、ChatApp.gs の onAddedToSpace /
 *     onMessage が DM スペース名を「Chat通知先」シートに自動登録する
 *   - 通知はサービスアカウント（アプリ認証）で Chat REST API を呼び出して送る
 *     → スクリプトプロパティ CHAT_SERVICE_ACCOUNT_JSON にサービスアカウントの JSON キーを保存する
 *   - DM が未登録の相手には spaces:findDirectMessage で探し、無ければメール（NOTIFY_EMAIL_FALLBACK）
 *
 * ■ テスト運用（MODE=TEST）
 *   - すべての通知は TEST_NOTIFY_EMAIL へ集約し、本来の宛先を本文に表示する
 */
var Notify = (function () {

  var CHAT_API = 'https://chat.googleapis.com/v1/';

  // ---------------------------------------------------------------- 宛先解決
  function redirectForTest_(emails) {
    if (!isTestMode_()) return emails.map(function (e) { return { to: e, original: e }; });
    var testTo = Users.normalize(getSetting_('TEST_NOTIFY_EMAIL', ''));
    if (!testTo) return [];
    var seen = {};
    return emails.filter(function (e) { if (seen[e]) return false; seen[e] = true; return true; })
      .map(function (e) { return { to: testTo, original: e }; });
  }

  function appUrl_(query) {
    var base = getSetting_('APP_URL', '');
    if (!base) { try { base = ScriptApp.getService().getUrl() || ''; } catch (e) { base = ''; } }
    if (!base) return '';
    return base + (query ? (base.indexOf('?') >= 0 ? '&' : '?') + query : '');
  }

  function detailUrl_(req) { return appUrl_('page=detail&id=' + encodeURIComponent(req.id)); }

  // ---------------------------------------------------------------- 送信の中核
  /**
   * @param {string[]} emails 宛先
   * @param {string} text プレーンテキスト本文（メール・フォールバック用）
   * @param {Object=} card Chat の Cards v2 カード（任意）
   * @param {string=} subject メール件名
   */
  function send_(emails, text, card, subject) {
    var targets = redirectForTest_((emails || []).map(Users.normalize).filter(String));
    targets.forEach(function (t) {
      var body = text;
      var cardCopy = card ? JSON.parse(JSON.stringify(card)) : null;
      if (isTestMode_()) {
        var redirected = t.to !== t.original;
        body = '【テスト運用】' + (redirected ? '本来の宛先: ' + t.original + '\n' : '\n') + text;
        if (cardCopy && cardCopy.header) cardCopy.header.subtitle = '【テスト】' + (redirected ? '宛先: ' + t.original : '') + (cardCopy.header.subtitle ? ' / ' + cardCopy.header.subtitle : '');
      }
      var sent = false;
      if (isTrue_(getSetting_('NOTIFY_CHAT_DM', 'TRUE'))) sent = sendChatDm_(t.to, body, cardCopy);
      if (!sent && getSetting_('CHAT_WEBHOOK_URL', '')) sent = sendWebhook_(t.to, body);
      if (!sent && isTrue_(getSetting_('NOTIFY_EMAIL_FALLBACK', 'TRUE'))) sent = sendEmail_(t.to, subject || APP_NAME, body);
      if (!sent) log_('WARN', '通知を送れませんでした', { to: t.to, subject: subject });
    });
  }

  // ---------------------------------------------------------------- Chat DM
  function sendChatDm_(email, text, card) {
    try {
      var space = ChatApp.spaceFor(email);
      if (!space) { log_('INFO', 'Chat DM 未登録のため他の手段で通知', { email: email }); return false; }
      var message = { text: text };
      if (card) message.cardsV2 = [{ cardId: 'req-' + Utilities.getUuid(), card: card }];
      var res = chatApiRequest_('POST', space + '/messages', message);
      return !!res;
    } catch (e) {
      log_('ERROR', 'Chat DM 送信失敗', { email: email, error: String(e) });
      return false;
    }
  }

  /** Chat REST API 呼び出し（サービスアカウントによるアプリ認証） */
  function chatApiRequest_(method, path, payload) {
    var token = getChatAppToken_();
    if (!token) return null;
    var res = UrlFetchApp.fetch(CHAT_API + path.replace(/^\//, ''), {
      method: method,
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: payload ? JSON.stringify(payload) : undefined,
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return JSON.parse(res.getContentText() || '{}');
    if (code === 404) return null;
    throw new Error('Chat API ' + code + ': ' + res.getContentText());
  }

  /** サービスアカウントの JWT からアクセストークンを得る（1時間キャッシュ） */
  function getChatAppToken_() {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('chat_app_token');
    if (cached) return cached;
    var json = PropertiesService.getScriptProperties().getProperty('CHAT_SERVICE_ACCOUNT_JSON');
    if (!json) { log_('INFO', 'CHAT_SERVICE_ACCOUNT_JSON が未設定のため Chat DM は送信できません'); return null; }
    var sa = JSON.parse(json);
    var now = Math.floor(Date.now() / 1000);
    var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=+$/, '');
    var claim = Utilities.base64EncodeWebSafe(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/chat.bot',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })).replace(/=+$/, '');
    var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(header + '.' + claim, sa.private_key)).replace(/=+$/, '');
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claim + '.' + sig },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('トークン取得失敗: ' + res.getContentText());
    var token = JSON.parse(res.getContentText()).access_token;
    cache.put('chat_app_token', token, 3300);
    return token;
  }

  // ---------------------------------------------------------------- Webhook / メール
  function sendWebhook_(email, text) {
    try {
      var url = getSetting_('CHAT_WEBHOOK_URL', '');
      if (!url) return false;
      UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ text: '📨 ' + Users.displayName(email) + ' さん宛\n' + text })
      });
      return true;
    } catch (e) {
      log_('ERROR', 'Webhook 送信失敗', String(e));
      return false;
    }
  }

  function sendEmail_(email, subject, text) {
    try {
      MailApp.sendEmail({ to: email, subject: '[' + APP_NAME + '] ' + subject, body: text, name: APP_NAME });
      return true;
    } catch (e) {
      log_('ERROR', 'メール送信失敗', { email: email, error: String(e) });
      return false;
    }
  }

  // ---------------------------------------------------------------- 本文・カード
  function headline_(req) {
    return req.applicantName + ' さんの「' + req.typeName + '」（' + req.id + '）';
  }

  function detailLines_(req) {
    var rows = RequestTypes.displayRows(req.typeId, req.values);
    return rows.map(function (r) { return '・' + r.label + ': ' + r.value; }).join('\n');
  }

  function detailWidgets_(req, maxRows) {
    var rows = RequestTypes.displayRows(req.typeId, req.values);
    var widgets = rows.slice(0, maxRows || 8).map(function (r) {
      return { decoratedText: { topLabel: r.label, text: String(r.value).slice(0, 200), wrapText: true } };
    });
    if (rows.length > (maxRows || 8)) widgets.push({ textParagraph: { text: '…他 ' + (rows.length - (maxRows || 8)) + ' 項目は詳細画面で確認してください。' } });
    return widgets;
  }

  function linkButton_(label, url) {
    return { text: label, onClick: { openLink: { url: url } } };
  }

  /** 承認依頼カード（承認・却下ボタン付き） */
  function approvalCard_(req, step) {
    var buttons = [
      { text: '✅ 承認', onClick: { action: { function: 'approveFromChat', parameters: [{ key: 'id', value: req.id }] } }, color: { red: 0.1, green: 0.55, blue: 0.3, alpha: 1 } },
      { text: '❌ 却下', onClick: { action: { function: 'openRejectDialog', interaction: 'OPEN_DIALOG', parameters: [{ key: 'id', value: req.id }] } } }
    ];
    var url = detailUrl_(req);
    if (url) buttons.push(linkButton_('詳細を開く', url));
    return {
      header: { title: '承認依頼: ' + req.typeName, subtitle: req.applicantName + ' さん / ' + step.name },
      sections: [
        { header: '申請内容', widgets: [{ decoratedText: { topLabel: '申請ID', text: req.id } }].concat(detailWidgets_(req)) },
        { widgets: [{ buttonList: { buttons: buttons } }] }
      ]
    };
  }

  /** お知らせカード（ボタンは詳細リンクのみ） */
  function infoCard_(title, req, lines, extraWidgets) {
    var widgets = [{ decoratedText: { topLabel: '申請', text: headline_(req), wrapText: true } },
                   { decoratedText: { topLabel: '現在の状態', text: req.statusLabel || Workflow.statusLabel(req), wrapText: true } }];
    (lines || []).forEach(function (l) { widgets.push({ textParagraph: { text: l } }); });
    (extraWidgets || []).forEach(function (w) { widgets.push(w); });
    var url = detailUrl_(req);
    if (url) widgets.push({ buttonList: { buttons: [linkButton_('詳細を開く', url)] } });
    return { header: { title: title, subtitle: req.typeName }, sections: [{ widgets: widgets }] };
  }

  // ---------------------------------------------------------------- イベント別の通知
  /** 承認依頼（担当者全員へ。常務ステップは代理承認者にも同時に届く） */
  function approvalRequest(req, step, approvers) {
    if (!step || !approvers || !approvers.length) { log_('WARN', '承認者が見つかりません', { id: req.id, step: step && step.name }); return; }
    var text = '📝 承認依頼: ' + headline_(req) + '\nステップ: ' + step.name + '\n概要: ' + req.summary + '\n' + detailLines_(req) +
      (detailUrl_(req) ? '\n詳細: ' + detailUrl_(req) : '');
    send_(approvers, text, approvalCard_(req, step), '承認依頼 ' + req.typeName + '（' + req.applicantName + '）');
  }

  /** 途中の承認が完了し次の承認者へ回ったことを申請者へ */
  function stepApproved(req, step, actorEmail, nextStep) {
    var text = '✅ ' + step.name + 'が完了しました（承認者: ' + Users.displayName(actorEmail) + '）。\n' + headline_(req) +
      (nextStep ? '\n次は「' + nextStep.name + '」へ回りました。' : '') + '\n現在の状態: ' + req.statusLabel;
    send_([req.applicantEmail], text, infoCard_('承認が進みました', req, ['承認者: ' + Users.displayName(actorEmail) + (nextStep ? '<br>次の承認者へ回りました（' + nextStep.name + '）' : '')]), '承認が進みました ' + req.typeName);
  }

  /** 最終承認完了を申請者へ */
  function finalApproved(req, actorEmail) {
    var text = '🎉 最終承認が完了しました（承認者: ' + Users.displayName(actorEmail) + '）。\n' + headline_(req) + '\n現在の状態: ' + req.statusLabel;
    send_([req.applicantEmail], text, infoCard_('最終承認が完了しました', req, ['最終承認者: ' + Users.displayName(actorEmail)]), '最終承認完了 ' + req.typeName);
  }

  /** 総務課・社長への提出通知（受理担当者へ） */
  function forwarded(req, step, receivers) {
    if (!receivers || !receivers.length) { log_('WARN', '受理担当者が見つかりません', { id: req.id }); return; }
    var url = detailUrl_(req);
    var text = '📬 提出: ' + headline_(req) + ' が最終承認され提出されました。内容を確認し、受理の記録をお願いします。\n概要: ' + req.summary + '\n' + detailLines_(req) + (url ? '\n受理画面: ' + url : '');
    var card = infoCard_('最終承認済みの申請が提出されました', req, ['内容を確認のうえ、受理を記録してください。'], detailWidgets_(req, 6));
    card.sections[0].widgets.push({ buttonList: { buttons: [{ text: '📥 受理する', onClick: { action: { function: 'receiveFromChat', parameters: [{ key: 'id', value: req.id }] } } }] } });
    send_(receivers, text, card, '提出 ' + req.typeName + '（' + req.applicantName + '）');
  }

  /** 却下を申請者へ */
  function rejected(req, actorEmail) {
    var text = '❌ 申請が却下されました（' + Users.displayName(actorEmail) + '）。\n' + headline_(req) + '\n理由: ' + req.rejectReason;
    send_([req.applicantEmail], text, infoCard_('申請が却下されました', req, ['却下者: ' + Users.displayName(actorEmail), '理由: ' + req.rejectReason]), '却下 ' + req.typeName);
  }

  /** 受理完了を申請者と承認者へ */
  function received(req, actorEmail) {
    var text = '📥 申請が受理されました（受理: ' + Users.displayName(actorEmail) + '）。\n' + headline_(req);
    var to = [req.applicantEmail];
    send_(to, text, infoCard_('申請が受理されました', req, ['受理担当: ' + Users.displayName(actorEmail)]), '受理 ' + req.typeName);
  }

  /** 取下げを承認待ちの承認者へ */
  function withdrawn(req, approvers) {
    var text = '↩️ 申請が取り下げられました。\n' + headline_(req);
    send_(approvers || [], text, infoCard_('申請が取り下げられました', req, []), '取下げ ' + req.typeName);
  }

  /** 管理画面からの通知テスト */
  function sendTest(email) {
    var text = '🔔 ' + APP_NAME + ' の通知テストです。この通知が届けば設定は正常です。\n運用モード: ' + (isTestMode_() ? 'テスト' : '本番');
    send_([email], text, { header: { title: '通知テスト', subtitle: APP_NAME }, sections: [{ widgets: [{ textParagraph: { text: text.replace(/\n/g, '<br>') } }] }] }, '通知テスト');
    return true;
  }

  return {
    approvalRequest: approvalRequest,
    stepApproved: stepApproved,
    finalApproved: finalApproved,
    forwarded: forwarded,
    rejected: rejected,
    received: received,
    withdrawn: withdrawn,
    sendTest: sendTest,
    chatApiRequest: chatApiRequest_,
    detailUrl: detailUrl_
  };
})();
