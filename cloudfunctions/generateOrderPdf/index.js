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
const FONT_FILE_ID = 'cloud://cloud1-d2gyip4xi1fcf54bd.636c-cloud1-d2gyip4xi1fcf54bd-1390912780/fonts/SourceHanSansSC-Regular.otf'
// 粗体字（表头用）
const FONT_FILE_BOLD = path.join(FONT_DIR, 'SourceHanSansSC-Bold.otf')
const FONT_FILE_ID_BOLD = 'cloud://cloud1-d2gyip4xi1fcf54bd.636c-cloud1-d2gyip4xi1fcf54bd-1390912780/fonts/SourceHanSansSC-Bold.otf'

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
 * 确保粗体字文件已下载到本地（/tmp 缓存，同一实例只下载一次）
 * 下载失败时返回 null —— 调用方回退为常规字体，避免因字体缺失导致整个导出失败
 */
async function ensureBoldFont() {
  try {
    if (fs.existsSync(FONT_FILE_BOLD)) {
      return FONT_FILE_BOLD
    }

    if (!fs.existsSync(FONT_DIR)) {
      fs.mkdirSync(FONT_DIR, { recursive: true })
    }

    const res = await cloud.downloadFile({ fileID: FONT_FILE_ID_BOLD })
    fs.writeFileSync(FONT_FILE_BOLD, res.fileContent)
    return FONT_FILE_BOLD
  } catch (e) {
    console.warn('粗体字体下载失败，表头回退为常规字体:', e.message)
    return null
  }
}

/**
 * 格式化字段值
 * - boolean 类型显示 '是'/'否'
 * - 数组用逗号拼接
 * - null/undefined/空字符串显示 '-'
 * - 其他直接 toString
 */
function formatFieldValue(value, type) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }
  if (type === 'boolean') {
    return value ? '是' : '否'
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
      const value = formatFieldValue(businessData[fieldConfig.field], fieldConfig.type)
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
 * 支持按类别预订模式，显示每个类别的预订明细
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

  // 3. 按类别汇总统计
  const categories = order.categories || []
  const categorySummaries = []
  categories.forEach(cat => {
    let catCount = 0
    bookings.forEach(b => {
      if (b.items && Array.isArray(b.items)) {
        const item = b.items.find(i => i.categoryId === cat.id)
        if (item) catCount += item.count
      }
    })
    categorySummaries.push({
      categoryId: cat.id,
      categoryName: cat.name,
      count: catCount,
      maxCount: cat.maxCount
    })
  })

  // 4. 读取时区配置
  const timezoneOffset = await getTimezoneOffset()

  // 5. 生成 PDF
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

    // 辅助函数：在指定位置写文本
    function pdfText(text, x, y) {
      pdfDoc.font('ChineseFont').text(text, x, y)
    }

    // ===== 标题 =====
    pdfDoc.fontSize(22).font('ChineseFont').text('副食预订清单', { align: 'center' })
    pdfDoc.moveDown(0.8)

    // 分隔线
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#2563EB')
    pdfDoc.moveDown(0.8)

    // ===== 征订单基本信息 =====
    pdfDoc.fontSize(13).font('ChineseFont')
    pdfDoc.text(`征订标题：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.title)
    pdfDoc.text(`创建者：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.creatorName || '-')
    pdfDoc.text(`截止日期：`, 50, undefined, { continued: true }).font('ChineseFont').text(order.deadline)

    // 副食类别（按类别列出）
    pdfDoc.text(`副食类别：`, 50, undefined, { continued: true })
    if (categories.length > 0) {
      const catDesc = categories.map(c => `${c.name}（上限${c.maxCount}份/人）`).join('、')
      pdfDoc.font('ChineseFont').text(catDesc)
    } else {
      pdfDoc.font('ChineseFont').text('-')
    }
    pdfDoc.moveDown(0.6)

    // ===== 统计信息 =====
    pdfDoc.fontSize(12).fillColor('#2563EB')
      .text(`预订总人数：${bookings.length} 人    预订总份数：${totalCount} 份`, { align: 'center' })
    pdfDoc.fillColor('#000000')
    pdfDoc.moveDown(0.5)

    // 按类别统计
    if (categorySummaries.length > 0) {
      pdfDoc.fontSize(11).fillColor('#475569')
      const catSummaryText = categorySummaries.map(c => `${c.categoryName}：${c.count} 份`).join('    ')
      pdfDoc.text(catSummaryText, { align: 'center' })
      pdfDoc.fillColor('#000000')
    }
    pdfDoc.moveDown(0.8)

    // ===== 预订明细表格 =====
    // 根据类别数量决定列布局
    const hasCategoryItems = categories.length > 0 && bookings.some(b => b.items && b.items.length > 0)

    if (hasCategoryItems) {
      // 有类别模式：序号 | 姓名 | 各类别份数 | 合计 | 提交时间
      const catColCount = categories.length
      // 计算各类别列宽（A4 可用宽度 495，序号50+姓名80+合计50+时间80=260，剩余给类别列）
      const fixedWidth = 50 + 80 + 50 + 80 // 260
      const remainingWidth = 495 - fixedWidth
      const catColWidth = Math.max(50, Math.floor(remainingWidth / catColCount))

      const colX = [50]
      let xPos = 50
      // 序号列
      xPos += 50
      // 姓名列
      colX.push(xPos)
      xPos += 80
      // 各类别列
      for (let i = 0; i < catColCount; i++) {
        colX.push(xPos)
        xPos += catColWidth
      }
      // 合计列
      colX.push(xPos)
      xPos += 50
      // 时间列
      colX.push(xPos)

      // 表头
      const tableTop = pdfDoc.y
      pdfDoc.rect(50, tableTop, 495, 28).fill('#EEF2FF')
      pdfDoc.fillColor('#1E293B').fontSize(9).font('ChineseFont')

      pdfDoc.text('序号', colX[0], tableTop + 8, { width: 50, align: 'center' })
      pdfDoc.text('姓名', colX[1], tableTop + 8, { width: 80, align: 'center' })
      categories.forEach((cat, ci) => {
        pdfDoc.text(cat.name, colX[2 + ci], tableTop + 8, { width: catColWidth, align: 'center' })
      })
      pdfDoc.text('合计', colX[2 + catColCount], tableTop + 8, { width: 50, align: 'center' })
      pdfDoc.text('提交时间', colX[2 + catColCount + 1], tableTop + 8, { width: 80, align: 'center' })

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

        const timeStr = b.createdAt ? formatLocalTime(new Date(b.createdAt), timezoneOffset).split(' ')[0] : '-'

        pdfDoc.fontSize(9).font('ChineseFont').fillColor('#334155')
        pdfDoc.text(String(idx + 1), colX[0], rowY + 8, { width: 50, align: 'center' })
        pdfDoc.text(b.name || '-', colX[1], rowY + 8, { width: 80, align: 'center' })

        // 各类别份数
        categories.forEach((cat, ci) => {
          let catCount = 0
          if (b.items && Array.isArray(b.items)) {
            const item = b.items.find(i => i.categoryId === cat.id)
            if (item) catCount = item.count
          }
          pdfDoc.text(String(catCount), colX[2 + ci], rowY + 8, { width: catColWidth, align: 'center' })
        })

        pdfDoc.text(String(b.count || 0), colX[2 + catColCount], rowY + 8, { width: 50, align: 'center' })
        pdfDoc.text(timeStr, colX[2 + catColCount + 1], rowY + 8, { width: 80, align: 'center' })

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
      // 修改后：
      pdfDoc.fontSize(9).fillColor('#999999')
        .text(`生成时间：${formatLocalTime(new Date(), timezoneOffset)}`, 50, undefined, { width: 495, align: 'center' })
      pdfDoc.fillColor('#000000')
    } else {
      // 无类别模式（兼容旧数据）：序号 | 姓名 | 预订份数 | 提交时间
      const tableTop = pdfDoc.y
      const colWidths = [60, 140, 100, 100]
      const colX = [50, 110, 250, 350]

      pdfDoc.rect(50, tableTop, 495, 28).fill('#EEF2FF')
      pdfDoc.fillColor('#1E293B').fontSize(11).font('ChineseFont')

      pdfDoc.text('序号', colX[0], tableTop + 8, { width: colWidths[0], align: 'center' })
      pdfText('姓名', colX[1] + 15, tableTop + 8)
      pdfText('预订份数', colX[2] + 25, tableTop + 8)
      pdfText('提交时间', colX[3] + 20, tableTop + 8)

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

        const timeStr = b.createdAt ? formatLocalTime(new Date(b.createdAt), timezoneOffset).split(' ')[0] : '-'

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
      // 修改后：
      pdfDoc.fontSize(9).fillColor('#999999')
        .text(`生成时间：${formatLocalTime(new Date(), timezoneOffset)}`, 50, undefined, { width: 495, align: 'center' })
      pdfDoc.fillColor('#000000')
    }

    pdfDoc.end()
  })
}

/**
 * 副食清单分组名（与前端 form-submissions.buildDeptGroupKey 规则一致，改一处必须同步另一处）
 * - 部门为「无」（可选领导的馆员）→ 空组名，置顶
 * - 待赴任馆员 → 各部门之后；角色「其他」→「其他人员」置底
 */
function buildDeptGroupName(sub) {
  const department = sub.department || ''
  const role = sub.role || ''
  if (department === '无') return ''
  if (role === '待赴任馆员') return '待赴任馆员'
  if (role === '其他') return '其他人员'
  return department || '未分配部门'
}

/**
 * 馆内动态系统 - 副食订购汇总清单 PDF 导出
 * 接收 formId（content_forms._id），从 blocks 中取 side_dish 块及 categories，
 * 从 content_form_submissions 的 answers 中汇总每人预订份数，生成表格 PDF。
 * sortMode / groupOrder 由页面传入，用于让导出顺序与页面当前显示一致：
 * - sortMode='department'：按 groupOrder（页面上组的先后）分组，组内按提交时间正序
 * - 其它（含默认）：按提交时间正序
 */
async function generateContentFormSideDishPdf(formId, sortMode, groupOrder) {
  // 1. 查询表单
  const formRes = await db.collection('content_forms').doc(formId).get()
  if (!formRes.data) {
    throw new Error('表单不存在')
  }
  const form = formRes.data

  // 取副食控件（多个时取第一个）
  const sideDishBlock = (form.blocks || []).find(b => b.type === 'side_dish')
  if (!sideDishBlock) {
    throw new Error('该表单不含副食控件')
  }
  const categories = sideDishBlock.categories || []
  const blockId = sideDishBlock.id

  // 2. 查询提交记录
  const subsRes = await db.collection('content_form_submissions')
    .where({ formId })
    .orderBy('submittedAt', 'asc')
    .limit(1000)
    .get()
  const submissions = subsRes.data || []

  // 提取每人的副食预订
  const bookings = submissions.map(s => {
    const answer = (s.answers || []).find(a => a.blockId === blockId)
    const items = (answer && Array.isArray(answer.value)) ? answer.value : []
    const count = items.reduce((sum, i) => sum + (Number(i.count) || 0), 0)
    return {
      name: s.userName || '匿名',
      items,
      count,
      createdAt: s.submittedAt,
      // 分组名：规则与前端 form-submissions.buildDeptGroupKey 一致
      groupName: buildDeptGroupName(s)
    }
  }).filter(b => b.items.length > 0)

  // 排序：与页面当前显示保持一致
  // - 按部门分组：组序取前端传入的 groupOrder（页面上的组先后），组内按提交时间正序
  // - 其它：按提交时间正序（与原来的默认行为一致）
  const deptRank = new Map()
  ;(Array.isArray(groupOrder) ? groupOrder : []).forEach((name, i) => deptRank.set(name, i))
  const rankOf = name => (deptRank.has(name) ? deptRank.get(name) : Number.MAX_SAFE_INTEGER)
  const byTimeAsc = (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  if (sortMode === 'department') {
    bookings.sort((a, b) => {
      const ra = rankOf(a.groupName)
      const rb = rankOf(b.groupName)
      if (ra !== rb) return ra - rb
      return byTimeAsc(a, b)
    })
  } else {
    bookings.sort(byTimeAsc)
  }

  // 各组人数（用于组标题行）
  const groupCounts = {}
  bookings.forEach(b => {
    groupCounts[b.groupName] = (groupCounts[b.groupName] || 0) + 1
  })

  const totalCount = bookings.reduce((sum, b) => sum + b.count, 0)

  // 按类别汇总
  const categorySummaries = categories.map(cat => {
    let catCount = 0
    bookings.forEach(b => {
      const item = b.items.find(i => i.categoryId === cat.id)
      if (item) catCount += Number(item.count) || 0
    })
    return { categoryId: cat.id, categoryName: cat.name, count: catCount, maxCount: cat.maxCount }
  })

  // 3. 读取时区配置
  const timezoneOffset = await getTimezoneOffset()

  // 4. 生成 PDF
  const fontPath = await ensureFont()
  const boldFontPath = await ensureBoldFont()

  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true // 需要在全部页面生成完后回填页码（每页底部「第X页」）
  })
  pdfDoc.registerFont('ChineseFont', fontPath)
  // 粗体缺失时回退常规字体，保证导出不失败
  pdfDoc.registerFont('ChineseFontBold', boldFontPath || fontPath)

  const buffers = []
  pdfDoc.on('data', buffers.push.bind(buffers))

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers)
        const fileName = `副食订购清单_${form.title}_${Date.now()}.pdf`
        const uploadResult = await cloud.uploadFile({
          cloudPath: `content_form_pdfs/${fileName}`,
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
            fileName: `副食订购清单_${form.title}.pdf`
          }
        })
      } catch (err) {
        reject(new Error('PDF上传失败: ' + err.message))
      }
    })

    pdfDoc.on('error', (err) => {
      reject(new Error('PDF生成失败: ' + err.message))
    })

    // ===== 标题 =====
    pdfDoc.fontSize(22).font('ChineseFont').text('副食订购清单', { align: 'center' })
    pdfDoc.moveDown(0.8)

    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#2563EB')
    pdfDoc.moveDown(0.8)

    // ===== 基本信息 =====
    pdfDoc.fontSize(13).font('ChineseFont')
    pdfDoc.text(`标题：`, 50, undefined, { continued: true }).text(form.title)
    pdfDoc.text(`发布者：`, 50, undefined, { continued: true }).text(form.createdByName || '-')
    if (form.deadline) {
      pdfDoc.text(`截止时间：`, 50, undefined, { continued: true })
        .text(formatLocalTime(new Date(form.deadline), timezoneOffset))
    }
    pdfDoc.text(`副食类别：`, 50, undefined, { continued: true })
    if (categories.length > 0) {
      pdfDoc.text(categories.map(c => `${c.name}（上限${c.maxCount}份/人）`).join('、'))
    } else {
      pdfDoc.text('-')
    }
    pdfDoc.moveDown(0.6)

    // ===== 统计信息 =====
    pdfDoc.fontSize(12).fillColor('#2563EB')
      .text(`预订总人数：${bookings.length} 人    预订总份数：${totalCount} 份`, { align: 'center' })
    pdfDoc.fillColor('#000000')
    pdfDoc.moveDown(0.5)

    if (categorySummaries.length > 0) {
      pdfDoc.fontSize(11).fillColor('#475569')
      const catSummaryText = categorySummaries.map(c => `${c.categoryName}：${c.count} 份`).join('    ')
      pdfDoc.text(catSummaryText, { align: 'center' })
      pdfDoc.fillColor('#000000')
    }
    pdfDoc.moveDown(0.8)

    // ===== 明细表格 =====
    if (categories.length > 0) {
      // 有类别模式：序号 | 姓名 | 各类别份数 | 合计 | 提交时间 | 签收
      // 列宽集中定义，表头与行内渲染共用同一组常量，避免错列
      const catColCount = categories.length
      const COL_W = { index: 50, name: 80, total: 50, time: 76, sign: 46 }
      const fixedWidth = COL_W.index + COL_W.name + COL_W.total + COL_W.time + COL_W.sign
      const remainingWidth = 495 - fixedWidth
      const catColWidth = Math.max(36, Math.floor(remainingWidth / catColCount))

      const colX = [50]
      let xPos = 50
      xPos += COL_W.index
      colX.push(xPos)              // 姓名
      xPos += COL_W.name
      for (let i = 0; i < catColCount; i++) {
        colX.push(xPos)            // 各副食类别
        xPos += catColWidth
      }
      colX.push(xPos)              // 合计
      xPos += COL_W.total
      colX.push(xPos)              // 提交时间
      xPos += COL_W.time
      colX.push(xPos)              // 签收

      const HEADER_H = 28

      /**
       * 绘制表头（首屏与每个新页都调用），返回表头下方的起始 y
       * 使用粗体字库 SourceHanSansSC-Bold，不再用偏移重绘模拟加粗
       */
      const drawTableHeader = (y) => {
        // 表头底：淡绿（与部门分组标题的淡蓝 #EEF2FF 区分）
        pdfDoc.rect(50, y, 495, HEADER_H).fill('#DCFCE7')
        pdfDoc.fillColor('#1E293B').fontSize(11).font('ChineseFontBold')
        pdfDoc.text('序号', colX[0], y + 7, { width: COL_W.index, align: 'center', lineBreak: false })
        pdfDoc.text('姓名', colX[1], y + 7, { width: COL_W.name, align: 'center', lineBreak: false })
        categories.forEach((cat, ci) => {
          pdfDoc.text(cat.name, colX[2 + ci], y + 7, { width: catColWidth, align: 'center', lineBreak: false })
        })
        pdfDoc.text('合计', colX[2 + catColCount], y + 7, { width: COL_W.total, align: 'center', lineBreak: false })
        pdfDoc.text('提交时间', colX[3 + catColCount], y + 7, { width: COL_W.time, align: 'center', lineBreak: false })
        pdfDoc.text('签收', colX[4 + catColCount], y + 7, { width: COL_W.sign, align: 'center', lineBreak: false })
        // 表头下方加深色分割线，与数据行分开。
        // 注意上移 1pt：首行的浅灰边框（#EEEEEE，1pt）正好画在 y+HEADER_H 这条共用边上，
        // 且晚于本行绘制会把它覆盖，所以深色线画在边界内侧一点点。
        // 画完把线宽还原，否则后续表格细线与签收方框也会变粗。
        pdfDoc.lineWidth(1.2).moveTo(50, y + HEADER_H - 1).lineTo(545, y + HEADER_H - 1).stroke('#334155')
        pdfDoc.lineWidth(1)
        pdfDoc.fillColor('#000000')
        return y + HEADER_H
      }

      let rowY = drawTableHeader(pdfDoc.y)
      let currentGroup = null

      bookings.forEach((b, idx) => {
        // 按部门分组导出：组变化时插入组标题行；标题不留页底（至少给它带一行数据的空间）
        if (sortMode === 'department' && b.groupName !== currentGroup) {
          currentGroup = b.groupName
          if (rowY + 26 * 2 > 780) {
            pdfDoc.addPage()
            rowY = drawTableHeader(50) // 新页顶部重复表头
          }
          // 分组标题：淡蓝底 + 粗体（与淡绿底的表头区分）
          pdfDoc.rect(50, rowY, 495, 26).fill('#EEF2FF')
          pdfDoc.fontSize(9).font('ChineseFontBold').fillColor('#1E293B')
            .text(`${currentGroup || '（部门无）'}（${groupCounts[currentGroup] || 0} 人）`, 60, rowY + 8)
          pdfDoc.fillColor('#000000')
          rowY += 26
        }
        if (rowY > 750) {
          pdfDoc.addPage()
          rowY = drawTableHeader(50) // 新页顶部重复表头
        }
        if (idx % 2 === 0) {
          pdfDoc.rect(50, rowY, 495, 26).fill('#FAFAFA')
        }
        pdfDoc.rect(50, rowY, 495, 26).stroke('#EEEEEE')

        // 提交时间精确到分：formatLocalTime 返回 'YYYY/MM/DD HH:mm:ss'，取前 16 位即到「时:分」
        const timeStr = b.createdAt
          ? formatLocalTime(new Date(b.createdAt), timezoneOffset).slice(0, 16)
          : '-'

        pdfDoc.fontSize(9).font('ChineseFont').fillColor('#334155')
        pdfDoc.text(String(idx + 1), colX[0], rowY + 8, { width: COL_W.index, align: 'center' })
        pdfDoc.text(b.name || '-', colX[1], rowY + 8, { width: COL_W.name, align: 'center' })

        categories.forEach((cat, ci) => {
          let catCount = 0
          const item = b.items.find(i => i.categoryId === cat.id)
          if (item) catCount = Number(item.count) || 0
          pdfDoc.text(`${catCount}份`, colX[2 + ci], rowY + 8, { width: catColWidth, align: 'center' })
        })

        pdfDoc.text(`${b.count}份`, colX[2 + catColCount], rowY + 8, { width: COL_W.total, align: 'center' })
        pdfDoc.text(timeStr, colX[3 + catColCount], rowY + 8, { width: COL_W.time, align: 'center' })

        // 签收栏：每行画一个 12×12 空方框（行高 26，垂直居中），供现场手写勾选
        pdfDoc.rect(colX[4 + catColCount] + (COL_W.sign - 12) / 2, rowY + 7, 12, 12).stroke('#64748B')

        rowY += 26
      })

      if (bookings.length === 0) {
        pdfDoc.fontSize(12).fillColor('#94A3B8')
          .text('暂无预订记录', 50, rowY + 20, { align: 'center' })
        pdfDoc.fillColor('#000000')
      } else {
        rowY += 20
      }

      pdfDoc.moveDown(0.6)
      pdfDoc.moveTo(50, Math.min(rowY, 780)).lineTo(545, Math.min(rowY, 780)).stroke('#DDDDDD')
      pdfDoc.fontSize(9).fillColor('#999999')
        .text(`生成时间：${formatLocalTime(new Date(), timezoneOffset)}`, 50, undefined, { width: 495, align: 'center' })
      pdfDoc.fillColor('#000000')
    } else {
      // 无类别兜底（理论上副食控件必有类别）
      pdfDoc.fontSize(12).fillColor('#94A3B8')
        .text('该表单未配置副食类别', { align: 'center' })
      pdfDoc.fillColor('#000000')
    }

    // ===== 页码：每页底部居中「第X页」 =====
    // bufferPages 模式下可在收尾前回填到每一页。
    // 页码要落在下边距之外（内容区下方），先临时把该页下边距设为 0：
    // pdfkit 的防孤行检查在每次 text() 时才读取 page.maxY()，
    // 不放开会导致它判定「超出页面」而插入新页（页码反而跑到下一页）。
    const pageRange = pdfDoc.bufferedPageRange()
    for (let i = 0; i < pageRange.count; i++) {
      pdfDoc.switchToPage(pageRange.start + i)
      const bottomMargin = pdfDoc.page.margins.bottom
      pdfDoc.page.margins.bottom = 0
      pdfDoc.fontSize(9).font('ChineseFont').fillColor('#94A3B8')
        .text(`第${i + 1}页`, 50, 800, { width: 495, align: 'center', lineBreak: false })
      pdfDoc.page.margins.bottom = bottomMargin
    }

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

// ===== 菜单评分导出 =====
// 从菜单富文本内容提取菜品名（与前端 menu-detail.js extractDishesFromContent 保持一致）
function extractDishesFromContent(content) {
  if (!content) return []
  const SINGLE_CHAR_CATEGORIES = new Set(['汤', '粥', '饭', '面', '粉'])
  const STOP_WORDS = new Set([
    '菜单', '今日菜单', '本周菜单', '午餐', '晚餐', '早餐',
    '主食', '副菜', '汤类', '甜品', '饮品', '凉菜', '热菜',
    '荤菜', '素菜', '推荐', '特别推荐', '厨师推荐',
    '备注', '说明', '注意', '温馨提示'
  ])
  const DATE_PATTERN = /星期[一二三四五六日天]|周[一二三四五六日天]/
  let text = content.replace(/<\/?(?:p|div|section|article|h[1-6]|li|tr)[^>]*>/gi, '\n')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<[^>]+>/g, '')
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  text = text.replace(/[（(]/g, ' ').replace(/[）)]/g, ' ')
  const tokens = text.split(/[\n\r\s：:]+/).map(t => t.trim()).filter(Boolean)
  const dishes = []
  const seen = new Set()
  tokens.forEach(token => {
    if (token.length < 2 || token.length > 20) return
    if (DATE_PATTERN.test(token)) return
    if (/^[\d\-+*.=!@#$%^&()]+$/.test(token)) return
    if (STOP_WORDS.has(token)) return
    if (!/[\u4e00-\u9fa5]/.test(token)) return
    const cleanToken = token.replace(/^[•·\-\*\.\s:：]+/, '').replace(/[•·\-\*\.\s:：]+$/, '')
    if (!cleanToken || cleanToken.length < 2 || cleanToken.length > 20) return
    if (DATE_PATTERN.test(cleanToken)) return
    if (SINGLE_CHAR_CATEGORIES.has(cleanToken)) return
    if (!seen.has(cleanToken)) { seen.add(cleanToken); dishes.push(cleanToken) }
  })
  return dishes
}

// 菜单评分统计口径（集中在此，便于调整）
const RATING_MIN_COUNT = 3   // 进入排名所需的最小评价人数（避免「1 人打 5 分」霸榜）
const RATING_TOP_SCORE = 4.7 // 最受欢迎：均分 ≥ 此值
const RATING_LOW_SCORE = 3.5 // 最不受欢迎：均分 ≤ 此值
const RATING_POLAR_RANGE = 3 // 评价最两极分化：最高分 − 最低分 ≥ 此值
const RATING_AGG_LIMIT = 5000 // 聚合分组结果上限（菜单数 × 菜品数，远小于此值）

/**
 * 菜单评分汇总 PDF 导出
 * 权限：管理员 / 领导（馆员+部门无，排除限制权限）/ 办部门负责人 /
 *       岗位含「办公室内聘」或「后勤管理」
 * 内容：① 统计汇总（跨菜单按菜品合并：最受欢迎 / 最不受欢迎 / 评价最两极分化）
 *       ② 按选中菜单分组，组内菜品按平均分降序，无评分菜品标注【无人评分】
 */
async function generateMenuRatingsPdf(openid, menuIds) {
  const _ = db.command
  const $ = db.command.aggregate

  // 1. 权限校验
  const userRes = await db.collection('office_users').where({ openid, status: 'approved' }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('无导出权限')
  }
  const u = userRes.data[0]
  const positions = Array.isArray(u.position) ? u.position : []
  const isLeader = u.role === '馆员' && u.department === '无' && !u.isRestrictedLeader
  const isBanHead = u.role === '馆员' && u.department === '办' && u.isDepartmentHead
  const isOfficeServant = positions.includes('办公室内聘')
  const isLogistics = positions.includes('后勤管理')
  if (!u.isAdmin && !isLeader && !isBanHead && !isOfficeServant && !isLogistics) {
    throw new Error('无导出权限')
  }

  // 2. 查菜单
  const menusRes = await db.collection('menus').where({ _id: _.in(menuIds) }).limit(100).get()
  // 按创建时间降序（最近的菜单在前）
  const menus = (menusRes.data || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  if (menus.length === 0) {
    throw new Error('菜单不存在')
  }

  // 3. 聚合查评分：在数据库侧按「菜单 + 菜品」分组
  // 原实现用 .limit(1000).get() 拉明细，所选菜单评分总数超过 1000 时会被静默截断，
  // 导致均分与统计同时失真。聚合的输入上限为 1 万条，且返回的只是分组行，仍然是 1 次数据库读。
  const aggRes = await db.collection('menu_ratings')
    .aggregate()
    .match({ menuId: _.in(menuIds) })
    .group({
      _id: { menuId: '$menuId', dishName: '$dishName' },
      sum: $.sum('$score'),
      count: $.sum(1),
      // 1~5 分各档人数（与 menuManager.getRatings 同款写法），用于精确算出方差与分数区间
      c1: $.sum($.cond({ if: $.eq(['$score', 1]), then: 1, else: 0 })),
      c2: $.sum($.cond({ if: $.eq(['$score', 2]), then: 1, else: 0 })),
      c3: $.sum($.cond({ if: $.eq(['$score', 3]), then: 1, else: 0 })),
      c4: $.sum($.cond({ if: $.eq(['$score', 4]), then: 1, else: 0 })),
      c5: $.sum($.cond({ if: $.eq(['$score', 5]), then: 1, else: 0 }))
    })
    .limit(RATING_AGG_LIMIT)
    .end()
  const ratingRows = (aggRes && aggRes.list) || []

  // ratingMap 供分组明细使用：menuId -> { dishName -> { sum, count } }
  const ratingMap = {}
  let totalRatingCount = 0
  ratingRows.forEach(r => {
    const key = r._id || {}
    if (!key.menuId || !key.dishName) return
    totalRatingCount += r.count || 0
    if (!ratingMap[key.menuId]) ratingMap[key.menuId] = {}
    ratingMap[key.menuId][key.dishName] = { sum: r.sum || 0, count: r.count || 0 }
  })

  // 4. 按菜单分组：有评分菜品（按均分降序）在前，无评分菜品在后
  const validDishNames = new Set() // 出现在所选菜单里的全部菜名（用于过滤历史遗留菜名）
  const groups = menus.map(m => {
    const allDishes = extractDishesFromContent(m.content)
    allDishes.forEach(d => validDishNames.add(d))
    const rmap = ratingMap[m._id] || {}
    const withScore = []
    const noScore = []
    allDishes.forEach(d => {
      if (rmap[d]) {
        withScore.push({ dishName: d, avg: (rmap[d].sum / rmap[d].count).toFixed(2), count: rmap[d].count })
      } else {
        noScore.push({ dishName: d })
      }
    })
    withScore.sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
    return { title: m.title || '未命名菜单', dishes: [...withScore, ...noScore] }
  })

  // 5. 统计汇总：跨菜单按菜品名合并，只统计出现在所选菜单里的菜品
  const dishStats = {}
  ratingRows.forEach(r => {
    const key = r._id || {}
    if (!key.dishName || !validDishNames.has(key.dishName)) return
    if (!dishStats[key.dishName]) {
      dishStats[key.dishName] = { dishName: key.dishName, sum: 0, count: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 }
    }
    const s = dishStats[key.dishName]
    s.sum += r.sum || 0
    s.count += r.count || 0
    s.c1 += r.c1 || 0
    s.c2 += r.c2 || 0
    s.c3 += r.c3 || 0
    s.c4 += r.c4 || 0
    s.c5 += r.c5 || 0
  })

  const stats = Object.values(dishStats).map(s => {
    const avg = s.count > 0 ? s.sum / s.count : 0
    // 由 1~5 分分布精确算出方差：E(x²) − E(x)²
    const sqSum = 1 * s.c1 + 4 * s.c2 + 9 * s.c3 + 16 * s.c4 + 25 * s.c5
    const variance = s.count > 0 ? Math.max(sqSum / s.count - avg * avg, 0) : 0
    // 分数区间由分布直接得出（首档非零为最低分，末档非零为最高分）
    let minScore = 0
    let maxScore = 0
    ;[s.c1, s.c2, s.c3, s.c4, s.c5].forEach((c, i) => {
      if (c > 0) {
        if (minScore === 0) minScore = i + 1
        maxScore = i + 1
      }
    })
    return {
      dishName: s.dishName,
      count: s.count,
      avg,
      variance,
      std: Math.sqrt(variance),
      minScore,
      maxScore,
      c1: s.c1, // 1 分人数（用于展示极端评分构成）
      c5: s.c5  // 5 分人数
    }
  })

  // 样本量不足的菜品不参与排名
  const eligible = stats.filter(s => s.count >= RATING_MIN_COUNT)
  const topDishes = eligible
    .filter(s => s.avg >= RATING_TOP_SCORE)
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
  const lowDishes = eligible
    .filter(s => s.avg <= RATING_LOW_SCORE)
    .sort((a, b) => a.avg - b.avg || b.count - a.count)
  const polarDishes = eligible
    .filter(s => (s.maxScore - s.minScore) >= RATING_POLAR_RANGE)
    .sort((a, b) => b.variance - a.variance)
  const summary = {
    menuCount: menus.length,
    ratingCount: totalRatingCount,
    dishCount: stats.length,
    topDishes,
    lowDishes,
    polarDishes
  }

  // 6. 生成 PDF
  const fontPath = await ensureFont()
  const pdfDoc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
  pdfDoc.registerFont('ChineseFont', fontPath)
  const buffers = []
  pdfDoc.on('data', buffers.push.bind(buffers))

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers)
        const fileName = `菜单评分汇总_${Date.now()}.pdf`
        const uploadResult = await cloud.uploadFile({
          cloudPath: `menu_ratings_pdfs/${fileName}`,
          fileContent: pdfBuffer
        })
        resolve({ code: 0, message: 'ok', data: { fileID: uploadResult.fileID } })
      } catch (err) {
        reject(new Error('PDF上传失败: ' + err.message))
      }
    })
    pdfDoc.on('error', (err) => reject(new Error('PDF生成失败: ' + err.message)))

    const ROW_HEIGHT = 16 // 每行占位高度（与下方 rowY 的推进值一致）

    /**
     * 渲染每一行之前调用：设定字号，并确保整行能放进本页，必要时先换页。
     *
     * 为什么不能写成 `if (pdfDoc.y > 780) pdfDoc.addPage()`：
     * pdfkit 的 LineWrapper 在每次 text() 内部还有一道「防孤行」检查（pdfkit 0.13 wrap()）：
     *   document.y + currentLineHeight(true) > page.maxY()  → 自动插页，并把 y 重置到上边距
     * 而一行「菜名 + 分数」是两个绝对坐标的 text() 拼出来的，中间不会推进 pdfDoc.y。
     * 一旦第一列在贴底处触发了 pdfkit 的内部插页：菜名落到新页顶部，
     * 第二列仍用旧的绝对 y，又会被再次插页推到再下一页 —— 即「一页只有 1 个菜名、
     * 下一页只有 1 个分数、再下一页恢复正常」的成因。
     * A4 的 page.maxY() = 841.89 - 50(下边距) = 791.89，旧阈值 780 只留了不到一行的高度，
     * 行高（当前字体下约 12~15）稍大就会踩线。改为用 pdfkit 自己的行高判断并留 4pt 余量。
     */
    const prepareRow = (fontSize = 11) => {
      pdfDoc.fontSize(fontSize).font('ChineseFont')
      const lineHeight = Math.max(pdfDoc.currentLineHeight(true), ROW_HEIGHT)
      if (pdfDoc.y + lineHeight + 4 > pdfDoc.page.maxY()) {
        pdfDoc.addPage()
      }
    }

    /**
     * 分数列字号自适应：文字宽度超过列宽时逐档减小字号（11 → 8.5，每档 0.5）。
     * 绝不允许折行 —— 一行「菜名 + 分数」是绝对坐标定位的，
     * 折行会让两列错开（若再叠加 pdfkit 的内部插页，就会出现整行被拆到两页）。
     */
    const fitScoreFontSize = (text, maxWidth) => {
      let size = 11
      pdfDoc.fontSize(size)
      while (size > 8.5 && pdfDoc.widthOfString(text) > maxWidth) {
        size -= 0.5
        pdfDoc.fontSize(size)
      }
      return size
    }

    // 标题
    pdfDoc.fontSize(22).font('ChineseFont').fillColor('#1E293B').text('菜单评分汇总', { align: 'center' })
    pdfDoc.moveDown(0.6)
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#2563EB')
    pdfDoc.moveDown(0.6)
    const timeStr = new Date().toLocaleString('zh-CN', { timeZone: 'America/Sao_Paulo' })
    pdfDoc.fontSize(10).font('ChineseFont').fillColor('#94A3B8').text(`生成时间：${timeStr}`, { align: 'right' })
    pdfDoc.moveDown(0.4)
    pdfDoc.fontSize(10).font('ChineseFont').fillColor('#94A3B8').text(
      `统计范围：${summary.menuCount} 个菜单 · ${summary.ratingCount} 条评分 · ${summary.dishCount} 道菜品`
      + `（跨菜单按菜品合并，每道菜至少 ${RATING_MIN_COUNT} 人评价才参与排名）`,
      { align: 'right' }
    )
    pdfDoc.moveDown(1)

    // ===== 统计汇总（跨菜单按菜品合并，置于具体评分之前）=====
    if (summary.ratingCount === 0) {
      pdfDoc.fontSize(11).font('ChineseFont').fillColor('#94A3B8').text('所选菜单暂无评分数据', 60)
      pdfDoc.moveDown(0.8)
    } else {
      // 与下方菜品行同一套双列定位（名称 x=60、分数默认 x=340），保证全篇排版一致。
      // scoreX 可按内容宽度调整：两极分化那段的括号文字明显更长，需要更宽的分数列。
      const drawStatSection = (heading, rows, scoreColor, formatScore, scoreX = 340) => {
        const nameWidth = scoreX - 70   // 菜名列宽（与分数列留 10pt 间隙）
        const scoreWidth = 545 - scoreX // 分数列宽（到右边距为止）
        if (pdfDoc.y > 700) pdfDoc.addPage() // 避免小标题与内容被拆到两页
        pdfDoc.fontSize(13).font('ChineseFont').fillColor('#1E293B').text(`■ ${heading}`, 50)
        pdfDoc.moveDown(0.3)
        if (rows.length === 0) {
          pdfDoc.fontSize(10).font('ChineseFont').fillColor('#94A3B8').text('无符合条件的菜品', 60)
          pdfDoc.moveDown(0.5)
          return
        }
        rows.forEach((s, i) => {
          prepareRow()
          const rowY = pdfDoc.y
          pdfDoc.fillColor('#334155')
          pdfDoc.text(`${i + 1}. ${s.dishName}`, 60, rowY, { width: nameWidth, ellipsis: true, lineBreak: false })
          const scoreText = formatScore(s)
          pdfDoc.fontSize(fitScoreFontSize(scoreText, scoreWidth))
          pdfDoc.fillColor(scoreColor)
          pdfDoc.text(scoreText, scoreX, rowY, { width: scoreWidth, lineBreak: false })
          pdfDoc.y = rowY + ROW_HEIGHT
        })
        pdfDoc.moveDown(0.5)
      }

      drawStatSection(
        `最受欢迎（均分 ≥ ${RATING_TOP_SCORE}）`,
        summary.topDishes,
        '#2563EB',
        s => `${s.avg.toFixed(2)}（${s.count}人评）`
      )
      drawStatSection(
        `最不受欢迎（均分 ≤ ${RATING_LOW_SCORE}）`,
        summary.lowDishes,
        '#64748B',
        s => `${s.avg.toFixed(2)}（${s.count}人评）`
      )
      drawStatSection(
        `评价最两极分化（均分±标准差；按方差降序，最高分-最低分 ≥ ${RATING_POLAR_RANGE}）`,
        summary.polarDishes,
        '#EA580C',
        s => {
          // 括号内说明极端评分的构成；为 0 的档位不展示，避免「0人评1分」这类噪声
          const parts = []
          if (s.c5 > 0) parts.push(`${s.c5}人评5分`)
          if (s.c1 > 0) parts.push(`${s.c1}人评1分`)
          return `${s.avg.toFixed(2)}±${s.std.toFixed(2)}（${s.count}人评，其中${parts.join('、')}）`
        },
        270 // 该段括号文字实测约 248pt，分数列起点需左移（列宽 275pt）
      )
    }

    // 统计与明细之间的分隔线
    if (pdfDoc.y > 760) pdfDoc.addPage()
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#E2E8F0')
    pdfDoc.moveDown(0.8)

    // 每个菜单一组
    groups.forEach(g => {
      pdfDoc.fontSize(14).font('ChineseFont').fillColor('#1E293B').text(`【${g.title}】`, 50)
      pdfDoc.moveDown(0.4)
      if (g.dishes.length === 0) {
        pdfDoc.fontSize(11).fillColor('#94A3B8').text('该菜单未提取到菜品', 60)
        pdfDoc.moveDown(0.5)
      } else {
        // 菜品名左对齐（x=60，宽 300，超长截断），分数固定从 x=370 开始（页面中间位置，纵向对齐）
        g.dishes.forEach(d => {
          prepareRow()
          const rowY = pdfDoc.y
          const scoreText = d.count ? `${d.avg}（${d.count}人评）` : '无人评分'
          pdfDoc.fillColor(d.count ? '#334155' : '#94A3B8')
          pdfDoc.text(d.dishName, 60, rowY, { width: 300, ellipsis: true, lineBreak: false })
          pdfDoc.text(scoreText, 370, rowY, { width: 175, lineBreak: false })
          pdfDoc.y = rowY + ROW_HEIGHT
        })
      }
      pdfDoc.moveDown(0.6)
    })

    pdfDoc.end()
  })
}

// ===== 理发统计导出（管理员 / 办公室内聘岗位）=====
// 可导出理发统计的用户：管理员 或 岗位含「办公室内聘」
// （与前端 haircut 页 canExportStats 口径一致，改一处需同步另一处）
const HAIRCUT_EXPORT_POSITION = '办公室内聘'
const HAIRCUT_APPOINTMENTS = 'haircut_appointments'
const HAIRCUT_STATS_BATCH = 100

/**
 * 从 sys_config 读取部门选项列表（作为部门分组的先后顺序）
 * 读取失败不阻断：返回空数组时，部门分组退化为按名称排序
 */
async function getDepartmentOptions() {
  try {
    const res = await db.collection('sys_config').where({ key: 'DEPARTMENT_OPTIONS' }).limit(1).get()
    if (res.data && res.data.length > 0 && Array.isArray(res.data[0].value)) {
      return res.data[0].value
    }
  } catch (e) {
    console.warn('读取部门顺序失败，部门分组将按名称排序:', e.message)
  }
  return []
}

/**
 * 部门组排序（与前端 form-submissions.compareDeptGroup、trip-board 分组规则同源）
 * 顺序：按 sys_config.DEPARTMENT_OPTIONS →「待赴任馆员」紧随最后一个部门
 *      → 未配置的部门（如「未分配部门」）→「其他人员」置底
 */
function compareDeptGroupName(a, b, order) {
  if (a === b) return 0
  if (a === '其他人员') return 1
  if (b === '其他人员') return -1
  const indexOf = name => {
    if (name === '待赴任馆员') return order.length
    const i = order.indexOf(name)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const ai = indexOf(a)
  const bi = indexOf(b)
  if (ai !== bi) return ai - bi
  return a.localeCompare(b, 'zh')
}

/**
 * 理发统计 PDF 导出
 *
 * 权限：管理员 或 岗位含「办公室内聘」的用户（与前端一致）
 * 参数：months = ['2026-10', '2026-09']（可多选，不设上限）
 * 口径：与页面「理发统计」一致 —— 排除已取消（cancelled）的记录
 * 结构：按月一节 → 按【预约人】所在部门分组（预约人一定是注册用户，能稳定匹配到部门；
 *      理发人姓名可随意填写，因此不作为分组依据）→ 组内按【预约人】的理发次数降序、
 *      同一预约人内按（理发人）次数降序
 * 字段：每行给出【预约人】【理发人】与二者配对的次数
 */
async function generateHaircutStatsPdf(openid, months) {
  const _ = db.command

  // 1. 权限校验：管理员 或「办公室内聘」岗位
  const userRes = await db.collection('office_users').where({ openid, status: 'approved' }).limit(1).get()
  if (!userRes.data || userRes.data.length === 0) {
    throw new Error('无导出权限')
  }
  const exporter = userRes.data[0]
  const positions = Array.isArray(exporter.position) ? exporter.position : []
  if (!exporter.isAdmin && !positions.includes(HAIRCUT_EXPORT_POSITION)) {
    throw new Error('仅管理员及「办公室内聘」岗位可导出理发统计')
  }

  // 2. 月份归一化：去重 + 校验格式 + 升序
  const monthKeys = [...new Set((months || []).filter(m => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)))].sort()
  if (monthKeys.length === 0) {
    throw new Error('未选择月份')
  }

  // 3. 查询预约记录：按月生成日期区间，用 _.or 组合为一次查询
  //    status 只取 booked / completed（与页面统计一致，已取消不计入；
  //    unavailable 是招待员关闭的时段，本身没有预约人，也不会命中）
  const whereCondition = _.or(monthKeys.map(m => {
    const [y, mo] = m.split('-').map(Number)
    const nextMonthStart = mo === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(mo + 1).padStart(2, '0')}-01`
    return {
      date: _.gte(`${m}-01`).and(_.lt(nextMonthStart)),
      status: _.in(['booked', 'completed'])
    }
  }))

  const countRes = await db.collection(HAIRCUT_APPOINTMENTS).where(whereCondition).count()
  const totalRecords = countRes.total || 0
  const records = []
  if (totalRecords > 0) {
    const batches = Math.ceil(totalRecords / HAIRCUT_STATS_BATCH)
    for (let i = 0; i < batches; i++) {
      const batchRes = await db.collection(HAIRCUT_APPOINTMENTS)
        .where(whereCondition)
        .orderBy('date', 'asc')
        .orderBy('timeSlot', 'asc')
        .skip(i * HAIRCUT_STATS_BATCH)
        .limit(HAIRCUT_STATS_BATCH)
        .get()
      records.push(...(batchRes.data || []))
    }
  }

  // 4. 预约人（bookerId）→ 用户（取部门）：只查用到的这批 openid
  const bookerIds = [...new Set(records.map(r => r.bookerId).filter(Boolean))]
  const userMap = {}
  for (let i = 0; i < bookerIds.length; i += HAIRCUT_STATS_BATCH) {
    const chunk = bookerIds.slice(i, i + HAIRCUT_STATS_BATCH)
    const chunkRes = await db.collection('office_users')
      .where({ openid: _.in(chunk) })
      .limit(HAIRCUT_STATS_BATCH)
      .get()
    ;(chunkRes.data || []).forEach(u => {
      if (u.openid) userMap[u.openid] = u
    })
  }
  const deptOrder = await getDepartmentOptions()

  // 5. 聚合：月 → 部门 → 预约人 → （理发人, 次数）
  const monthMap = new Map()
  records.forEach(r => {
    const monthKey = (r.date || '').substring(0, 7)
    if (!monthKey) return

    const booker = r.bookerId ? userMap[r.bookerId] : null
    // 部门取名沿用项目统一规则（部门为「无」或角色为「其他」→「其他人员」，排在最末）
    const deptName = booker ? (buildDeptGroupName(booker) || '其他人员') : '未分配部门'
    const bookerKey = r.bookerId || `name:${r.bookerName || ''}`
    const bookerName = (booker && booker.name) || r.bookerName || '未知预约人'
    const appointeeName = r.appointeeName || '未知理发人'

    if (!monthMap.has(monthKey)) {
      const [y, m] = monthKey.split('-')
      monthMap.set(monthKey, {
        monthKey,
        monthLabel: `${Number(y)}年${Number(m)}月`,
        count: 0,
        deptMap: new Map()
      })
    }
    const month = monthMap.get(monthKey)
    month.count++

    if (!month.deptMap.has(deptName)) {
      month.deptMap.set(deptName, { name: deptName, bookerMap: new Map() })
    }
    const dept = month.deptMap.get(deptName)

    if (!dept.bookerMap.has(bookerKey)) {
      dept.bookerMap.set(bookerKey, { bookerName, total: 0, pairMap: new Map() })
    }
    const person = dept.bookerMap.get(bookerKey)
    person.total++
    person.pairMap.set(appointeeName, (person.pairMap.get(appointeeName) || 0) + 1)
  })

  const monthGroups = [...monthMap.values()]
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .map(m => ({
      monthKey: m.monthKey,
      monthLabel: m.monthLabel,
      count: m.count,
      bookerCount: [...m.deptMap.values()].reduce((sum, d) => sum + d.bookerMap.size, 0),
      deptGroups: [...m.deptMap.values()]
        .sort((a, b) => compareDeptGroupName(a.name, b.name, deptOrder))
        .map(d => ({
          name: d.name,
          people: [...d.bookerMap.values()]
            .sort((a, b) => b.total - a.total || a.bookerName.localeCompare(b.bookerName, 'zh'))
            .map(p => ({
              bookerName: p.bookerName,
              total: p.total,
              pairs: [...p.pairMap.entries()]
                .map(([appointeeName, count]) => ({ appointeeName, count }))
                .sort((a, b) => b.count - a.count || a.appointeeName.localeCompare(b.appointeeName, 'zh'))
            }))
        }))
    }))

  // 6. 生成 PDF
  const fontPath = await ensureFont()
  const boldFontPath = await ensureBoldFont()
  const timezoneOffset = await getTimezoneOffset()

  const pdfDoc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    bufferPages: true // 收尾时回填页码
  })
  pdfDoc.registerFont('ChineseFont', fontPath)
  pdfDoc.registerFont('ChineseFontBold', boldFontPath || fontPath)

  const buffers = []
  pdfDoc.on('data', buffers.push.bind(buffers))

  return new Promise((resolve, reject) => {
    pdfDoc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(buffers)
        const fileName = `理发统计_${Date.now()}.pdf`
        const uploadResult = await cloud.uploadFile({
          cloudPath: `haircut_stats_pdfs/${fileName}`,
          fileContent: pdfBuffer
        })
        resolve({ code: 0, message: 'ok', data: { fileID: uploadResult.fileID } })
      } catch (err) {
        reject(new Error('PDF上传失败: ' + err.message))
      }
    })
    pdfDoc.on('error', (err) => reject(new Error('PDF生成失败: ' + err.message)))

    const ROW_HEIGHT = 17
    // 列位置（A4 内容区 50 ~ 545）
    const COL_NO = 58
    const COL_BOOKER = 100
    const COL_APPOINTEE = 245
    const COL_COUNT = 400

    /**
     * 渲染每行前调用：确保整行放得进本页，放不下先换页。
     * 与菜单评分导出同款写法：行由多个绝对坐标的 text() 拼成，中间不会推进 pdfDoc.y，
     * 一旦贴底触发 pdfkit 内部的防孤行插页，各列会被拆到不同页。
     */
    const prepareRow = (fontSize = 11) => {
      pdfDoc.fontSize(fontSize).font('ChineseFont')
      const lineHeight = Math.max(pdfDoc.currentLineHeight(true), ROW_HEIGHT)
      if (pdfDoc.y + lineHeight + 4 > pdfDoc.page.maxY()) {
        pdfDoc.addPage()
        return true
      }
      return false
    }

    // 表格列头（每个部门组开头画一次；跨页后重画，保证列名始终可见）
    const drawColumnHeader = () => {
      const rowY = pdfDoc.y
      pdfDoc.fontSize(10).font('ChineseFontBold').fillColor('#64748B')
      pdfDoc.text('序号', COL_NO, rowY, { width: 40, lineBreak: false })
      pdfDoc.text('预约人', COL_BOOKER, rowY, { width: 140, lineBreak: false })
      pdfDoc.text('理发人', COL_APPOINTEE, rowY, { width: 140, lineBreak: false })
      pdfDoc.text('次数', COL_COUNT, rowY, { width: 60, lineBreak: false })
      pdfDoc.y = rowY + ROW_HEIGHT - 2
      pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#E2E8F0')
      pdfDoc.y = pdfDoc.y + 4
      pdfDoc.font('ChineseFont')
    }

    // ===== 标题 =====
    pdfDoc.fontSize(22).font('ChineseFont').fillColor('#1E293B').text('理发统计', { align: 'center' })
    pdfDoc.moveDown(0.6)
    pdfDoc.moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke('#EA580C')
    pdfDoc.moveDown(0.6)
    // 生成时间 / 统计范围：左对齐、黑色字体
    pdfDoc.fontSize(10).font('ChineseFont').fillColor('#000000')
      .text(`生成时间：${formatLocalTime(new Date(), timezoneOffset)}`, { align: 'left' })
    pdfDoc.moveDown(0.3)
    pdfDoc.fontSize(10).font('ChineseFont').fillColor('#000000').text(
      `统计范围：${monthKeys.slice().sort().reverse().map(m => {
        const [y, mo] = m.split('-')
        return `${Number(y)}年${Number(mo)}月`
      }).join('、')}（共 ${records.length} 次，已取消记录不计入）`,
      { align: 'left' }
    )
    pdfDoc.moveDown(1)

    if (monthGroups.length === 0) {
      pdfDoc.fontSize(11).font('ChineseFont').fillColor('#94A3B8').text('所选月份暂无预约记录', 60)
    }

    // ===== 按月一节 =====
    monthGroups.forEach((month, monthIdx) => {
      if (monthIdx > 0) pdfDoc.moveDown(0.4)
      // 月份标题不落在页面底部
      if (pdfDoc.y > 700) pdfDoc.addPage()

      const titleY = pdfDoc.y
      pdfDoc.rect(50, titleY - 2, 495, 22).fill('#FFF7ED')
      pdfDoc.fontSize(14).font('ChineseFontBold').fillColor('#C2410C')
        .text(`${month.monthLabel}`, 60, titleY + 3, { lineBreak: false })
      pdfDoc.fontSize(10).font('ChineseFont').fillColor('#EA580C')
        .text(`共 ${month.count} 次 · ${month.bookerCount} 人`, 360, titleY + 6, { width: 180, align: 'right', lineBreak: false })
      pdfDoc.y = titleY + 30
      pdfDoc.fillColor('#1E293B')

      month.deptGroups.forEach(dept => {
        if (pdfDoc.y > 720) pdfDoc.addPage()

        // 部门组标题（淡蓝底，与其它导出保持一致；不加【】括号）
        const deptY = pdfDoc.y
        pdfDoc.rect(50, deptY - 2, 495, 20).fill('#EFF6FF')
        pdfDoc.fontSize(12).font('ChineseFontBold').fillColor('#1E40AF')
          .text(dept.name, 60, deptY + 2, { lineBreak: false })
        pdfDoc.y = deptY + 26
        pdfDoc.fillColor('#1E293B')

        drawColumnHeader()

        let rowNo = 0
        dept.people.forEach(person => {
          person.pairs.forEach((pair, pairIdx) => {
            if (prepareRow()) drawColumnHeader()
            const rowY = pdfDoc.y
            rowNo++

            pdfDoc.fontSize(10).font('ChineseFont').fillColor('#94A3B8')
              .text(String(rowNo), COL_NO, rowY, { width: 40, lineBreak: false })

            // 预约人只在本人第一条明细上显示，视觉上把同一人的记录聚成一块
            if (pairIdx === 0) {
              pdfDoc.fontSize(11).font('ChineseFontBold').fillColor('#1E293B')
                .text(person.bookerName, COL_BOOKER, rowY, { width: 140, ellipsis: true, lineBreak: false })
            }

            pdfDoc.fontSize(11).font('ChineseFont').fillColor('#334155')
              .text(pair.appointeeName, COL_APPOINTEE, rowY, { width: 140, ellipsis: true, lineBreak: false })
            pdfDoc.fillColor('#EA580C')
              .text(`${pair.count} 次`, COL_COUNT, rowY, { width: 60, lineBreak: false })

            pdfDoc.y = rowY + ROW_HEIGHT
          })
        })

        // 该部门小计（贴底时先换页，避免小计与所属分组被拆到两页）
        const deptTotal = dept.people.reduce((sum, p) => sum + p.total, 0)
        if (pdfDoc.y + 24 > pdfDoc.page.maxY()) pdfDoc.addPage()
        pdfDoc.fontSize(10).font('ChineseFont').fillColor('#64748B')
          .text(`小计：${deptTotal} 次 · ${dept.people.length} 人`, 380, pdfDoc.y, { width: 165, align: 'right' })
        pdfDoc.moveDown(0.7)
      })
    })

    // ===== 签字栏：统计内容之后空 2~3 行，页面右侧留「招待员签字」 =====
    // 空间不足时先换页，避免签字栏贴着页脚或被拆开
    const signFontSize = 14
    const signLabel = '招待员签字：'
    const signLineWidth = 170 // 签字横线长度（pt）
    if (pdfDoc.y + 90 > pdfDoc.page.maxY()) pdfDoc.addPage()

    pdfDoc.fontSize(signFontSize).font('ChineseFont')
    pdfDoc.moveDown(2.6)

    const signBaseY = pdfDoc.y
    const signLabelWidth = pdfDoc.widthOfString(signLabel)
    const signLineStartX = 545 - signLineWidth
    const signLabelX = signLineStartX - signLabelWidth - 6
    pdfDoc.fillColor('#000000').text(signLabel, signLabelX, signBaseY, { lineBreak: false })
    // 签字横线用绘制线条（下划线字符 "_" 在不同字体下容易断续，字号放大后更明显）
    const signLineY = signBaseY + signFontSize * 1.05
    pdfDoc.lineWidth(1).strokeColor('#000000')
      .moveTo(signLineStartX, signLineY).lineTo(545, signLineY).stroke()
    pdfDoc.y = signBaseY + signFontSize * 1.5

    // ===== 页码：每页底部居中「第X页」 =====
    const pageRange = pdfDoc.bufferedPageRange()
    for (let i = 0; i < pageRange.count; i++) {
      pdfDoc.switchToPage(pageRange.start + i)
      const bottomMargin = pdfDoc.page.margins.bottom
      pdfDoc.page.margins.bottom = 0
      pdfDoc.fontSize(9).font('ChineseFont').fillColor('#94A3B8')
        .text(`第${i + 1}页`, 50, 800, { width: 495, align: 'center', lineBreak: false })
      pdfDoc.page.margins.bottom = bottomMargin
    }

    pdfDoc.end()
  })
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const { orderId, type, formId, menuIds, sortMode, groupOrder, months } = event || {}

  // 理发统计导出（管理员 / 办公室内聘，按月多选）
  if (type === 'haircutStats') {
    if (!Array.isArray(months) || months.length === 0) {
      return fail('未选择月份', 400)
    }
    try {
      return await generateHaircutStatsPdf(openid, months)
    } catch (error) {
      return fail(error.message || '生成理发统计PDF失败', 500)
    }
  }

  // 菜单评分导出
  if (type === 'menuRatings') {
    if (!Array.isArray(menuIds) || menuIds.length === 0) {
      return fail('未选择菜单', 400)
    }
    try {
      return await generateMenuRatingsPdf(openid, menuIds)
    } catch (error) {
      return fail(error.message || '生成评分PDF失败', 500)
    }
  }

  // 副食预订清单导出（旧副食系统）
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

  // 馆内动态系统 - 副食订购清单导出
  if (type === 'contentFormSideDish') {
    if (!formId) {
      return fail('缺少 formId 参数', 400)
    }
    try {
      return await generateContentFormSideDishPdf(formId, sortMode, groupOrder)
    } catch (error) {
      return fail(error.message || '生成副食清单失败', 500)
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
