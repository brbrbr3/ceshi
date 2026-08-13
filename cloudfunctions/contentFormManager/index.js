/**
 * 信息发布系统云函数
 *
 * 将首页「通知公告」升级为统一的「信息发布」系统，通过问卷星式控件自由组合，
 * 实现公告（announcement）、问卷（questionnaire）、副食（side_dish）、
 * 活动（activity）、答题（quiz）五种形态的一体化发布与填写。
 *
 * 数据模型：
 *   - content_forms：内容表单主表，blocks[] 数组表达控件
 *   - content_form_submissions：提交记录，一人一条（upsert）
 *
 * action 列表：
 *   - create:          创建表单（发布或暂存 draft）
 *   - update:          更新表单
 *   - delete:          删除表单（级联删除提交记录）
 *   - close:           关闭表单
 *   - list:            分页列表（支持 tag 筛选、目标角色可见性过滤）
 *   - get:             详情（含当前用户提交状态）
 *   - submit:          提交/修改答案（一人一条 upsert，校验截止/必填/上限）
 *   - cancelSubmit:    取消提交
 *   - listSubmissions: 提交者列表（含 answers 明细，发布者/管理员可见）
 *   - getStats:        统计聚合（单选/多选/判断计数、副食汇总、报名名单）
 */

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 集合引用（集中定义）
const formsCollection = db.collection('content_forms')
const submissionsCollection = db.collection('content_form_submissions')
const usersCollection = db.collection('office_users')

// 合法 tag
const VALID_TAGS = ['announcement', 'questionnaire', 'side_dish', 'activity', 'quiz']

// 合法控件类型
const VALID_BLOCK_TYPES = ['text', 'radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity']

// 可发布角色（馆员及以上）
const PUBLISH_ROLES = ['馆领导', '馆员']

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data !== undefined ? data : {} }
}

function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

/**
 * 获取当前用户信息（office_users）
 */
async function getUser(openid) {
  if (!openid) return null
  try {
    const res = await usersCollection.where({ openid }).limit(1).get()
    return res.data && res.data.length > 0 ? res.data[0] : null
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return null
  }
}

/**
 * 判断用户是否可发布
 * 规则：管理员、部门负责人、馆领导、馆员可发布
 */
function canPublish(user) {
  if (!user) return false
  if (user.isAdmin) return true
  if (user.isDepartmentHead) return true
  return PUBLISH_ROLES.includes(user.role)
}

/**
 * 判断用户是否为某表单的创建者
 */
function isCreator(form, openid) {
  return !!(form && (form._openid === openid || form.openid === openid))
}

/**
 * 判断用户是否可填报（targetRoles 限定填报角色，管理员豁免）
 */
function canSubmitForm(form, user) {
  if (!form) return false
  const targetRoles = Array.isArray(form.targetRoles) ? form.targetRoles : []
  if (targetRoles.length === 0) return true
  if (user && user.isAdmin) return true
  return targetRoles.includes(user ? user.role : '')
}

/**
 * 生成短随机 id
 */
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 校验并规范化 blocks
 * @returns {string|null} 错误信息，null 表示通过
 */
function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return '控件数据格式错误'
  }

  const ids = new Set()
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (!b || typeof b !== 'object') {
      return `第${i + 1}个控件格式错误`
    }
    if (!b.type || !VALID_BLOCK_TYPES.includes(b.type)) {
      return `第${i + 1}个控件类型无效`
    }
    if (!b.id) {
      b.id = genId('b')
    }
    if (ids.has(b.id)) {
      return '存在重复的控件 ID'
    }
    ids.add(b.id)

    // 必填项布尔归一化
    b.required = !!b.required

    // 选择题需要选项
    if (['radio', 'checkbox', 'judge'].includes(b.type)) {
      if (!Array.isArray(b.options) || b.options.length < 2) {
        return `控件「${b.title || b.type}」至少需要 2 个选项`
      }
      const seen = new Set()
      for (const opt of b.options) {
        if (!opt || !String(opt).trim()) {
          return `控件「${b.title || b.type}」存在空选项`
        }
        if (seen.has(String(opt).trim())) {
          return `控件「${b.title || b.type}」存在重复选项`
        }
        seen.add(String(opt).trim())
      }
    }

    // 副食控件需要类别
    if (b.type === 'side_dish') {
      if (!Array.isArray(b.categories) || b.categories.length === 0) {
        return `控件「${b.title || '副食'}」至少需要 1 个类别`
      }
      for (const cat of b.categories) {
        if (!cat.name || !String(cat.name).trim()) {
          return `副食控件「${b.title || ''}」存在空类别名称`
        }
        if (!cat.maxCount || cat.maxCount < 1) {
          return `副食类别「${cat.name}」的最大份数至少为 1`
        }
        if (!cat.id) {
          cat.id = genId('cat')
        }
      }
    }

    // 活动控件需要分组（可选）和人数上限
    if (b.type === 'activity') {
      if (Array.isArray(b.groups)) {
        b.groups = b.groups.filter(g => g && String(g).trim())
      } else {
        b.groups = []
      }
      b.maxRegistrations = b.maxRegistrations && b.maxRegistrations > 0 ? b.maxRegistrations : null
    }
  }

  return null
}

// ==================== 创建表单 ====================

async function createForm(openid, user, params) {
  try {
    if (!canPublish(user)) {
      return fail('仅馆员及以上角色可发布信息', 403)
    }

    const { title, description = '', tag, deadline = null, blocks = [], targetRoles = [], isTargetOnlyVisible = false, isAnonymous = false, maxSubmissions = 1, status = 'published' } = params

    if (!title || !title.trim()) {
      return fail('请输入标题', 400)
    }

    if (!tag || !VALID_TAGS.includes(tag)) {
      return fail('请选择信息类型（tag）', 400)
    }

    const blockErr = normalizeBlocks(blocks)
    if (blockErr) {
      return fail(blockErr, 400)
    }

    // 校验截止时间（可为 null）
    if (deadline !== null && deadline !== undefined && (typeof deadline !== 'number' || isNaN(deadline))) {
      return fail('截止时间格式错误', 400)
    }

    const now = Date.now()
    const formStatus = status === 'draft' ? 'draft' : 'published'

    const newForm = {
      _openid: openid,
      title: title.trim(),
      description: description || '',
      tag,
      deadline: deadline || null,
      blocks,
      targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
      isTargetOnlyVisible: !!isTargetOnlyVisible,
      isAnonymous: !!isAnonymous,
      maxSubmissions: Math.max(1, Number(maxSubmissions) || 1),
      status: formStatus,
      readUsers: [],
      submissionCount: 0,
      publishedAt: formStatus === 'published' ? now : null,
      createdByName: user.name || '',
      createdAt: now,
      updatedAt: now
    }

    const addRes = await formsCollection.add({ data: newForm })
    newForm._id = addRes._id

    return success(newForm, formStatus === 'published' ? '发布成功' : '暂存成功')
  } catch (error) {
    console.error('创建表单失败:', error)
    return fail(error.message || '创建失败')
  }
}

// ==================== 更新表单 ====================

async function updateForm(openid, user, params) {
  try {
    const { formId, ...rest } = params

    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    if (!canPublish(user) || (!isCreator(form, openid) && !user.isAdmin)) {
      return fail('仅创建者可编辑该表单', 403)
    }

    const updateData = {}
    if (rest.title !== undefined) {
      if (!rest.title || !rest.title.trim()) {
        return fail('请输入标题', 400)
      }
      updateData.title = rest.title.trim()
    }
    if (rest.description !== undefined) {
      updateData.description = rest.description || ''
    }
    if (rest.tag !== undefined) {
      if (!VALID_TAGS.includes(rest.tag)) {
        return fail('请选择信息类型（tag）', 400)
      }
      updateData.tag = rest.tag
    }
    if (rest.blocks !== undefined) {
      const blockErr = normalizeBlocks(rest.blocks)
      if (blockErr) {
        return fail(blockErr, 400)
      }
      updateData.blocks = rest.blocks
    }
    if (rest.deadline !== undefined) {
      if (rest.deadline !== null && (typeof rest.deadline !== 'number' || isNaN(rest.deadline))) {
        return fail('截止时间格式错误', 400)
      }
      updateData.deadline = rest.deadline || null
    }
    if (rest.targetRoles !== undefined) {
      updateData.targetRoles = Array.isArray(rest.targetRoles) ? rest.targetRoles : []
    }
    if (rest.isTargetOnlyVisible !== undefined) {
      updateData.isTargetOnlyVisible = !!rest.isTargetOnlyVisible
    }
    if (rest.isAnonymous !== undefined) {
      updateData.isAnonymous = !!rest.isAnonymous
    }
    if (rest.maxSubmissions !== undefined) {
      updateData.maxSubmissions = Math.max(1, Number(rest.maxSubmissions) || 1)
    }

    const now = Date.now()
    updateData.updatedAt = now

    // 暂存 → 发布：补发 publishedAt
    if (rest.status === 'published' && form.status === 'draft') {
      updateData.status = 'published'
      updateData.publishedAt = now
    } else if (rest.status === 'draft' && form.status === 'published') {
      // 已发布表单不允许降级为草稿
      return fail('已发布的信息不能降级为草稿', 400)
    }

    await formsCollection.doc(formId).update({ data: updateData })

    return success({ _id: formId, ...updateData }, '更新成功')
  } catch (error) {
    console.error('更新表单失败:', error)
    return fail(error.message || '更新失败')
  }
}

// ==================== 删除表单 ====================

async function deleteForm(openid, user, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    if (!canPublish(user) || (!isCreator(form, openid) && !user.isAdmin)) {
      return fail('仅创建者可删除该表单', 403)
    }

    await formsCollection.doc(formId).remove()

    // 级联删除提交记录
    await deleteSubmissionsByFormId(formId)

    return success({ _id: formId }, '删除成功')
  } catch (error) {
    console.error('删除表单失败:', error)
    return fail(error.message || '删除失败')
  }
}

/**
 * 删除某表单的全部提交记录（分页删除，避免单次超限）
 */
async function deleteSubmissionsByFormId(formId) {
  try {
    const MAX_BATCH = 100
    let removed = 0
    // 先查询所有 id
    const allRes = await submissionsCollection.where({ formId }).limit(1000).get()
    const ids = (allRes.data || []).map(s => s._id)
    for (let i = 0; i < ids.length; i += MAX_BATCH) {
      const batch = ids.slice(i, i + MAX_BATCH)
      await Promise.all(batch.map(id => submissionsCollection.doc(id).remove().catch(() => {})))
      removed += batch.length
    }
    return removed
  } catch (e) {
    console.error('删除提交记录失败:', e)
    return 0
  }
}

// ==================== 关闭表单 ====================

async function closeForm(openid, user, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    if (!canPublish(user) || (!isCreator(form, openid) && !user.isAdmin)) {
      return fail('仅创建者可关闭该表单', 403)
    }

    await formsCollection.doc(formId).update({
      data: { status: 'closed', updatedAt: Date.now() }
    })

    return success({ _id: formId }, '已关闭')
  } catch (error) {
    console.error('关闭表单失败:', error)
    return fail(error.message || '关闭失败')
  }
}

// ==================== 列表 ====================

async function listForms(openid, user, params) {
  try {
    const { page = 1, pageSize = 20, tag = 'all', scope = 'all' } = params
    const skip = (page - 1) * pageSize
    const userRole = user ? user.role : ''

    // 目标角色可见性过滤
    const visibilityCond = _.or([
      { isTargetOnlyVisible: _.neq(true) },
      { targetRoles: userRole }
    ])

    let where
    if (scope === 'mine') {
      // 我的发布（含草稿），仅发布者本人可见
      if (!openid) {
        return success({ list: [], total: 0, hasMore: false })
      }
      where = { _openid: openid }
    } else {
      // 公开列表：仅已发布/已关闭
      where = _.and([
        { status: _.in(['published', 'closed']) },
        visibilityCond
      ])
    }

    // tag 筛选
    if (tag && tag !== 'all') {
      where = _.and([where, { tag }])
    }

    const [countRes, listRes] = await Promise.all([
      formsCollection.where(where).count(),
      formsCollection.where(where).orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get()
    ])

    const list = (listRes.data || []).map(f => {
      const blocks = f.blocks || []
      const readUsers = Array.isArray(f.readUsers) ? f.readUsers : []
      return {
        _id: f._id,
        title: f.title,
        tag: f.tag,
        status: f.status,
        deadline: f.deadline || null,
        publishedAt: f.publishedAt || null,
        createdAt: f.createdAt,
        createdByName: f.createdByName || '',
        blockCount: blocks.length,
        hasFormContent: blocks.some(b => ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity'].includes(b.type)),
        submissionCount: f.submissionCount || 0,
        isClosed: f.status === 'closed' || !!(f.deadline && f.deadline < Date.now()),
        isRead: f._openid === openid || readUsers.includes(openid)
      }
    })

    return success({
      list,
      total: countRes.total,
      hasMore: skip + list.length < countRes.total
    })
  } catch (error) {
    console.error('获取表单列表失败:', error)
    return fail(error.message || '获取列表失败')
  }
}

// ==================== 详情 ====================

async function getForm(openid, user, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    // 目标角色可见性校验
    if (form.isTargetOnlyVisible && Array.isArray(form.targetRoles) && form.targetRoles.length > 0) {
      const userRole = user ? user.role : ''
      if (!canPublish(user) && !form.targetRoles.includes(userRole)) {
        return fail('该信息仅对特定角色可见', 403)
      }
    }

    // 查询当前用户提交记录
    let mySubmission = null
    if (openid) {
      const subRes = await submissionsCollection.where({ formId, _openid: openid }).limit(1).get()
      mySubmission = subRes.data && subRes.data.length > 0 ? subRes.data[0] : null
    }

    // 记录已读（发布者/管理员自身不记录）
    if (openid && !isCreator(form, openid)) {
      try {
        const readUsers = Array.isArray(form.readUsers) ? form.readUsers : []
        if (!readUsers.includes(openid)) {
          await formsCollection.doc(formId).update({
            data: { readUsers: _.addToSet(openid) }
          })
        }
      } catch (e) {
        // 已读记录失败不阻断
      }
    }

    const blocks = form.blocks || []
    return success({
      form: {
        _id: form._id,
        title: form.title,
        description: form.description || '',
        tag: form.tag,
        deadline: form.deadline || null,
        blocks,
        targetRoles: form.targetRoles || [],
        isTargetOnlyVisible: !!form.isTargetOnlyVisible,
        isAnonymous: !!form.isAnonymous,
        maxSubmissions: Math.max(1, Number(form.maxSubmissions) || 1),
        status: form.status,
        publishedAt: form.publishedAt || null,
        createdAt: form.createdAt,
        createdByName: form.createdByName || '',
        submissionCount: form.submissionCount || 0,
        readCount: (form.readUsers || []).length,
        isClosed: form.status === 'closed' || !!(form.deadline && form.deadline < Date.now())
      },
      mySubmission,
      isCreator: isCreator(form, openid),
      canPublish: canPublish(user),
      canSubmit: canSubmitForm(form, user)
    })
  } catch (error) {
    console.error('获取表单详情失败:', error)
    return fail(error.message || '获取详情失败')
  }
}

// ==================== 提交答案 ====================

/**
 * 校验单条答案是否满足控件要求
 */
function validateAnswer(block, answer) {
  const value = answer && answer.value
  if (block.required) {
    const empty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0)
    if (empty) {
      return `请填写「${block.title || block.type}」`
    }
  }
  // 非必填且为空，直接通过
  if (value === undefined || value === null || value === '') {
    return null
  }

  switch (block.type) {
    case 'radio':
    case 'judge': {
      if (typeof value !== 'string' || !(block.options || []).includes(value)) {
        return `「${block.title || block.type}」的选项无效`
      }
      break
    }
    case 'checkbox': {
      if (!Array.isArray(value)) {
        return `「${block.title || block.type}」答案格式错误`
      }
      const opts = block.options || []
      for (const v of value) {
        if (!opts.includes(v)) {
          return `「${block.title || block.type}」的选项无效`
        }
      }
      break
    }
    case 'textarea': {
      if (typeof value !== 'string') {
        return `「${block.title || block.type}」答案格式错误`
      }
      break
    }
    case 'side_dish': {
      if (!Array.isArray(value)) {
        return `「${block.title || '副食'}」答案格式错误`
      }
      const catMap = {}
      ;(block.categories || []).forEach(c => { catMap[c.id] = c })
      for (const item of value) {
        if (!item || !item.categoryId || !catMap[item.categoryId]) {
          return `「${block.title || '副食'}」存在无效类别`
        }
        if (!item.count || item.count < 1) {
          return `「${block.title || '副食'}」的份数至少为 1`
        }
        const maxAllowed = catMap[item.categoryId].maxCount * 2
        if (item.count > maxAllowed) {
          return `「${catMap[item.categoryId].name}」每人最多可订 ${maxAllowed} 份`
        }
      }
      break
    }
    case 'activity': {
      if (block.groups && block.groups.length > 0) {
        if (typeof value !== 'string' || !block.groups.includes(value)) {
          return `「${block.title || '活动'}」的分组无效`
        }
      } else if (typeof value !== 'string') {
        return `「${block.title || '活动'}」答案格式错误`
      }
      break
    }
  }
  return null
}

async function submitForm(openid, user, params) {
  try {
    const { formId, answers } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }
    if (!Array.isArray(answers)) {
      return fail('答案格式错误', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    if (form.status === 'closed') {
      return fail('该信息已关闭', 400)
    }
    if (form.status === 'draft') {
      return fail('该信息尚未发布', 400)
    }
    if (form.deadline && form.deadline < Date.now()) {
      return fail('该信息已截止', 400)
    }

    // 目标角色校验：仅 targetRoles 中的角色可填报（管理员豁免）
    if (!canSubmitForm(form, user)) {
      return fail('仅限指定角色填报', 403)
    }

    const blocks = form.blocks || []
    const answerMap = {}
    answers.forEach(a => { answerMap[a.blockId] = a })

    // 逐控件校验
    const cleanedAnswers = []
    for (const block of blocks) {
      if (block.type === 'text') continue // 说明文字块不参与填写
      const answer = answerMap[block.id]
      const err = validateAnswer(block, answer)
      if (err) {
        return fail(err, 400)
      }
      if (answer && answer.value !== undefined && answer.value !== null && answer.value !== '') {
        cleanedAnswers.push({
          blockId: block.id,
          type: block.type,
          value: answer.value
        })
      }
    }

    // 活动人数上限校验（含本次修改，避免超限）
    for (const block of blocks) {
      if (block.type === 'activity' && block.maxRegistrations) {
        const existingRes = await submissionsCollection.where({ formId, _openid: _.neq(openid) }).count()
        // 当前用户是否已报名该活动块
        const isRegistering = cleanedAnswers.some(a => a.blockId === block.id)
        const myExist = await submissionsCollection.where({ formId, _openid: openid }).limit(1).get()
        const alreadyRegistered = myExist.data && myExist.data.length > 0 &&
          (myExist.data[0].answers || []).some(a => a.blockId === block.id)

        let willRegister = existingRes.total
        if (isRegistering && !alreadyRegistered) {
          willRegister += 1
        }
        if (willRegister > block.maxRegistrations) {
          return fail(`「${block.title || '活动'}」报名人数已满`, 400)
        }
      }
    }

    const now = Date.now()
    const isAnonymous = !!form.isAnonymous
    const subData = {
      formId,
      _openid: openid,
      userName: isAnonymous ? '匿名' : (user ? user.name : ''),
      role: isAnonymous ? '' : (user ? user.role : ''),
      position: isAnonymous ? '' : (user ? (user.position || '') : ''),
      answers: cleanedAnswers,
      submittedAt: now,
      updatedAt: now
    }

    const maxSubmissions = Math.max(1, Number(form.maxSubmissions) || 1)

    // 查询该用户已有提交
    const existingRes = await submissionsCollection.where({ formId, _openid: openid }).limit(1).get()
    const existing = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0] : null

    let isNew = false
    if (maxSubmissions === 1) {
      // 一人一条 upsert
      if (existing) {
        await submissionsCollection.doc(existing._id).update({ data: subData })
      } else {
        const addRes = await submissionsCollection.add({ data: subData })
        subData._id = addRes._id
        isNew = true
      }
    } else {
      // 多次填写：校验剩余次数
      const countRes = await submissionsCollection.where({ formId, _openid: openid }).count()
      if (countRes.total >= maxSubmissions) {
        return fail(`最多可填写 ${maxSubmissions} 次，你已达到上限`, 400)
      }
      const addRes = await submissionsCollection.add({ data: subData })
      subData._id = addRes._id
      isNew = true
    }

    // 刷新提交数冗余字段
    await refreshSubmissionCount(formId)

    return success({ _id: subData._id, isNew }, isNew ? '提交成功' : '修改成功')
  } catch (error) {
    console.error('提交失败:', error)
    return fail(error.message || '提交失败')
  }
}

/**
 * 刷新表单提交数冗余字段
 */
async function refreshSubmissionCount(formId) {
  try {
    const countRes = await submissionsCollection.where({ formId }).count()
    await formsCollection.doc(formId).update({
      data: { submissionCount: countRes.total, updatedAt: Date.now() }
    })
  } catch (e) {
    console.error('刷新提交数失败:', e)
  }
}

// ==================== 取消提交 ====================

async function cancelSubmit(openid, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const existingRes = await submissionsCollection.where({ formId, _openid: openid }).limit(1).get()
    const existing = existingRes.data && existingRes.data.length > 0 ? existingRes.data[0] : null

    if (!existing) {
      return fail('未找到提交记录', 404)
    }

    await submissionsCollection.doc(existing._id).remove()
    await refreshSubmissionCount(formId)

    return success({ _id: existing._id }, '已取消提交')
  } catch (error) {
    console.error('取消提交失败:', error)
    return fail(error.message || '取消提交失败')
  }
}

// ==================== 提交者列表 ====================

async function listSubmissions(openid, user, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    // 仅创建者或管理员可查看提交明细
    if (!canPublish(user) || (!isCreator(form, openid) && !user.isAdmin)) {
      return fail('仅发布者可查看提交明细', 403)
    }

    const listRes = await submissionsCollection
      .where({ formId })
      .orderBy('submittedAt', 'desc')
      .limit(1000)
      .get()

    return success({
      form: {
        _id: form._id,
        title: form.title,
        tag: form.tag,
        blocks: form.blocks || []
      },
      list: listRes.data || [],
      total: (listRes.data || []).length
    })
  } catch (error) {
    console.error('获取提交列表失败:', error)
    return fail(error.message || '获取提交列表失败')
  }
}

// ==================== 统计 ====================

async function getStats(openid, user, params) {
  try {
    const { formId } = params
    if (!formId) {
      return fail('缺少表单 ID', 400)
    }

    const formRes = await formsCollection.doc(formId).get()
    if (!formRes.data) {
      return fail('表单不存在', 404)
    }
    const form = formRes.data

    if (!canPublish(user) || (!isCreator(form, openid) && !user.isAdmin)) {
      return fail('仅发布者可查看统计', 403)
    }

    const listRes = await submissionsCollection.where({ formId }).limit(1000).get()
    const submissions = listRes.data || []

    const blocks = (form.blocks || []).map(block => {
      const stat = buildBlockStat(block, submissions)
      return { id: block.id, type: block.type, title: block.title, ...stat }
    })

    return success({
      title: form.title,
      tag: form.tag,
      total: submissions.length,
      blocks,
      submissions
    })
  } catch (error) {
    console.error('获取统计失败:', error)
    return fail(error.message || '获取统计失败')
  }
}

/**
 * 构建单控件统计
 */
function buildBlockStat(block, submissions) {
  const answers = []
  submissions.forEach(s => {
    const a = (s.answers || []).find(x => x.blockId === block.id)
    if (a) answers.push({ userName: s.userName, value: a.value })
  })

  switch (block.type) {
    case 'radio':
    case 'judge': {
      const options = block.options || []
      const counts = {}
      options.forEach(o => { counts[o] = 0 })
      answers.forEach(a => {
        if (counts[a.value] !== undefined) counts[a.value]++
      })
      return {
        answerCount: answers.length,
        optionStats: options.map(o => ({
          option: o,
          count: counts[o] || 0,
          percent: answers.length ? Math.round(((counts[o] || 0) / answers.length) * 100) : 0
        }))
      }
    }
    case 'checkbox': {
      const options = block.options || []
      const counts = {}
      options.forEach(o => { counts[o] = 0 })
      answers.forEach(a => {
        if (Array.isArray(a.value)) {
          a.value.forEach(v => { if (counts[v] !== undefined) counts[v]++ })
        }
      })
      return {
        answerCount: answers.length,
        optionStats: options.map(o => ({
          option: o,
          count: counts[o] || 0,
          percent: answers.length ? Math.round(((counts[o] || 0) / answers.length) * 100) : 0
        }))
      }
    }
    case 'textarea': {
      return {
        answerCount: answers.length,
        textList: answers.map(a => ({ userName: a.userName, value: a.value }))
      }
    }
    case 'side_dish': {
      const catMap = {}
      ;(block.categories || []).forEach(c => { catMap[c.id] = c })
      const catCount = {}
      Object.keys(catMap).forEach(id => { catCount[id] = 0 })
      let totalCount = 0
      answers.forEach(a => {
        if (Array.isArray(a.value)) {
          a.value.forEach(item => {
            if (catCount[item.categoryId] !== undefined) {
              catCount[item.categoryId] += item.count || 0
              totalCount += item.count || 0
            }
          })
        }
      })
      return {
        answerCount: answers.length,
        totalCount,
        categoryStats: (block.categories || []).map(c => ({
          categoryId: c.id,
          categoryName: c.name,
          count: catCount[c.id] || 0,
          maxCount: c.maxCount
        }))
      }
    }
    case 'activity': {
      const groups = block.groups || []
      const groupMap = {}
      groups.forEach(g => { groupMap[g] = [] })
      const ungrouped = []
      answers.forEach(a => {
        const name = a.userName
        if (groups.length > 0) {
          if (groupMap[a.value] !== undefined) {
            groupMap[a.value].push(name)
          } else {
            ungrouped.push(name)
          }
        } else {
          ungrouped.push(name)
        }
      })
      return {
        answerCount: answers.length,
        maxRegistrations: block.maxRegistrations || null,
        groupStats: groups.map(g => ({ group: g, members: groupMap[g] || [] })),
        ungroupedMembers: ungrouped
      }
    }
    case 'text':
    default:
      return { answerCount: 0 }
  }
}

// ==================== 主入口 ====================

exports.main = async (event) => {
  const { action, params = {} } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log(`contentFormManager action: ${action}, openid: ${openid}`)

  if (!openid) {
    return fail('获取微信身份失败，请稍后重试', 401)
  }

  try {
    // 需要用户信息的 action 先查用户
    const user = await getUser(openid)

    switch (action) {
      case 'create':
        return await createForm(openid, user, params)

      case 'update':
        return await updateForm(openid, user, params)

      case 'delete':
        return await deleteForm(openid, user, params)

      case 'close':
        return await closeForm(openid, user, params)

      case 'list':
        return await listForms(openid, user, params)

      case 'get':
        return await getForm(openid, user, params)

      case 'submit':
        return await submitForm(openid, user, params)

      case 'cancelSubmit':
        return await cancelSubmit(openid, params)

      case 'listSubmissions':
        return await listSubmissions(openid, user, params)

      case 'getStats':
        return await getStats(openid, user, params)

      default:
        return fail(`未知操作: ${action}`, 400)
    }
  } catch (error) {
    console.error('contentFormManager 异常:', error)
    return fail(error.message || '服务异常，请稍后重试')
  }
}
