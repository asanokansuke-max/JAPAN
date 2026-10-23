/**
 * 初期セットアップ
 *
 * スクリプトエディタで setup() を1回実行すると、必要なシートと初期マスターを作成する。
 * 既存のシート・データは上書きしない（不足しているシートと設定キーだけ追加する）。
 */
function setup() {
  var ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach(function (name) { ensureSheet_(ss, name, HEADERS[name]); });
  // テスト用データシート
  TEST_SEPARATED_SHEETS.forEach(function (name) { ensureSheet_(ss, name + '_TEST', HEADERS[name]); });

  // 設定（不足キーのみ追加）
  var settingsSheet = ss.getSheetByName(SHEET.SETTINGS);
  var existingKeys = settingsSheet.getLastRow() > 1 ? settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  DEFAULT_SETTINGS.forEach(function (d) { if (existingKeys.indexOf(d[0]) < 0) settingsSheet.appendRow(d); });

  // 申請種別マスター
  seedIfEmpty_(ss, SHEET.TYPES, [
    ['early_overtime', '早朝残業申請', 'TRUE', 1, '特別残業事後申請（早朝残業）'],
    ['substitute_holiday', '代休申請', 'TRUE', 2, '休日出勤に対する代休の申請'],
    ['snow_removal', '除雪申請', 'TRUE', 3, '除雪作業の申請（入力項目は要確認）']
  ]);

  // 承認経路（既定経路 * : 上長 → 常務（代理承認者も可） → 総務課・社長で受理）
  seedIfEmpty_(ss, SHEET.ROUTES, [
    ['*', 1, '上長承認', STEP_TYPE.APPROVAL, ROLE.MANAGER, SELECT_MODE.APPLICANT, '申請者が上長を選択する'],
    ['*', 2, '常務承認', STEP_TYPE.APPROVAL, ROLE.DIRECTOR + ',' + ROLE.DEPUTY, SELECT_MODE.ROLE, '常務または代理承認者のどちらかが承認すれば完了'],
    ['*', 3, '総務課・社長受理', STEP_TYPE.RECEIPT, ROLE.GENERAL_AFFAIRS + ',' + ROLE.PRESIDENT, SELECT_MODE.ROLE, '承認ではなく提出先。受理を記録する']
  ]);

  // 役割マスター（テスト用: すべて kobayashi.jinji@appx.co.jp に集約）
  var test = 'kobayashi.jinji@appx.co.jp';
  var me = Session.getEffectiveUser().getEmail() || test;
  seedIfEmpty_(ss, SHEET.ROLES, [
    [ROLE.ADMIN, me, '', ENV.BOTH, 'TRUE', 'セットアップ実行者'],
    [ROLE.MANAGER, test, '小林 仁次', ENV.TEST, 'TRUE', 'テスト用'],
    [ROLE.DIRECTOR, test, '小林 仁次', ENV.TEST, 'TRUE', 'テスト用（常務）'],
    [ROLE.DEPUTY, test, '小林 仁次', ENV.BOTH, 'TRUE', '常務不在時の代理承認'],
    [ROLE.GENERAL_AFFAIRS, test, '小林 仁次', ENV.TEST, 'TRUE', 'テスト用（総務担当者①）'],
    [ROLE.PRESIDENT, test, '小林 仁次', ENV.TEST, 'TRUE', 'テスト用（社長）'],
    [ROLE.MANAGER, '', '', ENV.PROD, 'FALSE', '本番用の上長をここに追加（メールアドレスを入力し 有効=TRUE）'],
    [ROLE.DIRECTOR, '', '', ENV.PROD, 'FALSE', '本番用の常務'],
    [ROLE.GENERAL_AFFAIRS, '', '', ENV.PROD, 'FALSE', '本番用の総務課'],
    [ROLE.PRESIDENT, '', '', ENV.PROD, 'FALSE', '本番用の社長']
  ]);

  seedIfEmpty_(ss, SHEET.USERS, [[test, '小林 仁次', '', 'TRUE', '']]);

  // 説明文の初期値
  var descSheet = ss.getSheetByName(SHEET.DESCRIPTIONS);
  var existing = descSheet.getLastRow() > 1 ? descSheet.getRange(2, 1, descSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  var now = nowString_();
  if (existing.indexOf('early_overtime') < 0) descSheet.appendRow(['early_overtime',
    '<h3>注意事項</h3><ul>' +
    '<li>開始時刻の欄には<b>会社が認めた時刻</b>を入力すること。</li>' +
    '<li>終了時刻の欄には業務の終了時刻を入力（撮影終了ではありません）。</li>' +
    '<li>労基上10時及び15時の合計10分間休憩は必ず取得すること。</li>' +
    '<li>昼休憩は必ず<b>15分単位</b>で記入すること。</li></ul>', now, 'setup']);
  if (existing.indexOf('substitute_holiday') < 0) descSheet.appendRow(['substitute_holiday',
    '<h3>注意事項</h3><ol>' +
    '<li>所属長と打ち合わせの上、申請書を提出してください。</li>' +
    '<li>KING OF TIME への代休設定は総務で行います。</li>' +
    '<li>代休はできる限り給与締め日までに取得するようご協力お願いします。</li></ol>', now, 'setup']);
  if (existing.indexOf('snow_removal') < 0) descSheet.appendRow(['snow_removal',
    '<h3>注意事項</h3><ul><li>除雪作業の実施日・時間・場所を正確に記入してください。</li>' +
    '<li>複数人で作業した場合は作業者欄に全員の氏名を記入してください。</li></ul>', now, 'setup']);

  clearSettingsCache_();
  var url = (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })();
  console.log('セットアップ完了。' + (url ? ' Webアプリ URL: ' + url : ' Webアプリをデプロイ後、設定シートの APP_URL に URL を入力してください。'));
  return 'OK';
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#dbe7f5');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function seedIfEmpty_(ss, name, rows) {
  var sheet = ss.getSheetByName(name);
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/** 「シート1」など不要な既定シートを削除する補助関数（任意） */
function removeDefaultSheet() {
  var ss = getSpreadsheet_();
  ['シート1', 'Sheet1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
}

/**
 * Chat 通知用サービスアカウントの JSON キーを保存する。
 * スクリプトエディタでこの関数の json の中身を貼り付けて1回実行し、実行後は貼り付けた内容を消すこと。
 */
function saveChatServiceAccountJson() {
  var json = ''; // ← ここにサービスアカウントの JSON キーを貼り付けて実行
  if (!json) throw new Error('json にサービスアカウントの JSON を貼り付けてください。');
  JSON.parse(json);
  PropertiesService.getScriptProperties().setProperty('CHAT_SERVICE_ACCOUNT_JSON', json);
  CacheService.getScriptCache().remove('chat_app_token');
  console.log('保存しました。');
}

/** 動作確認用: テスト運用で自分宛てに申請を1件作って流れを試す */
function debugCreateSampleRequest() {
  var email = Session.getEffectiveUser().getEmail();
  var sel = Workflow.applicantSelections('early_overtime');
  var selections = {};
  sel.forEach(function (s) { if (s.candidates[0]) selections[String(s.stepIndex)] = s.candidates[0].email; });
  var req = Workflow.create(email, 'early_overtime', {
    work_date: formatDate_(new Date(), 'yyyy-MM-dd'), reason: '動作確認', start_time: '06:30', lunch_break: '60', end_time: '17:30', evening_break: 'none'
  }, selections);
  console.log(JSON.stringify(req, null, 2));
}
