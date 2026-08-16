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

// 未读消息提醒订阅消息模板 ID（新信息发布通知）
const UNREAD_MESSAGE_TEMPLATE_ID = 'mJ1CGM8OvpgomnYy0yot4Kk8hD8S-NH06A6ZDywdpGc'

// tag → 中文标签（用于通知文案）
const TAG_LABEL = {
  announcement: '公告',
  questionnaire: '问卷',
  side_dish: '副食',
  activity: '活动',
  quiz: '答题'
}

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

      // 正确答案校验：必须存在于选项中（答题场景）
      const opts = (b.options || []).map(o => String(o).trim())
      if (b.type === 'checkbox') {
        if (!Array.isArray(b.correctAnswers)) {
          b.correctAnswers = []
        }
        b.correctAnswers = b.correctAnswers
          .map(a => String(a).trim())
          .filter(a => a && opts.includes(a))
      } else {
        const c = b.correctAnswers ? String(b.correctAnswers).trim() : ''
        b.correctAnswers = c && opts.includes(c) ? c : ''
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

/**
 * 校验并规范化 quizScore 分数设置（仅 tag==='quiz' 时使用）
 * @returns {object|null} 规范化后的 quizScore，非答题或非法时返回 null
 */
function normalizeQuizScore(qs) {
  if (!qs || typeof qs !== 'object') return null

  const scoreMode = ['total', 'byType', 'byCorrectAnswer'].includes(qs.scoreMode) ? qs.scoreMode : 'total'
  const wrongMode = ['zero', 'partial', 'deduct'].includes(qs.wrongMode) ? qs.wrongMode : 'zero'

  const result = {
    scoreMode,
    showScore: !!qs.showScore,
    wrongMode,
    allowNegative: !!qs.allowNegative,
    textareaMode: qs.textareaMode === 'ignore' ? 'ignore' : 'score'
  }

  if (scoreMode === 'total') {
    result.totalScore = Math.max(0, Number(qs.totalScore) || 100)
    result.totalAllocation = qs.totalAllocation === 'byCorrectAnswer' ? 'byCorrectAnswer' : 'byQuestion'
  } else if (scoreMode === 'byType') {
    const ts = qs.typeScores || {}
    result.typeScores = {
      radio: Math.max(0, Number(ts.radio) || 0),
      checkbox: Math.max(0, Number(ts.checkbox) || 0),
      judge: Math.max(0, Number(ts.judge) || 0),
      textarea: Math.max(0, Number(ts.textarea) || 0)
    }
  } else if (scoreMode === 'byCorrectAnswer') {
    result.correctAnswerScores = (Array.isArray(qs.correctAnswerScores) ? qs.correctAnswerScores : [])
      .map(x => ({
        blockId: x && x.blockId,
        answer: x && x.answer,
        score: Math.max(0, Number(x && x.score) || 0)
      }))
      .filter(x => x.blockId && x.answer)
  }

  return result
}

/**
 * 保留两位小数（四舍五入）
 */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * 判断是否为可评分选择题（单选/多选/判断）
 */
function isScorableChoice(type) {
  return type === 'radio' || type === 'checkbox' || type === 'judge'
}

/**
 * 获取控件的正确答案数组（统一返回字符串数组）
 */
function getCorrectAnswers(block) {
  if (block.type === 'checkbox') {
    if (Array.isArray(block.correctAnswers)) {
      return block.correctAnswers.map(a => String(a).trim()).filter(Boolean)
    }
    return block.correctAnswers ? [String(block.correctAnswers).trim()] : []
  }
  return block.correctAnswers ? [String(block.correctAnswers).trim()] : []
}

/**
 * 集合相等（忽略顺序、忽略空值）
 */
function setsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  const sa = a.map(x => String(x).trim()).sort()
  const sb = b.map(x => String(x).trim()).sort()
  return sa.every((v, i) => v === sb[i])
}

/**
 * 计算每道可评分题的满分（按 quizScore 分制）
 * @param {object} quizScore 分数设置
 * @param {Array} blocks 控件数组
 * @returns {{ [blockId]: number }} blockId -> 满分
 */
function calcFullScores(quizScore, blocks) {
  const qs = quizScore || {}
  const scoreMode = qs.scoreMode || 'total'
  const textareaMode = qs.textareaMode || 'ignore'
  const choiceBlocks = (blocks || []).filter(b => isScorableChoice(b.type))
  const textareaBlocks = (blocks || []).filter(b => b.type === 'textarea')
  const full = {}

  if (scoreMode === 'total') {
    const totalScore = Number(qs.totalScore) || 100
    const allocation = qs.totalAllocation || 'byQuestion'
    if (allocation === 'byCorrectAnswer') {
      // 按正确答案平均：先统计全部正确答案总数
      let totalCorrect = 0
      choiceBlocks.forEach(b => { totalCorrect += getCorrectAnswers(b).length })
      if (totalCorrect > 0) {
        const perCorrect = totalScore / totalCorrect
        choiceBlocks.forEach(b => { full[b.id] = round2(getCorrectAnswers(b).length * perCorrect) })
      } else {
        const per = totalScore / Math.max(1, choiceBlocks.length)
        choiceBlocks.forEach(b => { full[b.id] = round2(per) })
      }
      if (textareaMode === 'score') {
        // 简答题按「一题」均分
        const per = totalScore / Math.max(1, choiceBlocks.length + textareaBlocks.length)
        textareaBlocks.forEach(b => { full[b.id] = round2(per) })
      }
    } else {
      // 按题目平均：选择题 + 计分简答题共同均分
      const scoredCount = choiceBlocks.length + (textareaMode === 'score' ? textareaBlocks.length : 0)
      const per = totalScore / Math.max(1, scoredCount)
      choiceBlocks.forEach(b => { full[b.id] = round2(per) })
      if (textareaMode === 'score') {
        textareaBlocks.forEach(b => { full[b.id] = round2(per) })
      }
    }
  } else if (scoreMode === 'byType') {
    const typeScores = qs.typeScores || {}
    choiceBlocks.forEach(b => { full[b.id] = round2(Number(typeScores[b.type]) || 0) })
    if (textareaMode === 'score' && textareaBlocks.length > 0) {
      // 简答题分值：优先使用用户填写的 typeScores.textarea，否则回退到题型平均值
      let textareaScore = Number(typeScores.textarea) || 0
      if (!textareaScore) {
        const vals = ['radio', 'checkbox', 'judge'].map(t => Number(typeScores[t]) || 0).filter(v => v > 0)
        textareaScore = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      }
      textareaBlocks.forEach(b => { full[b.id] = round2(textareaScore) })
    }
  } else if (scoreMode === 'byCorrectAnswer') {
    const scores = Array.isArray(qs.correctAnswerScores) ? qs.correctAnswerScores : []
    choiceBlocks.forEach(b => {
      const sum = scores.filter(x => x && x.blockId === b.id).reduce((a, x) => a + (Number(x.score) || 0), 0)
      full[b.id] = round2(sum)
    })
    if (textareaMode === 'score' && textareaBlocks.length > 0) {
      // 简答题分值 = 全部正确答案分值的平均
      const all = scores.map(x => Number(x && x.score) || 0).filter(v => v > 0)
      const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0
      textareaBlocks.forEach(b => { full[b.id] = round2(avg) })
    }
  }

  return full
}

/**
 * 评分：计算单条提交的每题得分与总分
 * @param {object} quizScore 分数设置
 * @param {Array} blocks 控件数组
 * @param {Array} answers 提交答案数组 [{blockId, type, value}]
 * @returns {{ totalScore: number, details: Array }}
 */
function scoreQuiz(quizScore, blocks, answers) {
  const qs = quizScore || {}
  const wrongMode = qs.wrongMode || 'zero'
  const allowNegative = !!qs.allowNegative
  const textareaMode = qs.textareaMode || 'ignore'
  const full = calcFullScores(quizScore, blocks)
  const answerMap = {}
  ;(answers || []).forEach(a => { answerMap[a.blockId] = a })

  const details = []
  let total = 0

  ;(blocks || []).forEach(b => {
    if (isScorableChoice(b.type)) {
      const fullScore = full[b.id] !== undefined ? full[b.id] : 0
      const corrects = getCorrectAnswers(b)
      const ans = answerMap[b.id]
      const answer = ans ? ans.value : undefined
      let score = 0
      let isCorrect = false

      if (b.type === 'checkbox') {
        const selected = Array.isArray(answer) ? answer.map(x => String(x).trim()) : []
        if (wrongMode === 'zero') {
          isCorrect = setsEqual(selected, corrects)
          score = isCorrect ? fullScore : 0
        } else if (wrongMode === 'deduct') {
          isCorrect = setsEqual(selected, corrects)
          score = isCorrect ? fullScore : -fullScore
        } else {
          // partial：按回答中正确/错误选项算分
          const opts = (b.options || []).map(o => String(o).trim())
          const wrongOptions = opts.filter(o => !corrects.includes(o))
          const perCorrect = corrects.length > 0 ? fullScore / corrects.length : 0
          const perWrong = wrongOptions.length > 0 ? fullScore / wrongOptions.length : 0
          let s = 0
          selected.forEach(v => {
            if (corrects.includes(v)) s += perCorrect
            else s -= perWrong
          })
          score = round2(s)
          isCorrect = setsEqual(selected, corrects)
          if (score > fullScore) score = fullScore
        }
      } else {
        // radio / judge：单选/判断，仅一个选项
        const selectedVal = answer !== undefined && answer !== null ? String(answer).trim() : ''
        isCorrect = corrects.length > 0 && selectedVal === corrects[0]
        if (wrongMode === 'zero') {
          score = isCorrect ? fullScore : 0
        } else {
          // deduct 或 partial：单选答错整题扣分
          score = isCorrect ? fullScore : -fullScore
        }
      }

      if (!allowNegative && score < 0) score = 0
      score = round2(score)
      total += score
      details.push({
        blockId: b.id,
        title: b.title || b.type,
        type: b.type,
        fullScore: round2(fullScore),
        score,
        correct: !!isCorrect
      })
    } else if (b.type === 'textarea' && textareaMode === 'score') {
      // 简答题：填写即得分
      const fullScore = full[b.id] !== undefined ? full[b.id] : 0
      const ans = answerMap[b.id]
      const answer = ans ? ans.value : ''
      const filled = typeof answer === 'string' && answer.trim() !== ''
      const score = filled ? fullScore : 0
      total += score
      details.push({
        blockId: b.id,
        title: b.title || b.type,
        type: b.type,
        fullScore: round2(fullScore),
        score: round2(score),
        correct: filled
      })
    }
  })

  return {
    totalScore: round2(total),
    details
  }
}

// ==================== 创建表单 ====================

/**
 * 截断文本（微信 thing 类型限制 20 字）
 */
function truncateText(text, len) {
  if (!text) return ''
  const max = len || 20
  const str = String(text)
  return str.length > max ? str.substring(0, max) : str
}

/**
 * 获取本地时间字符串（UTC-3）
 */
function formatLocalTime(ts) {
  const timezoneOffset = -3
  const local = new Date(ts + timezoneOffset * 3600000)
  const p = n => String(n).padStart(2, '0')
  return `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())} ${p(local.getHours())}:${p(local.getMinutes())}`
}

/**
 * 新信息发布通知：站内通知 + 微信订阅消息（盲发，失败仅记日志）
 * 收件人：targetRoles 非空 → 匹配角色；为空 → 全体已批准用户
 */
async function notifyFormPublish(form, publisherName) {
  try {
    const tagLabel = TAG_LABEL[form.tag] || '信息'
    const msgType = truncateText(`新「${tagLabel}」通知`)
    const msgContent = truncateText(form.title || '')
    const remark = truncateText(`${publisherName || '管理员'}发布了新的「${tagLabel}」，点击查看`)
    // 站内通知内容（不截断，含完整标题）
    const appContent = `${publisherName || '管理员'}发布了「${form.title || ''}」，点击查看`
    const page = `pages/office/form/form-detail/form-detail?id=${form._id}`
    const timeStr = formatLocalTime(Date.now())

    // 解析收件人
    const targetRoles = Array.isArray(form.targetRoles) ? form.targetRoles : []
    const where = { status: 'approved' }
    if (targetRoles.length > 0) {
      where.role = _.in(targetRoles)
    }

    const batchSize = 100
    let offset = 0
    let totalSent = 0
    let totalFailed = 0

    while (true) {
      const res = await usersCollection.where(where).skip(offset).limit(batchSize).get()
      if (!res.data || res.data.length === 0) break

      for (const userDoc of res.data) {
        // 站内通知
        try {
          await db.collection('notifications').add({
            data: {
              openid: userDoc.openid,
              read: false,
              createdAt: Date.now(),
              type: 'content_form',
              title: `新「${tagLabel}」通知`,
              content: appContent,
              formId: form._id
            }
          })
        } catch (e) {
          console.warn('[信息发布通知] 站内通知写入失败:', e.message)
        }

        // 微信订阅消息（盲发）
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: userDoc.openid,
            templateId: UNREAD_MESSAGE_TEMPLATE_ID,
            page,
            data: {
              thing7: { value: '系统' },
              time2: { value: timeStr },
              thing6: { value: msgType },
              thing3: { value: msgContent },
              thing4: { value: remark }
            }
          })
          totalSent++
        } catch (error) {
          const errcode = error.errcode || error.errCode || 'unknown'
          const errmsg = error.errmsg || error.errMsg || error.message || JSON.stringify(error)
          console.warn('[信息发布通知] 订阅消息发送失败:', JSON.stringify({ openid: userDoc.openid, errcode, errmsg }))
          totalFailed++
        }
      }

      offset += batchSize
      if (res.data.length < batchSize) break
    }

    console.log(`[信息发布通知] 推送完成: 成功 ${totalSent} 失败 ${totalFailed}`)
  } catch (error) {
    console.error('[信息发布通知] 推送异常:', error)
  }
}

async function createForm(openid, user, params) {
  try {
    if (!canPublish(user)) {
      return fail('仅馆员及以上角色可发布信息', 403)
    }

    const { title, description = '', tag, deadline = null, blocks = [], targetRoles = [], isTargetOnlyVisible = false, isAnonymous = false, maxSubmissions = 1, status = 'published', quizScore = null } = params

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
      quizScore: tag === 'quiz' ? normalizeQuizScore(quizScore) : null,
      readUsers: [],
      submissionCount: 0,
      publishedAt: formStatus === 'published' ? now : null,
      createdByName: user.name || '',
      createdAt: now,
      updatedAt: now
    }

    const addRes = await formsCollection.add({ data: newForm })
    newForm._id = addRes._id

    // 发布成功 → 异步推送通知（不阻塞主流程）
    if (formStatus === 'published') {
      //notifyFormPublish(newForm, user.name || '').catch(err => {        console.error('[信息发布通知] 推送失败:', err)      })
    }

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
    if (rest.quizScore !== undefined) {
      // 依据本次更新后的 tag 决定是否序列化 quizScore
      const effectiveTag = rest.tag !== undefined ? rest.tag : form.tag
      updateData.quizScore = effectiveTag === 'quiz' ? normalizeQuizScore(rest.quizScore) : null
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

    // 草稿 → 发布：异步推送通知（编辑已发布表单不重发）
    if (rest.status === 'published' && form.status === 'draft') {
      const publishedForm = { ...form, ...updateData, _id: formId }
      notifyFormPublish(publishedForm, user.name || '').catch(err => {
        console.error('[信息发布通知] 推送失败:', err)
      })
    }

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

    // 活动控件信息（formId → 控件元数据），用于统计真实报名人数
    const activityMeta = {}
    const list = (listRes.data || []).map(f => {
      const blocks = f.blocks || []
      const readUsers = Array.isArray(f.readUsers) ? f.readUsers : []
      // 提取所有活动控件（支持一个表单多个活动）
      const activityBlocks = blocks.filter(b => b.type === 'activity')
      if (activityBlocks.length > 0) {
        activityMeta[f._id] = activityBlocks.map(b => ({
          blockId: b.id,
          maxRegistrations: b.maxRegistrations || null,
          hasGroups: !!(b.groups && b.groups.length > 0)
        }))
      }
      // 仅单个活动控件时展示「上限 X 人」
      const maxRegistrations = activityBlocks.length === 1
        ? (activityBlocks[0].maxRegistrations || null)
        : null
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
        maxRegistrations,
        targetRoles: Array.isArray(f.targetRoles) ? f.targetRoles : [],
        isClosed: f.status === 'closed' || !!(f.deadline && f.deadline < Date.now()),
        isRead: f._openid === openid || readUsers.includes(openid)
      }
    })

    // 统计活动条目真实报名人数（多人报名 = 姓名总数）
    const activityFormIds = Object.keys(activityMeta)
    if (activityFormIds.length > 0) {
      const subsRes = await submissionsCollection
        .where({ formId: _.in(activityFormIds) })
        .field({ formId: true, answers: true })
        .limit(1000)
        .get()
      const subs = subsRes.data || []

      list.forEach(it => {
        const metas = activityMeta[it._id]
        if (!metas) return
        let totalRegCount = 0
        let fullBlocks = 0
        metas.forEach(meta => {
          let count = 0
          subs.forEach(s => {
            if (s.formId !== it._id) return
            const ans = (s.answers || []).find(a => a.blockId === meta.blockId)
            if (!ans) return
            if (meta.hasGroups) {
              if (ans.value !== undefined && ans.value !== null && ans.value !== '') count++
            } else if (Array.isArray(ans.value)) {
              count += ans.value.filter(Boolean).length
            } else if (ans.value === '报名') {
              count++
            }
          })
          totalRegCount += count
          if (meta.maxRegistrations && count >= meta.maxRegistrations) fullBlocks++
        })
        it.registrationCount = totalRegCount
        it.isFull = fullBlocks === metas.length       // 所有活动都报满
        it.partialFull = !it.isFull && fullBlocks > 0 // 部分活动报满
      })
    }

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

    let blocks = form.blocks || []
    const isQuiz = form.tag === 'quiz'
    const quizScore = isQuiz ? (form.quizScore || null) : null
    const maxSubmissions = Math.max(1, Number(form.maxSubmissions) || 1)

    // 查询当前用户全部提交（按提交时间倒序）
    let mySubmission = null
    let quizResult = null
    if (openid) {
      const subRes = await submissionsCollection
        .where({ formId, _openid: openid })
        .orderBy('submittedAt', 'desc')
        .limit(1000)
        .get()
      const mySubs = subRes.data || []
      if (isQuiz) {
        const submittedCount = mySubs.length
        const remainingCount = Math.max(0, maxSubmissions - submittedCount)
        const isExhausted = remainingCount <= 0
        mySubmission = submittedCount > 0 ? mySubs[0] : null
        let lastScore = null
        if (mySubmission && quizScore) {
          lastScore = scoreQuiz(quizScore, blocks, mySubmission.answers).totalScore
        }
        quizResult = {
          submittedCount,
          maxSubmissions,
          remainingCount,
          isExhausted,
          lastScore
        }
      } else {
        mySubmission = mySubs.length > 0 ? mySubs[0] : null
      }
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

    // 统计各活动控件的已报名人数与名单（活动块需展示已报名人员）
    const activityBlocks = blocks.filter(b => b.type === 'activity')
    if (activityBlocks.length > 0) {
      try {
        const allSubs = await submissionsCollection.where({ formId }).limit(1000).get()
        const submissions = allSubs.data || []
        blocks = blocks.map(b => {
          if (b.type !== 'activity') return b
          const hasGroups = b.groups && b.groups.length > 0
          let count = 0
          const names = []
          submissions.forEach(s => {
            const ans = (s.answers || []).find(a => a.blockId === b.id)
            if (!ans) return
            if (hasGroups) {
              if (ans.value !== undefined && ans.value !== null && ans.value !== '') count++
            } else if (Array.isArray(ans.value)) {
              ans.value.forEach(n => { if (n) { count++; names.push(String(n)) } })
            } else if (ans.value === '报名') {
              count++
              if (s.userName) names.push(s.userName) // 兼容旧数据
            }
          })
          return { ...b, registrationCount: count, registeredNames: names }
        })
      } catch (e) {
        console.error('统计报名人数失败:', e)
      }
    }

    // 答题表单：showScore 开启时，为题干注入分值展示文本
    if (quizScore && quizScore.showScore) {
      const fullScores = calcFullScores(quizScore, blocks)
      blocks = blocks.map(b => {
        const fs = fullScores[b.id]
        if (fs !== undefined && (isScorableChoice(b.type) || b.type === 'textarea')) {
          return { ...b, scoreText: `${fs} 分` }
        }
        return b
      })
    }

    // 答题期间隐藏正确答案：次数未用完时剥离 correctAnswers（防作弊）
    if (isQuiz && quizResult && !quizResult.isExhausted) {
      blocks = blocks.map(b => {
        if (isScorableChoice(b.type) && b.correctAnswers !== undefined) {
          const copy = { ...b }
          delete copy.correctAnswers
          return copy
        }
        return b
      })
    }

    return success({
      form: {
        _id: form._id,
        title: form.title,
        description: form.description || '',
        tag: form.tag,
        deadline: form.deadline || null,
        blocks,
        quizScore,
        targetRoles: form.targetRoles || [],
        isTargetOnlyVisible: !!form.isTargetOnlyVisible,
        isAnonymous: !!form.isAnonymous,
        maxSubmissions,
        status: form.status,
        publishedAt: form.publishedAt || null,
        createdAt: form.createdAt,
        createdByName: form.createdByName || '',
        submissionCount: form.submissionCount || 0,
        readCount: (form.readUsers || []).length,
        isClosed: form.status === 'closed' || !!(form.deadline && form.deadline < Date.now())
      },
      mySubmission,
      quizResult,
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
      } else {
        // 无分组：支持多人报名，value 为姓名数组
        if (!Array.isArray(value) || value.length === 0) {
          return `「${block.title || '活动'}」请至少填写一位报名人`
        }
        for (const name of value) {
          if (typeof name !== 'string' || !name.trim()) {
            return `「${block.title || '活动'}」报名人姓名无效`
          }
        }
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
      if (block.type !== 'activity' || !block.maxRegistrations) continue
      const hasGroups = block.groups && block.groups.length > 0

      // 本次提交该控件的报名人数
      const myAns = cleanedAnswers.find(a => a.blockId === block.id)
      let myCount = 0
      if (myAns) {
        myCount = hasGroups ? 1 : (Array.isArray(myAns.value) ? myAns.value.length : 1)
      }

      // 其他用户已报名人数（姓名数或记录数）
      const otherSubs = await submissionsCollection.where({ formId, _openid: _.neq(openid) }).field({ answers: true }).limit(1000).get()
      let otherCount = 0
      ;(otherSubs.data || []).forEach(s => {
        const ans = (s.answers || []).find(a => a.blockId === block.id)
        if (!ans) return
        if (hasGroups) {
          if (ans.value !== undefined && ans.value !== null && ans.value !== '') otherCount += 1
        } else if (Array.isArray(ans.value)) {
          otherCount += ans.value.length
        } else if (ans.value === '报名') {
          otherCount += 1 // 兼容旧数据（字符串「报名」）
        }
      })

      if (otherCount + myCount > block.maxRegistrations) {
        return fail(`「${block.title || '活动'}」报名人数已满`, 400)
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
      department: isAnonymous ? '' : (user ? (user.department || '') : ''),
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

// ==================== 答题对比（查看正确答案） ====================

/**
 * 获取答题表单的正确答案与用户最后一次作答的对比
 * 仅当用户答题次数用完（isExhausted）后才可查看，防止答题期间泄露答案
 */
async function getQuizCompare(openid, user, params) {
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

    if (form.tag !== 'quiz') {
      return fail('该信息不是答题类型', 400)
    }

    // 查询当前用户全部提交（按提交时间倒序）
    const subRes = await submissionsCollection
      .where({ formId, _openid: openid })
      .orderBy('submittedAt', 'desc')
      .limit(1000)
      .get()
    const mySubs = subRes.data || []
    if (mySubs.length === 0) {
      return fail('您尚未作答', 404)
    }

    const maxSubmissions = Math.max(1, Number(form.maxSubmissions) || 1)
    const submittedCount = mySubs.length
    const remainingCount = Math.max(0, maxSubmissions - submittedCount)

    // 次数未用完时不允许查看正确答案（防作弊）
    if (remainingCount > 0) {
      return fail('答题未完成，暂不可查看正确答案', 403)
    }

    const lastSubmission = mySubs[0]
    const quizScore = form.quizScore || null
    let blocks = form.blocks || []

    // showScore 开启时注入分值文本
    if (quizScore && quizScore.showScore) {
      const fullScores = calcFullScores(quizScore, blocks)
      blocks = blocks.map(b => {
        const fs = fullScores[b.id]
        if (fs !== undefined && (isScorableChoice(b.type) || b.type === 'textarea')) {
          return { ...b, scoreText: `${fs} 分` }
        }
        return b
      })
    }

    const score = quizScore
      ? scoreQuiz(quizScore, blocks, lastSubmission.answers)
      : { totalScore: 0, details: [] }

    return success({
      form: {
        _id: form._id,
        title: form.title,
        description: form.description || '',
        tag: form.tag,
        isAnonymous: !!form.isAnonymous
      },
      blocks,
      lastSubmission: {
        _id: lastSubmission._id,
        submittedAt: lastSubmission.submittedAt,
        answers: lastSubmission.answers || []
      },
      score
    })
  } catch (error) {
    console.error('获取答题对比失败:', error)
    return fail(error.message || '获取答题对比失败')
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

    const blocks = form.blocks || []
    const quizScore = form.tag === 'quiz' ? (form.quizScore || null) : null
    const list = (listRes.data || []).map(s => {
      if (quizScore) {
        return { ...s, score: scoreQuiz(quizScore, blocks, s.answers) }
      }
      return s
    })

    return success({
      form: {
        _id: form._id,
        title: form.title,
        tag: form.tag,
        blocks,
        quizScore,
        maxSubmissions: Math.max(1, Number(form.maxSubmissions) || 1)
      },
      list,
      total: list.length
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
        } else if (Array.isArray(a.value)) {
          a.value.forEach(n => { if (n) ungrouped.push(String(n)) })
        } else if (a.value === '报名') {
          ungrouped.push(name) // 兼容旧数据
        } else if (a.value) {
          ungrouped.push(String(a.value))
        }
      })
      const groupStats = groups.map(g => ({ group: g, members: groupMap[g] || [] }))
      let registrationCount = ungrouped.length
      groupStats.forEach(g => { registrationCount += g.members.length })
      return {
        answerCount: answers.length,
        registrationCount,
        maxRegistrations: block.maxRegistrations || null,
        groupStats,
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

      case 'getQuizCompare':
        return await getQuizCompare(openid, user, params)

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
