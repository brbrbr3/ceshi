/**
 * 小程序配置文件
 */

const host = '14592619.qcloud.la'

const config = {
  // 测试的请求地址，用于测试会话
  requestUrl: 'https://mp.weixin.qq.com',
  host,

  // 缓存版本号（修改此值可强制刷新用户端缓存）
  CACHE_VERSION: '0.42.3',
  //更新说明
  VERSION_DESCRIPTION: '欢迎使用报备助手！',

  // 云开发环境 ID
  envId: 'cloud1-d2gyip4xi1fcf54bd',
  // envId: 'test-f0b102',

  // 云开发-存储 示例文件的文件 ID
  demoImageFileId: 'cloud://release-b86096.7265-release-b86096-1258211818/demo.jpg',
  demoVideoFileId: 'cloud://release-b86096.7265-release-b86096/demo.mp4',
}

module.exports = config
