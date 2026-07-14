/**
 * 小程序配置文件
 */

const config = {
  // 缓存版本号（修改此值可强制刷新用户端缓存）
  CACHE_VERSION: '0.42.14.4',
  //更新说明
  VERSION_DESCRIPTION: '欢迎使用报备助手！\n1.新增报备配置，可配置片长、馆领导报备人。2.出行数据板已改版。',

  // 云开发环境 ID
  envId: 'cloud1-d2gyip4xi1fcf54bd',

  // 订阅消息模板
  SUBSCRIBE_TEMPLATES: {
    // 模板1：注册审批结果通知（推送给注册用户）
    REGISTRATION_RESULT: 'fotJ5c43Hf4OEtR88Mx_bm2CaHKLR6mdrVp4Rz69MSU',
    // 模板2：待审批通知（推送给审批管理员）
    PENDING_APPROVAL: 'qKtP6ndBlIVWCCGLEHAmUfjiPdCiYJqx6TUWI9_-2x8',
    // 模板3：出行报备通知（推送给报备接收人）
    TRIP_REPORT: 's4TMlGjkc0Yb4hqsX-BUG0FyhldMvwKr_h7AueqjnOo'
  }
}

module.exports = config
