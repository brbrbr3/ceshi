/**
 * 信息发布系统 - 共享常量
 *
 * 定义 tag 与控件类型的展示配置，供 form-list / form-detail / form-edit /
 * form-result / form-submissions 及首页共用。
 */

// tag 类型配置
const TAG_CONFIG = {
  announcement: { key: 'announcement', label: '公告', icon: '📢', color: '#0284C7', bg: '#E0F2FE' },
  activity: { key: 'activity', label: '活动', icon: '🎉', color: '#EA580C', bg: '#FFEDD5' },
  side_dish: { key: 'side_dish', label: '副食', icon: '🍱', color: '#16A34A', bg: '#DCFCE7' },
  questionnaire: { key: 'questionnaire', label: '问卷', icon: '📊', color: '#7C3AED', bg: '#F3E8FF' },
  quiz: { key: 'quiz', label: '答题', icon: '✍️', color: '#DC2626', bg: '#FEE2E2' }
}

const TAG_LIST = [
  TAG_CONFIG.announcement,
  TAG_CONFIG.activity,
  TAG_CONFIG.side_dish,
  TAG_CONFIG.questionnaire,
  TAG_CONFIG.quiz
]

// 控件类型配置（text 为说明文字块，不参与填写）
const BLOCK_TYPE_LIST = [
  { type: 'activity', label: '活动报名', icon: '🎉', desc: '可设置分组 / 人数上限', color: '#EA580C', bg: '#FFEDD5' },
  { type: 'side_dish', label: '副食订购', icon: '🍱', desc: '支持多类别订购', color: '#16A34A', bg: '#DCFCE7' },
  { type: 'radio', label: '单选题', icon: '🔘', desc: '单选一个选项', color: '#3B82F6', bg: '#EFF6FF' },
  { type: 'checkbox', label: '多选题', icon: '☑️', desc: '多选多个选项', color: '#8B5CF6', bg: '#F3E8FF' },
  { type: 'judge', label: '判断题', icon: '⚖️', desc: '正确 / 错误', color: '#10B981', bg: '#D1FAE5' },
  { type: 'textarea', label: '简答题', icon: '✏️', desc: '自由填写文字', color: '#F59E0B', bg: '#FEF3C7' },
  { type: 'text', label: '说明文字', icon: '📝', desc: '插入说明段落', color: '#64748B', bg: '#F1F5F9' }
]

// 可填写控件类型（text 除外）
const FILLABLE_TYPES = ['radio', 'checkbox', 'judge', 'textarea', 'side_dish', 'activity']

function getTagConfig(tag) {
  return TAG_CONFIG[tag] || TAG_CONFIG.announcement
}

function getBlockTypeConfig(type) {
  return BLOCK_TYPE_LIST.find(b => b.type === type) || { type, label: type, icon: '📄', color: '#64748B', bg: '#F1F5F9' }
}

module.exports = {
  TAG_CONFIG,
  TAG_LIST,
  BLOCK_TYPE_LIST,
  FILLABLE_TYPES,
  getTagConfig,
  getBlockTypeConfig
}
