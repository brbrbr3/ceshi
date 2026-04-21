/**
 * 小程序配置文件
 */

const host = '14592619.qcloud.la'

const config = {
  // 测试的请求地址，用于测试会话
  requestUrl: 'https://mp.weixin.qq.com',
  host,

  // 缓存版本号（修改此值可强制刷新用户端缓存）
  CACHE_VERSION: '0.40.9',
  //更新说明
  VERSION_DESCRIPTION: '1.‘休假申请’功能可自动计算假期组成。\n2.现在可在‘我的’页面修改字体大小。\n3.增加‘常用信息’栏目。\n4.首页增加“通讯录”页。',

  // 云开发环境 ID
  envId: 'cloud1-8gdftlggae64d5d0',
  // envId: 'test-f0b102',

  // 云开发-存储 示例文件的文件 ID
  demoImageFileId: 'cloud://release-b86096.7265-release-b86096-1258211818/demo.jpg',
  demoVideoFileId: 'cloud://release-b86096.7265-release-b86096/demo.mp4',
}

module.exports = config
