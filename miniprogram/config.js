/**
 * 小程序配置文件
 */

const host = '14592619.qcloud.la'

const config = {
  // 测试的请求地址，用于测试会话
  requestUrl: 'https://mp.weixin.qq.com',
  host,

  // 缓存版本号（修改此值可强制刷新用户端缓存）
  CACHE_VERSION: '0.37',
  //更新说明
  VERSION_DESCRIPTION: '1.增加馆内购车借款申请（2步审批：财务主管→馆领导）。2.购车申请、购车借款申请均可导出PDF。3.修复预约会议室问题。4.增加新馆员到馆指南页。',

  // 云开发环境 ID
  envId: 'cloud1-8gdftlggae64d5d0',
  // envId: 'test-f0b102',

  // 云开发-存储 示例文件的文件 ID
  demoImageFileId: 'cloud://release-b86096.7265-release-b86096-1258211818/demo.jpg',
  demoVideoFileId: 'cloud://release-b86096.7265-release-b86096/demo.mp4',
}

module.exports = config
