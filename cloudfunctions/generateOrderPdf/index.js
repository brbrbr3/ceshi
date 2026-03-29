const cloud = require('wx-server-sdk')
const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 中文字体配置
const FONT_DIR = '/tmp/fonts'
const FONT_FILE = path.join(FONT_DIR, 'SourceHanSansSC-Regular.otf')
const FONT_FILE_ID = 'cloud://cloud1-8gdftlggae64d5d0.636c-cloud1-8gdftlggae64d5d0-1390912780/fonts/SourceHanSansSC-Regular.otf'

/**
 * 确保字体文件已下载到本地（/tmp 缓存，同一实例只下载一次）
 */
async function ensureFont() {
  if (fs.existsSync(FONT_FILE)) {
    return FONT_FILE
  }

  if (!fs.existsSync(FONT_DIR)) {
    fs.mkdirSync(FONT_DIR, { recursive: true })
  }

  const res = await cloud.downloadFile({ fileID: FONT_FILE_ID })
  fs.writeFileSync(FONT_FILE, res.fileContent)
  return FONT_FILE
}

/**
 * 格式化字段值
 * - 数组用逗号拼接
 * - null/undefined/空字符串显示 '-'
 * - 其他直接 toString
 */
function formatFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '-'
  }
  return String(value)
}

/**
 * 从 sys_config 读取 WORKFLOW_ACTION_TEXT
 */
async function getActionTextMap() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ type: 'workflow', key: 'WORKFLOW_ACTION_TEXT' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0 && configRes.data[0].value) {
      return configRes.data[0].value
    }
  } catch (e) {
    // 降级使用空映射
  }
  return {}
}

/**
 * 从 sys_config 读取 TIMEZONE_OFFSET（小时偏移量，默认 -3）
 */
async function getTimezoneOffset() {
  try {
    const configRes = await db.collection('sys_config')
      .where({ type: 'timezone', key: 'TIMEZONE_OFFSET' })
      .limit(1)
      .get()
    if (configRes.data && configRes.data.length > 0) {
      return configRes.data[0].value !== undefined ? configRes.data[0].value : -3
    }
  } catch (e) {
    // 降级使用默认值
  }
  return -3
}

/**
 * 将 Date 对象应用时区偏移，返回格式化的本地时间字符串
 */
function formatLocalTime(date, offsetHours) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000
  const local = new Date(utc + offsetHours * 3600000)
  const y = local.getFullYear()
  const m = String(local.getMonth() + 1).padStart(2, '0')
  const d = String(local.getDate()).padStart(2, '0')
  const h = String(local.getHours()).padStart(2, '0')
  const min = String(local.getMinutes()).padStart(2, '0')
  const s = String(local.getSeconds()).padStart(2, '0')
  return `${y}/${m}/${d} ${h}:${min}:${s}`
}

/**
 * 通用工单 PDF 导出
 * 接收 orderId，从 work_orders 获取 businessData，
 * 从 workflow_templates 获取 displayConfig.detailFields，动态生成 PDF。
 */
async function generateOrderPdf(openid, orderId) {
  // 1. 查询工单
  const orderRes = await db.collection('work_orders').doc(orderId).get()
  const order = orderRes.data

  // 权限校验
  const applicantId = order.businessData?.applicantId
  if (applicantId && applicantId !== openid) {
    throw new Error('无权导出此工单')
  }

  // 2. 查询工作流模板（实时读取最新 detailFields）
  let template = null
  if (order.templateId) {
    const templateRes = await db.collection('workflow_templates').doc(order.templateId).get()
    template = templateRes.data
  }

  const detailFields = template?.displayConfig?.detailFields || []
  const templateName = template?.name || order.templateName || '工单'
  const businessData = order.businessData || {}

  // 3. 查询审批日志
  const logsRes = await db.collection('workflow_logs')
    .where({ orderId })
    .orderBy('createdAt', 'asc')
    .get()
  const logs = logsRes.data

  // 4. 读取 action 文本映射和时区偏移
  const [actionTextMap, timezoneOffset] = await Promise.all([
    getActionTextMap(),
    getTimezoneOffset()
  ])

  // 5. 生成 PDF
  const fontPath = await ensureFont()

  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  })
  pdfDoc.registerFont('ChineseFont', fontPath)

  const buffers = []
  pdfDoc.on('data', buffers.push.bind(buffers))

  const tempFileUrl = await new Promise((resolve, reject) => {
    pdfDoc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers)
        const fileName = `${order.orderType || 'order'}_${order.orderNo || order._id}_${Date.now()}.pdf`
        const uploadResult = await cloud.uploadFile({
          cloudPath: `order_pdfs/${fileName}`,
          fileContent: pdfBuffer
        })
        const tempUrl = await cloud.getTempFileURL({
          fileList: [uploadResult.fileID]
        })
        resolve(tempUrl.fileList[0].tempFileURL)
      } catch (err) {
        reject(new Error('PDF上传失败: ' + err.message))
      }
    })

    pdfDoc.on('error', (err) => {
      reject(new Error('PDF生成失败: ' + err.message))
    })

    // 标题
    pdfDoc.fontSize(20).font('ChineseFont').text(`${templateName}表`, { align: 'center' })
    pdfDoc.moveDown(1)

    // 申请编号（固定附加字段）
    pdfDoc.fontSize(12).font('ChineseFont')
    pdfDoc.text(`申请编号：`, 50, undefined, { continued: true })
    pdfDoc.font('ChineseFont').text(order.orderNo || '-')
    pdfDoc.moveDown(0.3)

    // 动态字段列表（全部显示，不做 condition 判断）
    detailFields.forEach(fieldConfig => {
      const value = formatFieldValue(businessData[fieldConfig.field])
      pdfDoc.text(`${fieldConfig.label}：`, 50, undefined, { continued: true })
      pdfDoc.text(value)
      pdfDoc.moveDown(0.3)
    })

    // 审批记录区域
    pdfDoc.moveDown(1)
    pdfDoc.fontSize(14).font('ChineseFont').text('审批记录', { underline: true })
    pdfDoc.moveDown(0.5)
    pdfDoc.fontSize(11)

    logs.forEach(log => {
      const actionText = actionTextMap[log.action] || log.action
      const timeStr = log.createdAt
        ? formatLocalTime(new Date(log.createdAt), timezoneOffset)
        : '-'

      pdfDoc.text(`[${timeStr}] ${log.operatorName || '-'} - ${actionText}`)
      if (log.approvalComment) {
        pdfDoc.text(`  审批意见：${log.approvalComment}`)
      }
      pdfDoc.moveDown(0.3)
    })

    // 底部信息
    pdfDoc.moveDown(1)
    pdfDoc.fontSize(9).fillColor('#999999')
      .text(`生成时间：${formatLocalTime(new Date(), timezoneOffset)}`, { align: 'center' })
    pdfDoc.fillColor('#000000')

    pdfDoc.end()
  })

  return {
    code: 0,
    message: 'ok',
    data: {
      fileUrl: tempFileUrl,
      fileName: `${templateName}表_${order.orderNo || order._id}.pdf`
    }
  }
}

function fail(message, code) {
  return {
    code: code || 500,
    message: message || '服务异常，请稍后重试',
    data: null
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const { orderId } = event || {}

  if (!orderId) {
    return fail('缺少 orderId 参数', 400)
  }

  try {
    return await generateOrderPdf(openid, orderId)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
