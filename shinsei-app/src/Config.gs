/**
 * 統合申請アプリ - 共通設定・定数
 *
 * スプレッドシートのシート名、状態コード、既定値などをここに集約する。
 * 運用ルール（承認経路・役割・説明文など）はコードではなくシート側で管理する。
 */

var APP_NAME = '統合申請アプリ';

/** シート名 */
var SHEET = {
  SETTINGS: '設定',
  USERS: '利用者マスター',
  ROLES: '役割マスター',
  TYPES: '申請種別マスター',
  ROUTES: '承認経路',
  DESCRIPTIONS: '申請説明文',
  REQUESTS: '申請データ',
  HISTORY: '操作履歴',
  CHAT_SPACES: 'Chat通知先',
  LOG: 'システムログ'
};

/** テスト運用時に本番と分けて保存するシート（名前に _TEST を付ける） */
var TEST_SEPARATED_SHEETS = [SHEET.REQUESTS, SHEET.HISTORY];

/** 各シートのヘッダー定義 */
var HEADERS = {};
HEADERS[SHEET.SETTINGS] = ['キー', '値', '説明'];
HEADERS[SHEET.USERS] = ['メールアドレス', '氏名', '部署', '有効', '備考'];
HEADERS[SHEET.ROLES] = ['役割', 'メールアドレス', '氏名', '環境', '有効', '備考'];
HEADERS[SHEET.TYPES] = ['種別ID', '名称', '有効', '表示順', '補足'];
HEADERS[SHEET.ROUTES] = ['申請種別ID', '順序', 'ステップ名', 'ステップ種類', '役割', '選択方式', '備考'];
HEADERS[SHEET.DESCRIPTIONS] = ['種別ID', '説明HTML', '更新日時', '更新者'];
HEADERS[SHEET.REQUESTS] = [
  '申請ID', '申請種別ID', '申請種別名', '申請者メール', '申請者名', '申請日時',
  '状態', '現在ステップ', '第1承認者メール', '第1承認者名', '概要', '内容JSON',
  '承認経路JSON', '最終承認日時', '受理日時', '更新日時', '却下理由'
];
HEADERS[SHEET.HISTORY] = ['日時', '申請ID', '操作', '操作者メール', '操作者名', 'ステップ', 'コメント', '環境'];
HEADERS[SHEET.CHAT_SPACES] = ['メールアドレス', 'スペース名', '表示名', '登録日時'];
HEADERS[SHEET.LOG] = ['日時', 'レベル', 'メッセージ', '詳細'];

/** 役割名（役割マスターの「役割」列に使う値） */
var ROLE = {
  APPLICANT: '一般申請者',
  MANAGER: '上長',
  DIRECTOR: '常務',
  DEPUTY: '代理承認者',
  GENERAL_AFFAIRS: '総務課',
  PRESIDENT: '社長',
  ADMIN: 'システム管理者'
};
var ALL_ROLES = [ROLE.APPLICANT, ROLE.MANAGER, ROLE.DIRECTOR, ROLE.DEPUTY,
  ROLE.GENERAL_AFFAIRS, ROLE.PRESIDENT, ROLE.ADMIN];

/** 役割マスターの「環境」列の値 */
var ENV = { PROD: '本番', TEST: 'テスト', BOTH: '共通' };

/** 運用モード（設定シート MODE） */
var MODE = { PROD: 'PROD', TEST: 'TEST' };

/** 申請の状態コード */
var STATUS = {
  PENDING: 'PENDING',       // 承認待ち（現在ステップで待機中）
  SUBMITTED: 'SUBMITTED',   // 最終承認済み・総務課・社長へ提出済み（受理待ち）
  RECEIVED: 'RECEIVED',     // 受理済み
  REJECTED: 'REJECTED',     // 却下
  WITHDRAWN: 'WITHDRAWN'    // 申請者が取下げ
};

/** ステップ種類 */
var STEP_TYPE = { APPROVAL: '承認', RECEIPT: '受理' };

/** 選択方式 */
var SELECT_MODE = { APPLICANT: '申請者が選択', ROLE: '役割全員' };

/** 操作履歴の操作名 */
var ACTION = {
  SUBMIT: '申請',
  APPROVE: '承認',
  REJECT: '却下',
  FINAL_APPROVE: '最終承認',
  FORWARD: '提出',
  RECEIVE: '受理',
  WITHDRAW: '取下げ',
  NOTIFY: '通知'
};

/** 設定シートの既定値 */
var DEFAULT_SETTINGS = [
  ['MODE', 'TEST', '運用モード。TEST=テスト運用（通知は TEST_NOTIFY_EMAIL に集約、データは _TEST シートに保存） / PROD=本番運用'],
  ['TEST_NOTIFY_EMAIL', 'kobayashi.jinji@appx.co.jp', 'テスト運用時にすべての通知を集約する宛先'],
  ['APP_URL', '', 'Webアプリの URL（デプロイ後に貼り付け。Chat 通知内のリンクに使用）'],
  ['NOTIFY_CHAT_DM', 'TRUE', 'Google Chat のダイレクトメッセージで通知する（Chat アプリの設定が必要）'],
  ['NOTIFY_EMAIL_FALLBACK', 'TRUE', 'Chat の DM が送れない相手にはメールで通知する'],
  ['CHAT_WEBHOOK_URL', '', '（任意）DM が使えない場合に投稿する Chat スペースの着信 Webhook URL'],
  ['RECEIPT_RULE', 'ANY', '受理の完了条件。ANY=総務課・社長のいずれか1人が受理すれば完了 / ALL=受理役割の全員が受理'],
  ['ALLOW_WITHDRAW', 'TRUE', '申請者が「上長の承認待ち」の間だけ申請を取下げできる'],
  ['EARLY_OT_END_TIME', '08:20', '早朝残業とみなす時間帯の終了時刻（始業時刻）'],
  ['DEFAULT_WORK_END_TIME', '17:30', '業務終了時刻の既定値'],
  ['NOTIFY_DEPUTY_ALWAYS', 'TRUE', '常務への承認依頼を代理承認者にも同時通知する']
];

/** 現在のスプレッドシート（コンテナバインド前提。スタンドアロンの場合は SPREADSHEET_ID を使う） */
function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートが見つかりません。スクリプトプロパティ SPREADSHEET_ID を設定してください。');
  return ss;
}

/** 設定値をすべて取得（キャッシュ付き） */
function getSettings_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('settings');
  if (cached) return JSON.parse(cached);
  var rows = Db.readAll(SHEET.SETTINGS);
  var settings = {};
  DEFAULT_SETTINGS.forEach(function (d) { settings[d[0]] = d[1]; });
  rows.forEach(function (r) {
    if (r['キー']) settings[String(r['キー']).trim()] = r['値'] === undefined || r['値'] === null ? '' : String(r['値']).trim();
  });
  cache.put('settings', JSON.stringify(settings), 60);
  return settings;
}

function getSetting_(key, fallback) {
  var s = getSettings_();
  var v = s[key];
  if (v === undefined || v === '') return fallback === undefined ? '' : fallback;
  return v;
}

function isTrue_(v) {
  return String(v).toUpperCase() === 'TRUE' || v === true || String(v) === '1';
}

function isTestMode_() {
  return getSetting_('MODE', MODE.TEST).toUpperCase() !== MODE.PROD;
}

function clearSettingsCache_() {
  CacheService.getScriptCache().remove('settings');
}

/** 運用モードに応じたシート名（申請データ・操作履歴はテスト時 _TEST に分離） */
function dataSheetName_(baseName) {
  // 先に対象シートかどうかを判定する（設定シートの読み込みで再帰しないため）
  if (TEST_SEPARATED_SHEETS.indexOf(baseName) < 0) return baseName;
  return isTestMode_() ? baseName + '_TEST' : baseName;
}

function nowString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
}

function formatDate_(d, pattern) {
  if (!d) return '';
  if (!(d instanceof Date)) {
    var parsed = new Date(d);
    if (isNaN(parsed.getTime())) return String(d);
    d = parsed;
  }
  return Utilities.formatDate(d, Session.getScriptTimeZone(), pattern || 'yyyy/MM/dd');
}

/** システムログ（失敗しても処理は止めない） */
function log_(level, message, detail) {
  try {
    var sheet = Db.getSheet(SHEET.LOG);
    sheet.appendRow([nowString_(), level, message, detail ? (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 40000) : '']);
    var max = 2000;
    if (sheet.getLastRow() > max + 1) sheet.deleteRows(2, sheet.getLastRow() - max - 1);
  } catch (e) {
    console.error(level + ': ' + message + ' ' + (detail ? JSON.stringify(detail) : '') + ' / log failed: ' + e);
  }
  if (level === 'ERROR') console.error(message, detail); else console.log(message, detail || '');
}
