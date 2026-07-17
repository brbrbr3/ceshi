// 审核员登录云函数
// 验证账号密码，审核结束后可直接修改密码或删除此云函数
const cloud = require('wx-server-sdk')
cloud.init()

// ========== 审核员账号密码配置 ==========
// 审核结束后请修改密码或删除此云函数
const REVIEWER_CREDENTIALS = {
  account: '888',
  password: '20262026'
}

exports.main = async (event, context) => {
  const { account, password } = event

  if (!account || !password) {
    return { code: 400, message: '请输入账号和密码', data: null }
  }

  if (account === REVIEWER_CREDENTIALS.account && password === REVIEWER_CREDENTIALS.password) {
    // 记录审核员登录日志（便于审计）
    try {
      const wxContext = cloud.getWXContext()
      console.log('[reviewerLogin] 审核员登录成功, openid:', wxContext.OPENID, 'time:', Date.now())
    } catch (e) {
      // 静默失败
    }

    return {
      code: 0,
      message: 'ok',
      data: {
        account: REVIEWER_CREDENTIALS.account,
        loginAt: Date.now()
      }
    }
  }

  return { code: 401, message: '账号或密码错误', data: null }
}
