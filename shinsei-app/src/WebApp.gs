/**
 * Webアプリのエントリポイント
 *   ?page=detail&id=XXXX  … 申請詳細を直接開く（Chat 通知内のリンク用）
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = params.page || '';
  template.initialId = params.id || '';
  template.appName = APP_NAME;
  return template.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** HTML テンプレートから別ファイルを読み込む */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
