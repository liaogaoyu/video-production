const crypto = require('node:crypto');
const statement = '请您使用本人照片/视频或取得充分授权，确保不存在违反法律法规、侵犯他人权益或违反公序良俗的内容。若因您不当使用本功能导致任何第三方权益受损，您将依法承担相应法律责任。';
const version = crypto.createHash('sha256').update(statement).digest('hex');
function readConfirmation(data) {
  let settings = data?.user_custom_settings ?? data?.userCustomSettings;
  if (typeof settings === 'string') settings = JSON.parse(settings);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw Error('官网未返回有效的用户设置，不能确认状态');
  return {confirmed: settings.aigc_compliance_confirmed === true || settings.aigcComplianceConfirmed === true};
}
module.exports = {statement, version, readConfirmation};
