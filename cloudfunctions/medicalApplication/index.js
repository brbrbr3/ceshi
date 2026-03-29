const cloud = require('wx-server-sdk')
const PDFDocument = require('pdfkit')
const path = require('path')
const fs = require('fs')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const workOrdersCollection = db.collection('work_orders')
const workflowTemplatesCollection = db.collection('workflow_templates')
const usersCollection = db.collection('office_users')
const medicalRecordsCollection = db.collection('medical_records')

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

const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

// 提交就医申请
async function submitMedicalApplication(openid, businessData) {
  // 验证用户权限
  const userResult = await usersCollection.where({ openid }).limit(1).get()
  if (!userResult.data || userResult.data.length === 0) {
    throw new Error('用户不存在')
  }

  const user = userResult.data[0]
  const role = user.role || ''

  // 检查权限：物业、配偶、家属无权限
  if (role === '物业' || role === '配偶' || role === '家属') {
    throw new Error('您当前的角色无权提交就医申请')
  }

  if (user.status !== REQUEST_STATUS.APPROVED) {
    throw new Error('用户状态异常，请重新登录')
  }

  // 调用工作流引擎提交工单
  try {
    const workflowResult = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'medical_application',
        businessData: {
          applicantId: openid,
          applicantName: user.name,
          applicantRole: user.role,
          patientName: businessData.patientName,
          relation: businessData.relation,
          medicalDate: businessData.medicalDate,
          institution: businessData.institution,
          otherInstitution: businessData.otherInstitution,
          reasonForSelection: businessData.reasonForSelection,
          reason: businessData.reason
        }
      }
    })

    if (workflowResult.result.code !== 0) {
      throw new Error(workflowResult.result.message || '提交工作流工单失败')
    }

    const orderId = workflowResult.result.data.orderId
    return success({
      orderId: orderId,
      orderNo: workflowResult.result.data.orderNo,
      message: '就医申请提交成功'
    }, '提交成功')
  } catch (error) {
    throw new Error('提交就医申请失败: ' + error.message)
  }
}

/**
 * 获取就医申请历史记录（分页）
 * 从 medical_records 查询用户的已通过记录
 */
async function getHistory(openid, page = 1, pageSize = 20) {
  try {
    const countRes = await medicalRecordsCollection.where({
      applicantId: openid
    }).count()

    const dataRes = await medicalRecordsCollection.where({
      applicantId: openid
    })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

    return success({
      list: dataRes.data,
      total: countRes.total,
      page,
      pageSize,
      hasMore: countRes.total > page * pageSize
    })
  } catch (error) {
    throw new Error('获取就医记录失败: ' + error.message)
  }
}

/**
 * 获取就医申请记录详情
 */
async function getDetail(openid, recordId) {
  try {
    const recordRes = await medicalRecordsCollection.doc(recordId).get()
    const record = recordRes.data

    if (record.applicantId !== openid) {
      throw new Error('无权查看此记录')
    }

    // 查询关联的工作流日志
    const logsRes = await db.collection('workflow_logs')
      .where({ orderId: record.orderId })
      .orderBy('createdAt', 'asc')
      .get()

    return success({
      record,
      logs: logsRes.data
    })
  } catch (error) {
    throw new Error('获取记录详情失败: ' + error.message)
  }
}

/**
 * 生成就医申请PDF
 * 使用 pdfkit 生成PDF，上传至云存储，返回临时下载链接
 */
async function generatePdf(openid, recordId) {
  try {
    const recordRes = await medicalRecordsCollection.doc(recordId).get()
    const record = recordRes.data

    if (record.applicantId !== openid) {
      throw new Error('无权导出此记录')
    }

    // 查询审批日志
    const logsRes = await db.collection('workflow_logs')
      .where({ orderId: record.orderId })
      .orderBy('createdAt', 'asc')
      .get()
    const logs = logsRes.data

    // 确保中文字体已就绪
    const fontPath = await ensureFont()

    // 创建PDF文档（A4尺寸，毫米单位）
    const pdfDoc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    })
    pdfDoc.registerFont('ChineseFont', fontPath)

    // 收集PDF数据到Buffer
    const buffers = []
    pdfDoc.on('data', buffers.push.bind(buffers))

    // 使用Promise包装异步PDF生成
    const tempFileUrl = await new Promise((resolve, reject) => {
      pdfDoc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers)
          const fileName = `medical_${record.orderNo || record._id}_${Date.now()}.pdf`
          const uploadResult = await cloud.uploadFile({
            cloudPath: `medical_pdfs/${fileName}`,
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

      // 绘制PDF内容
      const pageWidth = pdfDoc.page.width - 100

      // 标题
      pdfDoc.fontSize(20).text('就医申请表', { align: 'center' })
      pdfDoc.moveDown(1)

      // 基本信息区域
      pdfDoc.fontSize(12)
      const institutionText = record.institution === '其他'
        ? record.otherInstitution
        : record.institution

      const infoItems = [
        { label: '申请编号', value: record.orderNo || '-' },
        { label: '申请人', value: record.applicantName },
        { label: '就医人', value: record.patientName },
        { label: '与申请人关系', value: record.relation },
        { label: '就医日期', value: record.medicalDate },
        { label: '就医机构', value: institutionText },
        { label: '选择原因', value: record.reasonForSelection || '-' },
        { label: '就医原因', value: record.reason || '-' },
      ]

      infoItems.forEach(item => {
        pdfDoc.font('ChineseFont').text(`${item.label}：`, 50, undefined, { continued: true })
        pdfDoc.font('ChineseFont').text(item.value || '-')
        pdfDoc.moveDown(0.3)
      })

      // 审批记录区域
      pdfDoc.moveDown(1)
      pdfDoc.fontSize(14).font('ChineseFont').text('审批记录', { underline: true })
      pdfDoc.moveDown(0.5)
      pdfDoc.fontSize(11)

      logs.forEach(log => {
        const actionText = {
          'submit': '提交申请',
          'approve': '审批通过',
          'reject': '审批拒绝',
          'return': '退回修改'
        }[log.action] || log.action

        const timeStr = log.operateTime
          ? new Date(log.operateTime).toLocaleString('zh-CN')
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
        .text(`生成时间：${new Date().toLocaleString('zh-CN')}`, { align: 'center' })
      pdfDoc.fillColor('#000000')

      pdfDoc.end()
    })

    return success({
      fileUrl: tempFileUrl,
      fileName: `就医申请_${record.orderNo || record._id}.pdf`
    })
  } catch (error) {
    throw new Error('生成PDF失败: ' + error.message)
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  const action = event && event.action

  try {
    switch (action) {
      case 'submit':
        return await submitMedicalApplication(openid, event.businessData)

      case 'getHistory':
        return await getHistory(openid, event.page, event.pageSize)

      case 'getDetail':
        return await getDetail(openid, event.recordId)

      case 'generatePdf':
        return await generatePdf(openid, event.recordId)

      default:
        return fail('不支持的操作类型', 400)
    }
  } catch (error) {
    return fail(error.message || '服务异常，请稍后重试', 500)
  }
}
