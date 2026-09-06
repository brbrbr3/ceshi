/**
 * 馆内动态系统 - 共享常量（只从缓存读取）
 *
 * 所有 tag 与控件类型的配置均由后端 sys_config 集合（FORM_TAG_LIST /
 * FORM_BLOCK_TYPE_LIST / FORM_TAG_BLOCKS / FORM_FILLABLE_TYPES）下发，
 * 并经 app 缓存（app-constants-cache）供各页面读取。
 *
 * 本模块仅从缓存同步读取，读不到返回空数组 / 空对象 / 兜底展示配置，
 * 不再维护本地默认值、也不再触发云函数拉取。
 */

function getCachedConstants() {
  try {
    const app = getApp()
    return (app && app.getAllConstantsOnlyFromCache()) || null
  } catch (e) {
    return null
  }
}

// tag 类型列表（后端 FORM_TAG_LIST）
function getTagList() {
  const c = getCachedConstants()
  return (c && Array.isArray(c.FORM_TAG_LIST)) ? c.FORM_TAG_LIST : []
}

// 控件类型列表（后端 FORM_BLOCK_TYPE_LIST）
function getBlockTypeList() {
  const c = getCachedConstants()
  return (c && Array.isArray(c.FORM_BLOCK_TYPE_LIST)) ? c.FORM_BLOCK_TYPE_LIST : []
}

// 可填写控件类型（后端 FORM_FILLABLE_TYPES）
function getFillableTypes() {
  const c = getCachedConstants()
  return (c && Array.isArray(c.FORM_FILLABLE_TYPES)) ? c.FORM_FILLABLE_TYPES : []
}

// tag → 可用控件映射（后端 FORM_TAG_BLOCKS）
function getTagBlocks() {
  const c = getCachedConstants()
  return (c && c.FORM_TAG_BLOCKS && typeof c.FORM_TAG_BLOCKS === 'object') ? c.FORM_TAG_BLOCKS : {}
}

// 单个 tag 配置，读不到返回兜底展示配置
function getTagConfig(tag) {
  const cfg = getTagList().find(t => t.key === tag)
  return cfg || { key: tag, label: tag, icon: '📄', color: '#64748B', bg: '#F1F5F9' }
}

// 单个控件类型配置，读不到返回兜底展示配置
function getBlockTypeConfig(type) {
  const cfg = getBlockTypeList().find(b => b.type === type)
  return cfg || { type, label: type, icon: '📄', color: '#64748B', bg: '#F1F5F9' }
}

// 根据 tag 过滤可用控件（list 可选，默认用缓存中的 BLOCK_TYPE_LIST）
function getBlocksByTag(tag, list) {
  const blockList = list || getBlockTypeList()
  const allowed = getTagBlocks()[tag] || []
  return blockList.filter(b => allowed.indexOf(b.type) >= 0)
}

module.exports = {
  getTagList,
  getBlockTypeList,
  getFillableTypes,
  getTagBlocks,
  getTagConfig,
  getBlockTypeConfig,
  getBlocksByTag
}
