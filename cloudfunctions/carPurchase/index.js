/**
 * 购车管理云函数（Checklist模式）
 *
 * 支持的 action：
 *   - create            创建购车记录
 *   - getMyList         获取我的购车列表（分页）
 *   - getAllList        获取全部购车列表（办公室人员用，分页）
 *   - getDetail         获取购车详情（含完整groups+steps）
 *   - toggleStep        切换步骤完成状态（打钩/取消打钩）
 *   - uploadAttachments 上传步骤附件
 *   - updateStepRemark  更新步骤备注或文本值
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const recordsCollection = db.collection('car_purchase_records')
const usersCollection = db.collection('office_users')
const notificationsCollection = db.collection('notifications')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

// ========== 6组步骤定义模板 ==========
const GROUPS_TEMPLATE = [
  {
    groupId: 1,
    groupName: '购车准备',
    groupOwner: 'staff',
    steps: [
      { stepKey: '1_1', title: '选定车型', inputType: 'text', required: true, hint: '请输入您选择的车型' },
      { stepKey: '1_2', title: '馆内购车申请', inputType: 'text', required: false, hint: '预留字段，后续可能增加审批流程' },
      { stepKey: '1_3', title: '签订合同并付定金', inputType: 'upload', required: false, hint: '上传合同照片、付定金截图', maxFiles: 6 },
      { stepKey: '1_4', title: '取得外交官证', inputType: 'upload', required: false, hint: '上传证件正反面照片', maxFiles: 2 }
    ]
  },
  {
    groupId: 2,
    groupName: '免税审批',
    groupOwner: 'office',
    steps: [
      { stepKey: '2_1', title: '制作《免税购车申请表》《居住证明》《税务委托书》', inputType: 'checkbox', required: false, hint: '系统根据模板自动生成并下载' },
      { stepKey: '2_2', title: '提交上述文件至外交部特豁处审批', inputType: 'checkbox', required: false },
      { stepKey: '2_3', title: '《免税购车申请表》获外交部批复', inputType: 'checkbox', required: false },
      { stepKey: '2_4', title: '《免税购车申请表》交税务部审批', inputType: 'checkbox', required: false },
      { stepKey: '2_5', title: '《免税购车申请表》获税务部批复', inputType: 'checkbox', required: false }
    ]
  },
  {
    groupId: 3,
    groupName: '付款提车',
    groupOwner: 'staff',
    steps: [
      { stepKey: '3_1', title: '车行通知付全款', inputType: 'upload', required: false, hint: '上传合同照片/PDF、付款凭证、发票', maxFiles: 9 },
      { stepKey: '3_2', title: '完成提车', inputType: 'remark', required: false, hint: '请将车架号拓印交办公室' }
    ]
  },
  {
    groupId: 4,
    groupName: '上牌准备',
    groupOwner: 'office',
    steps: [
      { stepKey: '4_1', title: '协助办理车险', inputType: 'checkbox', required: false },
      { stepKey: '4_2', title: '填写《上牌申请表》Renavam', inputType: 'checkbox', required: false },
      { stepKey: '4_3', title: 'Renavam交外交部审批', inputType: 'checkbox', required: false },
      { stepKey: '4_4', title: 'Renavam获外交部批复', inputType: 'checkbox', required: false },
      { stepKey: '4_5', title: '约定上牌日期', inputType: 'date', required: false }
    ]
  },
  {
    groupId: 5,
    groupName: '上牌+车补材料',
    groupOwner: 'staff',
    steps: [
      { stepKey: '5_1', title: '前往上牌', inputType: 'remark', required: false, hint: '当日请携带外交官证原件、车辆相关文件，并将车辆开至馆前门' },
      { stepKey: '5_2', title: '填写《车补申请表》', inputType: 'upload', required: false, hint: '上传填写好的车补申请表', maxFiles: 3 }
    ]
  },
  {
    groupId: 6,
    groupName: '车补审批',
    groupOwner: 'office',
    steps: [
      { stepKey: '6_1', title: '向国内申请车补', inputType: 'checkbox', required: false }
    ]
  }
]

/**
 * 职别→购车标准映射
 */
const POSITION_CAR_STANDARD_MAP = [
  {
    position: '副司级以上，副师职以上武官',
    carStandard: 45000,
    carMinStandard: 27000,
    carSubsidy: 6380
  },
  {
    position: '处级，文职武官、副师职副武官',
    carStandard: 41000,
    carMinStandard: 24600,
    carSubsidy: 5860
  },
  {
    position: '一秘、二秘',
    carStandard: 36000,
    carMinStandard: 21600,
    carSubsidy: 5100
  },
  {
    position: '三秘、随员、职员、试用期人员',
    carStandard: 31000,
    carMinStandard: 18600,
    carSubsidy: 4330
  },
  {
    position: '工勤人员',
    carStandard: 23000,
    carMinStandard: 6900,
    carSubsidy: 3310
  }
]

const POSITION_OPTIONS = POSITION_CAR_STANDARD_MAP.map(item => item.position)

/**
 * 根据模板创建初始步骤状态数组
 */
function buildInitialGroups() {
  return GROUPS_TEMPLATE.map(group => ({
    groupId: group.groupId,
    groupName: group.groupName,
    groupOwner: group.groupOwner,
    steps: group.steps.map(step => ({
      stepKey: step.stepKey,
      title: step.title,
      inputType: step.inputType,
      required: step.required,
      hint: step.hint || '',
      maxFiles: step.maxFiles || 9,
      status: 'pending',
      value: '',
      attachments: [],
      completedAt: null,
      operatorId: null,
      operatorName: null,
      remark: ''
    }))
  }))
}

/**
 * 获取当前用户信息
 */
async function getUserInfo(openid) {
  const userRes = await usersCollection.where({ openid, status: 'approved' }).limit(1).get()
  return userRes.data.length > 0 ? userRes.data[0] : null
}

/**
 * 检查用户是否有权限操作该步骤
 * staff 组步骤只有申请人可操作；office 组步骤只有办公室部门人员可操作
 */
function canOperateStep(record, userInfo, group) {
  if (group.groupOwner === 'staff') {
    return record.applicantOpenid === userInfo.openid
  } else if (group.groupOwner === 'office') {
    return userInfo.department === '办公室'
  }
  return false
}

/**
 * 检查某组是否全部完成（所有步骤都必须打钩/填写）
 */
function isGroupComplete(group) {
  if (!group.steps || group.steps.length === 0) {
    console.log(`[DEBUG-isGroupComplete] 无步骤，返回 false`)
    return false
  }
  const allDone = group.steps.every(s => s.status === 'done')
  console.log(`[DEBUG-isGroupComplete] groupId=${group.groupId}, totalSteps=${group.steps.length}, doneCount=${group.steps.filter(s => s.status === 'done').length}, result=${allDone}`)
  return allDone
}

/**
 * 计算整体进度百分比
 */
function calculateProgress(groups, currentGroup) {
  let totalSteps = 0
  let completedSteps = 0

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    for (const step of g.steps) {
      totalSteps++
      if (step.status === 'done') completedSteps++
    }
    // 如果还没到当前组，后面的不算
    if (i + 1 >= currentGroup) break
  }

  return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
}

/**
 * 推送通知给指定人员
 */
async function pushNotification(targetOpenids, title, content, extra) {
  try {
    const notifications = targetOpenids.map(openid => ({
      openid,
      type: 'car_purchase',
      title,
      content,
      read: false,
      createdAt: Date.now(),
      extra: extra || {}
    }))
    // 批量写入通知（每批20条）
    const batchSize = 20
    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize)
      for (const notif of batch) {
        await notificationsCollection.add({ data: notif })
      }
    }
  } catch (error) {
    console.error('推送通知失败:', error)
  }
}

// ========== Action 实现 ==========

/**
 * 创建购车申请记录
 */
async function createRecord(openid, event) {
  const { carModel } = event

  if (!String(carModel || '').trim()) {
    return fail('请填写车型', 400)
  }

  const userInfo = await getUserInfo(openid)
  if (!userInfo) {
    return fail('未找到用户信息，请联系管理员', 403)
  }

  const now = Date.now()

  const recordData = {
    applicantOpenid: openid,
    applicantName: userInfo.name || '',
    applicantDepartment: userInfo.department || '',
    carModel: String(carModel).trim(),
    type: 'purchase_process',
    status: 'active',
    currentGroup: 1,
    notifiedGroups: [],
    groups: buildInitialGroups(),
    createdAt: now,
    updatedAt: now
  }

  const res = await recordsCollection.add({ data: recordData })

  return success({
    recordId: res._id,
    carModel: recordData.carModel
  }, '购车申请已创建')
}

/**
 * 获取我的购车列表（分页）
 */
async function getMyList(openid, event) {

  if (!openid) {
    return fail('无法获取用户身份，请重新进入小程序', 401)
  }

  const _page = Math.max(1, Number(event.page) || 1)
  const _pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 10))
  const skipCount = (_page - 1) * _pageSize

  const countRes = await recordsCollection.where({
    applicantOpenid: openid
  }).count()

  const listRes = await recordsCollection.where({
    applicantOpenid: openid
  })
    .orderBy('createdAt', 'desc')
    .skip(skipCount)
    .limit(_pageSize)
    .get()

  const list = listRes.data.map(item => {
    const recordType = item.type || 'purchase_process'
    const isProcess = recordType === 'purchase_process'
    const progress = isProcess ? calculateProgress(item.groups, item.currentGroup) : 0
    const currentGroupName = isProcess ? ((item.groups[item.currentGroup - 1] || {}).groupName || '-') : ''
    return {
      _id: item._id,
      carModel: item.carModel || item.brand || '',
      brand: item.brand || '',
      type: recordType,
      currentGroup: isProcess ? item.currentGroup : undefined,
      currentGroupName,
      progress,
      status: item.status,
      position: item.position || '',
      isNewCar: item.isNewCar,
      isApplyLoan: item.isApplyLoan,
      isFirstResident: item.isFirstResident,
      borrowableAmount: item.borrowableAmount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  })

  return success({
    list,
    total: countRes.total,
    hasMore: skipCount + list.length < countRes.total
  })
}

/**
 * 获取全部购车列表（办公室人员使用）
 */
async function getAllList(openid, event) {
  const _page = Math.max(1, Number(event.page) || 1)
  const _pageSize = Math.min(100, Math.max(1, Number(event.pageSize) || 10))

  const userInfo = await getUserInfo(openid)
  if (!userInfo || userInfo.department !== '办公室') {
    return fail('仅办公室部门人员可查看', 403)
  }

  const skipCount = (_page - 1) * _pageSize

  const countRes = await recordsCollection.count()

  const listRes = await recordsCollection
    .orderBy('createdAt', 'desc')
    .skip(skipCount)
    .limit(_pageSize)
    .get()

  const list = listRes.data.map(item => {
    const recordType = item.type || 'purchase_process'
    const isProcess = recordType === 'purchase_process'
    const progress = isProcess ? calculateProgress(item.groups, item.currentGroup) : 0
    const currentGroupName = isProcess ? ((item.groups[item.currentGroup - 1] || {}).groupName || '-') : ''
    return {
      _id: item._id,
      applicantName: item.applicantName,
      applicantDepartment: item.applicantDepartment,
      carModel: item.carModel || item.brand || '',
      brand: item.brand || '',
      type: recordType,
      currentGroup: isProcess ? item.currentGroup : undefined,
      currentGroupName,
      progress,
      status: item.status,
      position: item.position || '',
      isNewCar: item.isNewCar,
      isApplyLoan: item.isApplyLoan,
      isFirstResident: item.isFirstResident,
      borrowableAmount: item.borrowableAmount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }
  })

  return success({
    list,
    total: countRes.total,
    hasMore: skipCount + list.length < countRes.total
  })
}

/**
 * 获取购车详情
 */
async function getDetail(openid, event) {
  const { recordId } = event

  if (!recordId) {
    return fail('缺少记录ID', 400)
  }

  const res = await recordsCollection.doc(recordId).get()
  const record = res.data

  if (!record) {
    return fail('记录不存在', 404)
  }

  const userInfo = await getUserInfo(openid)

  // 判断当前用户的角色视角
  const isApplicant = record.applicantOpenid === openid
  const isOfficeStaff = userInfo && userInfo.department === '办公室'

  const recordType = record.type || 'purchase_process'

  // 馆内购车申请/借款申请类型直接返回详情，无需 groups
  if (recordType === 'purchase_application' || recordType === 'purchase_loan') {
    return success({
      ...record,
      type: recordType,
      _isApplicant: isApplicant,
      _isOfficeStaff: isOfficeStaff,
      _canView: isApplicant || isOfficeStaff
    })
  }

  // 购车流程类型，计算每组进度
  const groupSummaries = (record.groups || []).map(g => ({
    groupId: g.groupId,
    groupName: g.groupName,
    groupOwner: g.groupOwner,
    totalSteps: g.steps.length,
    doneSteps: g.steps.filter(s => s.status === 'done').length,
    isComplete: isGroupComplete(g),
    canOperate: (g.groupOwner === 'staff' && isApplicant) || (g.groupOwner === 'office' && isOfficeStaff)
  }))

  const progress = calculateProgress(record.groups, record.currentGroup)

  return success({
    ...record,
    _isApplicant: isApplicant,
    _isOfficeStaff: isOfficeStaff,
    _canView: isApplicant || isOfficeStaff,
    progress,
    groupSummaries
  })
}

/**
 * 切换步骤完成状态
 */
async function toggleStep(openid, event) {
  const { recordId, stepKey } = event

  if (!recordId || !stepKey) {
    return fail('缺少必要参数', 400)
  }

  const userInfo = await getUserInfo(openid)
  if (!userInfo) {
    return fail('未找到用户信息', 403)
  }

  // 获取记录
  const res = await recordsCollection.doc(recordId).get()
  const record = res.data
  if (!record) {
    return fail('记录不存在', 404)
  }

  if (record.status !== 'active') {
    return fail('该流程已结束，无法修改', 400)
  }

  // 找到对应的组和步骤
  let targetGroup = null
  let targetStep = null
  let groupIndex = -1
  let stepIndex = -1

  for (let gi = 0; gi < record.groups.length; gi++) {
    const g = record.groups[gi]
    const si = g.steps.findIndex(s => s.stepKey === stepKey)
    if (si !== -1) {
      targetGroup = g
      targetStep = g.steps[si]
      groupIndex = gi
      stepIndex = si
      break
    }
  }

  if (!targetStep) {
    return fail('步骤不存在', 404)
  }

  // 权限检查：只能操作自己负责组的步骤，且不能操作未来组
  if (!canOperateStep(record, userInfo, targetGroup)) {
    return fail('您无权操作此步骤', 403)
  }

  if (groupIndex + 1 > record.currentGroup) {
    return fail('当前阶段尚未到此步骤', 400)
  }

  // 切换状态
  const newStatus = targetStep.status === 'done' ? 'pending' : 'done'
  const now = Date.now()

  targetStep.status = newStatus
  targetStep.completedAt = newStatus === 'done' ? now : null
  targetStep.operatorId = newStatus === 'done' ? openid : null
  targetStep.operatorName = newStatus === 'done' ? (userInfo.name || '') : null

  // 更新记录
  await recordsCollection.doc(recordId).update({
    data: {
      [`groups.${groupIndex}.steps.${stepIndex}`]: targetStep,
      updatedAt: now
    }
  })

  // 检查组间流转 —— 必须重新读取最新数据
  const result = { toggled: true, newStatus, stepKey }
  const freshRes = await recordsCollection.doc(recordId).get()
  if (freshRes.data) {
    await checkAndAdvanceGroup(recordId, freshRes.data, groupIndex, userInfo)
  }

  return success(result, newStatus === 'done' ? '步骤已完成' : '步骤已取消')
}

/**
 * 检查并推进组进度，必要时发送通知
 */
async function checkAndAdvanceGroup(recordId, record, changedGroupIndex, operatorUser) {
  const changedGroup = record.groups[changedGroupIndex]
  console.log(`[DEBUG-ADVANCE] recordId=${recordId}, changedGroupIndex=${changedGroupIndex}, groupId=${changedGroup.groupId}`)
  console.log(`[DEBUG-ADVANCE] currentGroup=${record.currentGroup}, notifiedGroups=${JSON.stringify(record.notifiedGroups)}`)
  console.log(`[DEBUG-ADVANCE] group steps status:`, JSON.stringify(changedGroup.steps.map(s => ({ stepKey: s.stepKey, status: s.status }))))

  const wasCompleteBefore = record.notifiedGroups.includes(changedGroup.groupId)
  const isCompleteNow = isGroupComplete(changedGroup)

  console.log(`[DEBUG-ADVANCE] wasCompleteBefore=${wasCompleteBefore}, isCompleteNow=${isCompleteNow}`)

  if (isCompleteNow && !wasCompleteBefore) {
    console.log(`[DEBUG-ADVANCE] ✅ 推进条件满足！准备推进到下一组`)
    // 该组刚刚全部完成，检查是否需要推进到下一组
    if (changedGroupIndex + 1 < record.groups.length) {
      const nextGroup = record.groups[changedGroupIndex + 1]
      console.log(`[DEBUG-ADVANCE] 下一组: G${nextGroup.groupId} ${nextGroup.groupName}`)

      // 更新 currentGroup 和 notifiedGroups（记录当前完成的组）
      const newNotifiedGroups = [...record.notifiedGroups, changedGroup.groupId]
      const now = Date.now()

      await recordsCollection.doc(recordId).update({
        data: {
          currentGroup: nextGroup.groupId,
          notifiedGroups: newNotifiedGroups,
          updatedAt: now
        }
      })
      console.log(`[DEBUG-ADVANCE] ✅ 已推进！currentGroup→${nextGroup.groupId}, notifiedGroups→${JSON.stringify(newNotifiedGroups)}`)

      // 推送通知
      if (nextGroup.groupOwner === 'office') {
        // 通知办公室所有人
        const officeUsersRes = await usersCollection.where({
          department: '办公室',
          status: 'approved'
        }).field({ openid: true }).get()

        const officeOpenids = officeUsersRes.data.map(u => u.openid)
        await pushNotification(
          officeOpenids,
          `【购车】${record.applicantName}的「${changedGroup.groupName}」已完成`,
          `${record.applicantName}的购车流程进入下一阶段「${nextGroup.groupName}」，请及时处理。`,
          { recordId, type: 'group_advance', fromGroup: changedGroup.groupId, toGroup: nextGroup.groupId }
        )
      } else {
        // 通知申请人
        await pushNotification(
          [record.applicantOpenid],
          `【购车】您的「${changedGroup.groupName}」已完成`,
          `您的购车流程进入下一阶段「${nextGroup.groupName}」，请及时处理。`,
          { recordId, type: 'group_advance', fromGroup: changedGroup.groupId, toGroup: nextGroup.groupId }
        )
      }
    } else {
      console.log(`[DEBUG-ADVANCE] 最后一个组完成，流程结束`)
      // 最后一个组完成 → 流程结束
      const now = Date.now()
      await recordsCollection.doc(recordId).update({
        data: {
          status: 'completed',
          updatedAt: now
        }
      })

      // 通知申请人流程完成
      await pushNotification(
        [record.applicantOpenid],
        '【购车】您的购车流程已全部完成',
        `恭喜！您的购车流程（${record.carModel}）已全部完成。`,
        { recordId, type: 'completed' }
      )
    }
  } else {
    if (!isCompleteNow) {
      console.log(`[DEBUG-ADVANCE] ❌ 组未完成，不推进。未完成的步骤:`)
      for (const s of changedGroup.steps) {
        if (s.status !== 'done') {
          console.log(`[DEBUG-ADVANCE]   - ${s.stepKey} (${s.title}): status=${s.status}`)
        }
      }
    } else {
      console.log(`[DEBUG-ADVANCE] ⏭️ 组已完成但 notifiedGroups 已包含此组(${changedGroup.groupId})，跳过重复推进`)
    }
  }
}

/**
 * 上传步骤附件
 */
async function uploadAttachments(openid, event) {
  const { recordId, stepKey, attachments } = event

  if (!recordId || !stepKey || !attachments || !Array.isArray(attachments)) {
    return fail('缺少必要参数', 400)
  }

  const userInfo = await getUserInfo(openid)
  if (!userInfo) {
    return fail('未找到用户信息', 403)
  }

  const res = await recordsCollection.doc(recordId).get()
  const record = res.data
  if (!record) {
    return fail('记录不存在', 404)
  }

  // 定位步骤
  let targetGroup = null
  let targetStep = null
  let groupIndex = -1
  let stepIndex = -1

  for (let gi = 0; gi < record.groups.length; gi++) {
    const g = record.groups[gi]
    const si = g.steps.findIndex(s => s.stepKey === stepKey)
    if (si !== -1) {
      targetGroup = g
      targetStep = g.steps[si]
      groupIndex = gi
      stepIndex = si
      break
    }
  }

  if (!targetStep) {
    return fail('步骤不存在', 404)
  }

  if (!canOperateStep(record, userInfo, targetGroup)) {
    return fail('您无权操作此步骤', 403)
  }

  if (targetStep.maxFiles && targetStep.attachments.length + attachments.length > targetStep.maxFiles) {
    return fail(`最多上传 ${targetStep.maxFiles} 个文件`, 400)
  }

  // 追加附件
  const newAttachments = [...targetStep.attachments, ...attachments]
  targetStep.attachments = newAttachments

  const now = Date.now()
  const updateData = {
    [`groups.${groupIndex}.steps.${stepIndex}.attachments`]: newAttachments,
    updatedAt: now
  }

  // 上传附件后自动标记步骤为已完成
  if (newAttachments.length > 0 && targetStep.status !== 'done') {
    updateData[`groups.${groupIndex}.steps.${stepIndex}.status`] = 'done'
    updateData[`groups.${groupIndex}.steps.${stepIndex}.completedAt`] = now
    updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorId`] = openid
    updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorName`] = userInfo.name || ''
    targetStep.status = 'done'
    targetStep.completedAt = now
    targetStep.operatorId = openid
    targetStep.operatorName = userInfo.name || ''
  }

  await recordsCollection.doc(recordId).update({ data: updateData })

  // 检查是否需要推进组（上传附件后可能触发组完成）
  // 必须重新读取最新数据，否则 isGroupComplete 用的是旧状态
  if (targetStep.status === 'done') {
    const freshRes = await recordsCollection.doc(recordId).get()
    const freshRecord = freshRes.data
    if (freshRecord) {
      await checkAndAdvanceGroup(recordId, freshRecord, groupIndex, userInfo)
    }
  }

  return success({ attachments: newAttachments }, '附件上传成功')
}

/**
 * 更新步骤备注或文本值
 */
async function updateStepRemark(openid, event) {
  const { recordId, stepKey, value, remark } = event

  if (!recordId || !stepKey) {
    return fail('缺少必要参数', 400)
  }

  const userInfo = await getUserInfo(openid)
  if (!userInfo) {
    return fail('未找到用户信息', 403)
  }

  const res = await recordsCollection.doc(recordId).get()
  const record = res.data
  if (!record) {
    return fail('记录不存在', 404)
  }

  // 定位步骤
  let targetGroup = null
  let targetStep = null
  let groupIndex = -1
  let stepIndex = -1

  for (let gi = 0; gi < record.groups.length; gi++) {
    const g = record.groups[gi]
    const si = g.steps.findIndex(s => s.stepKey === stepKey)
    if (si !== -1) {
      targetGroup = g
      targetStep = g.steps[si]
      groupIndex = gi
      stepIndex = si
      break
    }
  }

  if (!targetStep) {
    return fail('步骤不存在', 404)
  }

  if (!canOperateStep(record, userInfo, targetGroup)) {
    return fail('您无权操作此步骤', 403)
  }

  const updateData = {}
  const now = Date.now()

  if (value !== undefined) {
    updateData[`groups.${groupIndex}.steps.${stepIndex}.value`] = value
    targetStep.value = value
    // 文本或日期类型如果填了值，自动标记为完成
    const hasValue = String(value || '').trim()
    if ((targetStep.inputType === 'text' || targetStep.inputType === 'date') && hasValue) {
      updateData[`groups.${groupIndex}.steps.${stepIndex}.status`] = 'done'
      updateData[`groups.${groupIndex}.steps.${stepIndex}.completedAt`] = now
      updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorId`] = openid
      updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorName`] = userInfo.name || ''
      targetStep.status = 'done'
      targetStep.completedAt = now
      targetStep.operatorId = openid
      targetStep.operatorName = userInfo.name || ''
    }
  }

  if (remark !== undefined) {
    updateData[`groups.${groupIndex}.steps.${stepIndex}.remark`] = remark
    targetStep.remark = remark
    // 备注类型如果填了内容且是 remark/inputType，自动标记为完成
    if (targetStep.inputType === 'remark' && String(remark || '').trim()) {
      updateData[`groups.${groupIndex}.steps.${stepIndex}.status`] = 'done'
      updateData[`groups.${groupIndex}.steps.${stepIndex}.completedAt`] = now
      updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorId`] = openid
      updateData[`groups.${groupIndex}.steps.${stepIndex}.operatorName`] = userInfo.name || ''
      targetStep.status = 'done'
      targetStep.completedAt = now
      targetStep.operatorId = openid
      targetStep.operatorName = userInfo.name || ''
    }
  }

  updateData['updatedAt'] = now

  await recordsCollection.doc(recordId).update({ data: updateData })

  // 检查是否需要推进组 —— 必须重新读取最新数据
  const freshRes = await recordsCollection.doc(recordId).get()
  if (freshRes.data) {
    await checkAndAdvanceGroup(recordId, freshRes.data, groupIndex, userInfo)
  }

  return success({}, '保存成功')
}

/**
 * 删除购车记录（仅申请人或办公室人员可操作），同时清理云存储中的所有附件
 */
async function deleteRecord(openid, event) {
  const { recordId } = event

  if (!recordId) {
    return fail('缺少记录ID', 400)
  }

  // 获取记录
  const res = await recordsCollection.doc(recordId).get()
  const record = res.data
  if (!record) {
    return fail('记录不存在', 404)
  }

  // 权限检查：仅申请人或办公室人员可删除
  const userInfo = await getUserInfo(openid)
  if (record.applicantOpenid !== openid && (!userInfo || userInfo.department !== '办公室')) {
    return fail('仅申请人或办公室人员可删除', 403)
  }

  // 收集所有云存储文件ID
  const fileIDs = []
  for (const group of (record.groups || [])) {
    for (const step of (group.steps || [])) {
      if (step.attachments && Array.isArray(step.attachments)) {
        for (const att of step.attachments) {
          if (att.fileID) {
            fileIDs.push(att.fileID)
          }
        }
      }
    }
  }

  // 批量删除云存储文件（忽略单个删除失败，确保主流程继续）
  if (fileIDs.length > 0) {
    const batchSize = 50 // 云存储批量删除上限
    for (let i = 0; i < fileIDs.length; i += batchSize) {
      const batch = fileIDs.slice(i, i + batchSize)
      try {
        await cloud.deleteFile({ fileList: batch })
      } catch (delErr) {
        console.error(`删除云存储文件失败(批次${Math.floor(i / batchSize) + 1}):`, delErr.message || delErr)
      }
    }
  }

  // 如果记录关联了工单，先中止该工单
  if (record.orderId) {
    try {
      const terminateRes = await cloud.callFunction({
        name: 'workflowEngine',
        data: {
          action: 'terminateOrder',
          orderId: record.orderId,
          reason: `购车申请（${record.brand || ''}）已被删除，关联工单自动中止`
        }
      })
      if (terminateRes.result && terminateRes.result.code !== 0) {
        console.warn('联动中止工单失败:', terminateRes.result.message)
      }
    } catch (terminateErr) {
      console.error('联动中止工单异常:', terminateErr.message || terminateErr)
      // 中止失败不阻止主流程继续删除
    }
  }

  // 删除数据库记录
  await recordsCollection.doc(recordId).remove()

  return success({}, '记录已删除')
}

/**
 * 创建馆内购车申请记录并启动工作流
 */
async function createPurchaseApplication(openid, event) {
  const {
    arrivalDate,
    termMonths,
    position,
    plannedPurchaseDate,
    saleCompany,
    brand,
    specModel,
    displacement,
    isNewCar,
    usedTime,
    usedMileage,
    priceWithShipping,
    priceInUSD,
    isApplyLoan
  } = event

  // 验证必填字段
  if (!arrivalDate) return fail('请选择到馆日期', 400)
  if (!position) return fail('请选择职别', 400)
  if (!plannedPurchaseDate) return fail('请选择拟购车日期', 400)
  if (!String(brand || '').trim()) return fail('请填写品牌', 400)

  const userInfo = await getUserInfo(openid)
  if (!userInfo) return fail('未找到用户信息，请联系管理员', 403)

  // 根据职别查找对应的购车标准
  const standardItem = POSITION_CAR_STANDARD_MAP.find(item => item.position === position)
  if (!standardItem) return fail('职别信息不合法', 400)

  const now = Date.now()

  const recordData = {
    applicantOpenid: openid,
    applicantName: userInfo.name || '',
    applicantDepartment: userInfo.department || '',
    type: 'purchase_application',
    // 人员信息
    arrivalDate,
    termMonths: Number(termMonths) || 48,
    position,
    carStandard: standardItem.carStandard,
    carMinStandard: standardItem.carMinStandard,
    carSubsidy: standardItem.carSubsidy,
    // 拟购车辆简况
    plannedPurchaseDate,
    saleCompany: String(saleCompany || '').trim(),
    brand: String(brand || '').trim(),
    specModel: String(specModel || '').trim(),
    displacement: String(displacement || '').trim(),
    isNewCar: isNewCar !== false,
    usedTime: isNewCar !== false ? '无' : (String(usedTime || '').trim() || ''),
    usedMileage: isNewCar !== false ? '无' : (String(usedMileage || '').trim() || ''),
    priceWithShipping: String(priceWithShipping || '').trim(),
    priceInUSD: String(priceInUSD || '').trim(),
    isApplyLoan: !!isApplyLoan,
    // 审批状态
    status: 'pending_approval',
    // 时间戳
    createdAt: now,
    updatedAt: now
  }

  const res = await recordsCollection.add({ data: recordData })
  const recordId = res._id

  // 启动工作流审批
  try {
    const workflowRes = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'car_purchase_application',
        businessData: {
          recordId,
          applicantId: openid,
          applicantName: userInfo.name || '',
          applicantDepartment: userInfo.department || '',
          arrivalDate,
          termMonths: recordData.termMonths,
          position,
          carStandard: standardItem.carStandard,
          carMinStandard: standardItem.carMinStandard,
          carSubsidy: standardItem.carSubsidy,
          plannedPurchaseDate,
          saleCompany: recordData.saleCompany,
          brand: recordData.brand,
          specModel: recordData.specModel,
          displacement: recordData.displacement,
          isNewCar: recordData.isNewCar,
          usedTime: recordData.usedTime,
          usedMileage: recordData.usedMileage,
          priceWithShipping: recordData.priceWithShipping,
          priceInUSD: recordData.priceInUSD,
          isApplyLoan: recordData.isApplyLoan
        }
      }
    })

    if (workflowRes.result && workflowRes.result.code === 0) {
      // 将工单ID回写到购车记录，用于后续联动中止
      const orderId = workflowRes.result.data.orderId
      await recordsCollection.doc(recordId).update({
        data: { orderId, updatedAt: Date.now() }
      })
      return success({ recordId }, '馆内购车申请已提交，等待审批')
    } else {
      // 工作流启动失败，回滚记录状态
      await recordsCollection.doc(recordId).update({
        data: { status: 'workflow_failed', updatedAt: Date.now() }
      })
      return fail(workflowRes.result?.message || '工作流启动失败', 500)
    }
  } catch (error) {
    console.error('启动工作流失败:', error)
    await recordsCollection.doc(recordId).update({
      data: { status: 'workflow_failed', updatedAt: Date.now() }
    })
    return fail('工作流启动失败，请重试', 500)
  }
}

/**
 * 创建馆内购车借款申请记录并启动工作流
 */
async function createPurchaseLoan(openid, event) {
  const {
    arrivalDate,
    position,
    termMonths,
    carModel,
    priceInUSD,
    exchangeRate,
    isFirstResident
  } = event

  // 验证必填字段
  if (!arrivalDate) return fail('请选择赴任日期', 400)
  if (!position) return fail('请选择职别', 400)
  if (!String(carModel || '').trim()) return fail('请填写拟购车型号', 400)
  if (!Number(priceInUSD) || Number(priceInUSD) <= 0) return fail('请填写拟购车价格（美元）', 400)
  if (!Number(exchangeRate) || Number(exchangeRate) <= 0) return fail('请填写当月美元人民币比价', 400)

  const userInfo = await getUserInfo(openid)
  if (!userInfo) return fail('未找到用户信息，请联系管理员', 403)

  // 根据职别查找对应的购车补贴标准
  const standardItem = POSITION_CAR_STANDARD_MAP.find(item => item.position === position)
  if (!standardItem) return fail('职别信息不合法', 400)

  const _termMonths = Number(termMonths) || 48
  const _priceInUSD = Number(priceInUSD)
  const _exchangeRate = Number(exchangeRate)
  const _carSubsidy = standardItem.carSubsidy
  const _totalSubsidy = _carSubsidy * _termMonths
  const _isFirstResident = !!isFirstResident

  // 计算可借金额
  let _borrowableAmount = 0
  if (_isFirstResident) {
    const cap1 = _priceInUSD * 0.85
    const cap2 = _totalSubsidy / _exchangeRate
    _borrowableAmount = Math.min(cap1, cap2)
  } else {
    const cap1 = _priceInUSD * 0.50
    const cap2 = _totalSubsidy * 0.60 / _exchangeRate
    _borrowableAmount = Math.min(cap1, cap2)
  }
  // 保留两位小数
  _borrowableAmount = Math.round(_borrowableAmount * 100) / 100

  const now = Date.now()

  const recordData = {
    applicantOpenid: openid,
    applicantName: userInfo.name || '',
    applicantDepartment: userInfo.department || '',
    type: 'purchase_loan',
    // 人员信息
    arrivalDate,
    position,
    carSubsidy: _carSubsidy,
    termMonths: _termMonths,
    totalSubsidy: _totalSubsidy,
    // 购车信息
    carModel: String(carModel).trim(),
    priceInUSD: _priceInUSD,
    exchangeRate: _exchangeRate,
    isFirstResident: _isFirstResident,
    borrowableAmount: _borrowableAmount,
    // 审批状态
    status: 'pending_approval',
    // 时间戳
    createdAt: now,
    updatedAt: now
  }

  const res = await recordsCollection.add({ data: recordData })
  const recordId = res._id

  // 启动工作流审批
  try {
    const workflowRes = await cloud.callFunction({
      name: 'workflowEngine',
      data: {
        action: 'submitOrder',
        orderType: 'car_purchase_loan',
        businessData: {
          recordId,
          applicantId: openid,
          applicantName: userInfo.name || '',
          applicantDepartment: userInfo.department || '',
          arrivalDate,
          position,
          carSubsidy: _carSubsidy,
          termMonths: _termMonths,
          totalSubsidy: _totalSubsidy,
          carModel: recordData.carModel,
          priceInUSD: _priceInUSD,
          exchangeRate: _exchangeRate,
          isFirstResident: _isFirstResident,
          borrowableAmount: _borrowableAmount
        }
      }
    })

    if (workflowRes.result && workflowRes.result.code === 0) {
      const orderId = workflowRes.result.data.orderId
      await recordsCollection.doc(recordId).update({
        data: { orderId, updatedAt: Date.now() }
      })
      return success({ recordId }, '购车借款申请已提交，等待审批')
    } else {
      await recordsCollection.doc(recordId).update({
        data: { status: 'workflow_failed', updatedAt: Date.now() }
      })
      return fail(workflowRes.result?.message || '工作流启动失败', 500)
    }
  } catch (error) {
    console.error('启动工作流失败:', error)
    await recordsCollection.doc(recordId).update({
      data: { status: 'workflow_failed', updatedAt: Date.now() }
    })
    return fail('工作流启动失败，请重试', 500)
  }
}

/**
 * 获取职别选项列表
 */
async function getPositionOptions() {
  return success({
    positions: POSITION_OPTIONS,
    standardMap: POSITION_CAR_STANDARD_MAP
  })
}

// ========== 主入口 ==========
exports.main = async (event, context) => {
  const { action } = event
  console.log(`carPurchase action: ${action}`)

  // 统一获取用户身份（注意：wxContext 中 OPENID 为大写）
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      case 'create':
        return await createRecord(openid, event)
      case 'createPurchaseApplication':
        return await createPurchaseApplication(openid, event)
      case 'createPurchaseLoan':
        return await createPurchaseLoan(openid, event)
      case 'getPositionOptions':
        return await getPositionOptions()
      case 'getMyList':
        return await getMyList(openid, event)
      case 'getAllList':
        return await getAllList(openid, event)
      case 'getDetail':
        return await getDetail(openid, event)
      case 'toggleStep':
        return await toggleStep(openid, event)
      case 'uploadAttachments':
        return await uploadAttachments(openid, event)
      case 'updateStepRemark':
        return await updateStepRemark(openid, event)
      case 'deleteRecord':
        return await deleteRecord(openid, event)
      default:
        return fail(`未知操作: ${action}`, 400)
    }
  } catch (error) {
    console.error('carPurchase 云函数执行失败:', error)
    return fail(error.message || '服务异常', 500)
  }
}
