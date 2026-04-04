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

  // 5. 收集日志中的 operatorId，批量查询 user_signatures 获取签字图片
  const operatorIds = [...new Set(logs.map(l => l.operatorId).filter(id => id && id !== 'system'))]
  const signatureMap = {} // operatorId -> [{ fileID }]
  if (operatorIds.length > 0) {
    for (let i = 0; i < operatorIds.length; i += 20) {
      const batch = operatorIds.slice(i, i + 20)
      const sigRes = await db.collection('user_signatures')
        .where({ _openid: db.command.in(batch) })
        .orderBy('index', 'asc')
        .get()
      sigRes.data.forEach(sig => {
        const openid = sig._openid
        if (!signatureMap[openid]) signatureMap[openid] = []
        if (sig.fileID) signatureMap[openid].push(sig.fileID)
      })
    }
  }

  // 预下载签字图片到本地临时文件
  const allFileIDs = [...new Set(Object.values(signatureMap).flat())]
  const imageTempPaths = {}
  if (allFileIDs.length > 0) {
    // 下载图片到本地 /tmp
    for (const fileID of allFileIDs) {
      try {
        const res = await cloud.downloadFile({ fileID })
        const ext = path.extname(fileID) || '.png'
        const localPath = `/tmp/sign_${fileID.replace(/[^a-zA-Z0-9]/g, '')}${ext}`
        fs.writeFileSync(localPath, res.fileContent)
        imageTempPaths[fileID] = localPath
      } catch (e) {
        console.error('下载签字图片失败:', fileID, e.message)
      }
    }
  }

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

      // 构造名称前缀（stepName 如果存在）
      const stepPrefix = log.stepName ? `${log.stepName} - ` : ''
      pdfDoc.text(`[${timeStr}] ${stepPrefix}${log.operatorName || '-'} - ${actionText}`)
      if (log.approvalComment) {
        pdfDoc.text(`  审批意见：${log.approvalComment}`)
      }

      // 签字图片（通过 operatorId 查 user_signatures）
      if (log.operatorId && signatureMap[log.operatorId]) {
        const sigFileIDs = signatureMap[log.operatorId]
        // 只嵌入第一个签字（优先使用 index 最小的）
        const firstSigFileID = sigFileIDs[0]
        if (firstSigFileID && imageTempPaths[firstSigFileID]) {
          const imgPath = imageTempPaths[firstSigFileID]
          try {
            if (fs.existsSync(imgPath)) {
              pdfDoc.image(imgPath, 70, undefined, { width: 120, height: 60 })
              pdfDoc.moveDown(0.2)
            }
          } catch (e) {
            console.error('嵌入签字图片失败:', e.message)
          }
        }
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

/**
 * 副食预订清单 PDF 导出
 * 接收 orderId（side_dish_orders._id），生成预订人员清单 PDF
 */
async function generateSideDishBookingPdf(orderId) {
  // 1. 查询征订单
  const orderRes = await db.collection('side_dish_orders').doc(orderId).get()
  if (!orderRes.data) {
    throw new Error('征订单不存在')
  }
  const order = orderRes.data

  // 2. 查询所有有效预订记录
  const bookingsRes = await db.collection('side_dish_bookings')
    .where({ orderId, status: 'booked' })
    .orderBy('createdAt', 'asc')
    .limit(200)
    .get()
  const bookings = bookingsRes.data || []

  const totalCount = bookings.reduce((sum, b) => sum + (b.count || 0), 0)

  // 3. 生成 PDF
  const fontPath = await ensureFont()

  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  })
  pdfDoc.registerFont('ChineseFont', fontPath)

  const buffers = []
  pdfDoc.on('data', buffers.push.bind(buffers))

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers)
        const fileName = `副食预订清单_${order.title}_${Date.now()}.pdf`
        const uploadResult = await cloud.uploadFile({
          cloudPath: `side_dish_pdfs/${fileName}`,
          fileContent: pdfBuffer
        })
        const tempUrl = await cloud.getTempFileURL({
          fileList: [uploadResult.fileID]
        })
        resolve({
          code: 0,
          message: 'ok',
          data: {
            fileUrl: tempUrl.fileList[0].tempFileURL,
            fileName: `副食预订清单_${order.title}.pdf`
          }
        })
      } catch (err) {
        reject(new Error('PDF上传失败: ' + err.message))
      }
    })

    pdfDoc.on('error', (err) => {
      reject(new Error('PDF生成失败: ' + err.message))
    })

    // 标题
    pdfDoc.fontSize(22).font('ChineseFont').text('副食预订清单', { align: 'center' })
    pdfDoc.moveDown(0.8)

    // 分隔线
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#2563EB')
    pdfDoc.moveDown(0.8)

    // 征订单基本信息
    pdfDoc.fontSize(13).font('ChineseFont')
    pdfDoc.text(`征订标题：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.title)
    pdfDoc.text(`创建者：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.creatorName || '-')
    pdfDoc.text(`截止日期：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.deadline)
    pdfDoc.text(`最大份数/人：`, 50, undefined, { continued: true }).font('ChineseFont').text(String(order.maxCount) + `（上限 ${order.maxCount * 2}）`)
    pdfDoc.moveDown(0.6)

    // 统计信息
    pdfDoc.fontSize(12).fillColor('#2563EB')
      .text(`预订总人数：${bookings.length} 人    预订总份数：${totalCount} 份`, { align: 'center' })
    pdfDoc.fillColor('#000000')
    pdfDoc.moveDown(0.8)

    // 表头
    const tableTop = pdfDoc.y
    const colWidths = [60, 140, 100, 100]
    const colX = [50, 110, 250, 350]

    pdfDoc.rect(50, tableTop, 495, 28).fill('#EEF2FF')
    pdfDoc.fillColor('#1E293B').fontSize(11).font('ChineseFont')

    pdfDoc.text('序号', colX[0], tableTop + 8, { width: colWidths[0], align: 'center' })
    pdfText('姓名', colX[1] + 15, tableTop + 8)
    pdfText('预订份数', colX[2] + 25, tableTop + 8)
    pdfText('提交时间', colX[3] + 20, tableTop + 8)

    function pdfText(text, x, y) {
      pdfDoc.font('ChineseFont').text(text, x, y)
    }

    pdfDoc.fillColor('#000000')
    let rowY = tableTop + 28

    // 数据行
    bookings.forEach((b, idx) => {
      if (rowY > 750) {
        pdfDoc.addPage()
        rowY = 50
      }

      // 行背景交替色
      if (idx % 2 === 0) {
        pdfDoc.rect(50, rowY, 495, 26).fill('#FAFAFA')
      }
      pdfDoc.rect(50, rowY, 495, 26).stroke('#EEEEEE')

      const timeStr = b.createdAt ? formatLocalTime(new Date(b.createdAt), -3).split(' ')[0] : '-'

      pdfDoc.fontSize(10).font('ChineseFont').fillColor('#334155')
      pdfDoc.text(String(idx + 1), colX[0], rowY + 7, { width: colWidths[0], align: 'center' })
      pdfDoc.text(b.name || '-', colX[1] + 15, rowY + 7, { width: colWidths[1] - 20 })
      pdfDoc.text(String(b.count || 0), colX[2] + 35, rowY + 7, { width: colWidths[2] - 40, align: 'center' })
      pdfDoc.text(timeStr, colX[3] + 15, rowY + 7, { width: colWidths[3] - 20 })

      rowY += 26
    })

    // 无数据提示
    if (bookings.length === 0) {
      pdfDoc.fontSize(12).fillColor('#94A3B8')
        .text('暂无预订记录', 50, rowY + 20, { align: 'center' })
      pdfDoc.fillColor('#000000')
    } else {
      rowY += 20
    }

    // 底部信息
    pdfDoc.moveDown(0.6)
    pdfDoc.moveTo(50, Math.min(rowY, 780)).lineTo(545, Math.min(rowY, 780)).stroke('#DDDDDD')
    pdfDoc.fontSize(9).fillColor('#999999')
      .text(`生成时间：${formatLocalTime(new Date(), -3)}`, { align: 'center' })
    pdfDoc.fillColor('#000000')

    pdfDoc.end()
  })
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

  const { orderId, type } = event || {}

  // 副食预订清单导出
  if (type === 'sideDishBookings') {
    if (!orderId) {
      return fail('缺少 orderId 参数', 400)
    }
    try {
      return await generateSideDishBookingPdf(orderId)
    } catch (error) {
      return fail(error.message || '生成预订清单失败', 500)
    }
  }

  // 原有工单 PDF 导出
  if (!orderId) {
    return fail('缺少 orderId 参数', 400)
  }

  try {
    return await generateOrderPdf(openid, orderId)
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
