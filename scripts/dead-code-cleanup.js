#!/usr/bin/env node
/**
 * 死代码清理（A 类 + B2 注释块）
 * 依据 scripts/dead-code-audit.js 产出的 scripts/.dead-audit.json，配合人工把关的保留清单。
 *
 * 用法：
 *   node scripts/dead-code-cleanup.js            # dry-run，只打印计划
 *   node scripts/dead-code-cleanup.js --apply    # 实际写入
 *
 * 设计要点：
 *   所有删除都「基于原始文件内容」计算出字符区间后统一倒序套用，
 *   避免先删符号导致后续行号漂移（注释块按行号定位会失准）。
 *
 * 清理项：
 *   A1 死文件（整目录）
 *   A2/A3 零引用 JS 符号（function / const / 对象方法 / 对象属性）
 *   A4 死 WXSS 规则块（选择器中任一必需类名已死 → 该规则永不匹配 → 可删；逗号列表按分支剪枝）
 *   A5 配置项
 *   B2 被注释掉的代码块
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const AUDIT = path.join(__dirname, '.dead-audit.json')
const APPLY = process.argv.includes('--apply')

// ---------------------------------------------------------------- 人工保留清单
// D 类：动态拼接确认在用（`xxx-{{变量}}`），绝不删
const CSS_IN_USE = new Set([
  'personnel-label-leader', 'personnel-label-manager', 'personnel-label-head',
  'personnel-label-head-manager', 'personnel-label-curator', 'personnel-label-other',
  'personnel-label-deactivated',
  'picker-trigger--default', 'picker-trigger--card', 'picker-trigger--border',
  'is-available', 'is-unavailable', 'is-myBooked', 'is-cancelled', 'is-completed'
])
// C 类：灰区，需人工确认，本次不动
const CSS_CONFIRM = new Set([
  'ql-editor', 'ql-blank', 'is-focused',
  'picker-column-item--year', 'picker-column-item--weekday',
  'home-list-name', 'home-list-time', 'home-brand-name',
  'schedule-picker-time', 'haircut-item-reason', 'tag-active', 'tag-ended',
  'profile-company-address', 'board-item--deactivated', 'nav-placeholder'
])
// 本身写在注释块里的类名：由 B 类流程处理
const CSS_IN_COMMENT = new Set(['home-bg-gradient', 'is-light', 'hour-line'])

// B1：作者有意保留的「功能开关」注释（按 文件:起始行 精确排除）
const KEEP_COMMENTS = new Set([
  'miniprogram/pages/auth/login/login.js:398',
  'miniprogram/pages/auth/login/login.js:403',
  'miniprogram/pages/auth/login/login.js:415',
  'miniprogram/pages/auth/login/login.js:429',
  'miniprogram/pages/auth/login/login.js:435',
  'miniprogram/pages/office/calendar/calendar.js:441',
  'miniprogram/pages/office/calendar/calendar.js:476',
  'miniprogram/pages/office/calendar/calendar.js:734',
  'miniprogram/pages/office/calendar/calendar.wxml:57',
  'miniprogram/pages/office/calendar/calendar.wxss:398'
])

// A1：整目录死文件
const DEAD_FILES = [
  'miniprogram/components/pagination-loading/pagination-loading.js',
  'miniprogram/components/pagination-loading/pagination-loading.json',
  'miniprogram/components/pagination-loading/pagination-loading.wxml',
  'miniprogram/components/pagination-loading/pagination-loading.wxss'
]

const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'))
const abs = (p) => path.join(ROOT, p)

// ---------------------------------------------------------------- 通用工具
function lineStarts(text) {
  const out = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1)
  return out
}
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length
const countLines = (s) => s.split('\n').length

/** 跳过字符串/注释的括号匹配：返回与 text[i] 处开括号配对的闭括号索引 */
function matchBracket(text, i) {
  const open = text[i]
  const close = open === '(' ? ')' : open === '[' ? ']' : '}'
  let depth = 0
  let j = i
  while (j < text.length) {
    const ch = text[j]
    if (ch === '/' && text[j + 1] === '/') {
      while (j < text.length && text[j] !== '\n') j++
      continue
    }
    if (ch === '/' && text[j + 1] === '*') {
      j += 2
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++
      j += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      j++
      while (j < text.length && text[j] !== q) {
        if (text[j] === '\\') j++
        j++
      }
      j++
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return j
    }
    j++
  }
  return -1
}

/** 从 from 起找下一个结构性字符（( [ { 或行尾），跳过字符串与注释 */
function nextStructural(text, from, stopAtNewline = false) {
  let j = from
  while (j < text.length) {
    const ch = text[j]
    if (ch === '/' && text[j + 1] === '/') {
      while (j < text.length && text[j] !== '\n') j++
      continue
    }
    if (ch === '/' && text[j + 1] === '*') {
      j += 2
      while (j < text.length && !(text[j] === '*' && text[j + 1] === '/')) j++
      j += 2
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch
      j++
      while (j < text.length && text[j] !== q) {
        if (text[j] === '\\') j++
        j++
      }
      j++
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') return j
    if (ch === '\n' && stopAtNewline) return -1
    j++
  }
  return -1
}

// ---------------------------------------------------------------- JS 符号
/** 计算声明的字符区间（原文偏移） */
function symbolSpan(text, decl) {
  const starts = lineStarts(text)
  const lineIdx = decl.line - 1
  const lineStart = starts[lineIdx]
  if (lineStart === undefined) return null
  const lineEnd = starts[lineIdx + 1] !== undefined ? starts[lineIdx + 1] - 1 : text.length
  const lineText = text.slice(lineStart, lineEnd)
  const nameRe = new RegExp(
    decl.kind === 'const' || decl.kind === 'function'
      ? `^(?:const|let|var|(?:async\\s+)?function)\\s+${decl.name}\\b`
      : `^ {2}(?:async\\s+)?${decl.name}\\s*[(:]`
  )
  if (!nameRe.test(lineText)) return null // 校验失败，放弃（避免误删）

  const structStart = nextStructural(text, lineStart, true)
  let endOffset
  if (structStart === -1) {
    endOffset = lineEnd // 单行声明
  } else if (text[structStart] === '(') {
    // 参数列表 → 其后若有 { 则是方法体，否则为单行表达式方法
    const closeParam = matchBracket(text, structStart)
    if (closeParam === -1) return null
    const after = nextStructural(text, closeParam + 1)
    if (after !== -1 && text[after] === '{') {
      const closeBody = matchBracket(text, after)
      if (closeBody === -1) return null
      endOffset = closeBody + 1
    } else if (text.slice(closeParam + 1).match(/^\s*=>\s*\{/) && false) {
      endOffset = closeParam + 1
    } else {
      endOffset = closeParam + 1
    }
  } else {
    const close = matchBracket(text, structStart)
    if (close === -1) return null
    endOffset = close + 1
  }
  // 吞掉行尾直到换行（含逗号）
  let end = endOffset
  while (end < text.length && text[end] !== '\n') end++
  // 连同紧随的一个空行一起删除
  let cursor = end + 1
  while (cursor < text.length && /[ \t]/.test(text[cursor])) cursor++
  if (text[cursor] === '\r') cursor++
  if (text[cursor] === '\n') end = cursor
  return { from: lineStart, to: end, lines: countLines(text.slice(lineStart, end)) }
}

// ---------------------------------------------------------------- 注释块
/** 计算注释块的字符区间（原文偏移） */
function commentSpan(text, item) {
  const starts = lineStarts(text)
  if (item.kind === 'line-block') {
    const from = starts[item.line - 1]
    const to = starts[item.endLine] !== undefined ? starts[item.endLine] : text.length
    if (from === undefined || to === undefined) return null
    return { from, to }
  }
  const open = item.kind === 'wxml-block' ? '<!--' : '/*'
  const close = item.kind === 'wxml-block' ? '-->' : '*/'
  const from = starts[item.line - 1]
  if (from === undefined) return null
  const at = text.indexOf(open, from)
  if (at === -1 || at - from > 200) return null // 该行附近没有注释起点
  const end = text.indexOf(close, at + open.length)
  if (end === -1) return null
  let to = end + close.length
  // 若整行只剩空白，连行一起删
  const lineStart = starts[lineOf(text, at) - 1]
  const lineEndIdx = text.indexOf('\n', to)
  const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx
  if (text.slice(lineStart, at).trim() === '' && text.slice(to, lineEnd).trim() === '') {
    let cursor = lineEnd + 1
    while (cursor < text.length && /[ \t]/.test(text[cursor])) cursor++
    if (text[cursor] === '\r') cursor++
    if (text[cursor] === '\n') to = cursor
    else to = lineEnd + 1
    return { from: lineStart, to: Math.min(to, text.length) }
  }
  return { from: at, to }
}

// ---------------------------------------------------------------- CSS 规则
function parseCssBlocks(text) {
  const blocks = []
  const stack = []
  let i = 0
  let selStart = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (ch === '"' || ch === "'") {
      const q = ch
      i++
      while (i < text.length && text[i] !== q) i++
      i++
      continue
    }
    if (ch === '{') {
      const block = { selFrom: selStart, selTo: i, start: i, end: -1, parent: stack.length ? stack[stack.length - 1] : null }
      block.selector = stripComments(text.slice(selStart, i)).trim()
      stack.push(block)
      blocks.push(block)
      selStart = i + 1
    } else if (ch === '}') {
      const b = stack.pop()
      if (b) b.end = i
      selStart = i + 1
    }
    i++
  }
  return blocks
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const classTokens = (sel) => (sel.match(/\.(-?[A-Za-z_][\w-]*)/g) || []).map((s) => s.slice(1))

/** 顶层逗号切分 */
function splitTopLevel(sel) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

// ---------------------------------------------------------------- 收集操作
const ops = new Map() // file -> [{from,to,kind,desc,replace?}]
const addOp = (file, op) => {
  if (!ops.has(file)) ops.set(file, [])
  ops.get(file).push(op)
}

// A2/A3 JS 符号
for (const s of audit.sections.unusedSymbols) {
  if (s.file.startsWith('components/pagination-loading/')) continue
  const text = fs.readFileSync(abs(s.file), 'utf8')
  const span = symbolSpan(text, s)
  if (!span) {
    addOp(s.file, { failed: true, desc: `${s.name} L${s.line} 定位失败`, kind: 'symbol' })
    continue
  }
  addOp(s.file, { ...span, kind: 'symbol', desc: `${s.name} L${s.line}（${span.lines} 行）` })
}

// A4 CSS 规则
const cssReport = []
for (const c of audit.sections.unusedClasses) {
  const n = c.className
  if (CSS_IN_USE.has(n) || CSS_CONFIRM.has(n) || CSS_IN_COMMENT.has(n)) continue
  cssReport.push({ file: c.file, className: n, handled: false })
}
const deadByFile = {}
cssReport.forEach((c) => {
  ;(deadByFile[c.file] = deadByFile[c.file] || new Set()).add(c.className)
})
for (const [file, deadSet] of Object.entries(deadByFile)) {
  const text = fs.readFileSync(abs(file), 'utf8')
  const blocks = parseCssBlocks(text)
  const markHandled = (tokens) => {
    tokens.forEach((t) => {
      const rec = cssReport.find((r) => r.file === file && r.className === t)
      if (rec) rec.handled = true
    })
  }
  for (const b of blocks) {
    if (b.end === -1 || b.selector.startsWith('@')) continue
    const alts = splitTopLevel(b.selector)
    const deadAlts = []
    const liveAlts = []
    for (const alt of alts) {
      const tokens = classTokens(alt)
      if (tokens.length === 0) {
        liveAlts.push(alt)
        continue
      }
      // :not(.x) 里出现的类名不能作为「永不匹配」的依据
      const notPart = (alt.match(/:not\([^)]*\)/g) || []).join(' ')
      const required = tokens.filter((t) => !notPart.includes('.' + t))
      const isDead = required.some((t) => deadSet.has(t))
      if (isDead) deadAlts.push(alt)
      else liveAlts.push(alt)
    }
    if (deadAlts.length === 0) continue
    markHandled(deadAlts.flatMap((a) => classTokens(a)))
    if (liveAlts.length === 0) {
      // 整块删除：必须从「选择器起点」开始，否则会留下孤立的选择器文本
      let coreFrom = b.selFrom
      while (coreFrom < b.selTo && /\s/.test(text[coreFrom])) coreFrom++
      let from = coreFrom
      const lineStartIdx = text.lastIndexOf('\n', coreFrom) + 1
      // 只有当该行前导部分全是空白时，才从行首删起（避免连带删掉行内注释）
      if (/^[ \t]*$/.test(text.slice(lineStartIdx, coreFrom))) from = lineStartIdx
      let to = b.end + 1
      if (text[to] === '\r') to++
      if (text[to] === '\n') to++
      addOp(file, { from, to, kind: 'css-block', desc: `块 ${b.selector.split('\n')[0].trim()}` })
    } else {
      // 仅剪掉死分支，保留活分支
      const core = { from: b.selFrom, to: b.selTo }
      while (core.from < core.to && /\s/.test(text[core.from])) core.from++
      while (core.to > core.from && /\s/.test(text[core.to - 1])) core.to--
      const indent = (text.slice(b.selFrom, core.from).match(/[ \t]*$/) || [''])[0] || '  '
      const replacement = liveAlts.join(',\n' + indent)
      addOp(file, { ...core, kind: 'css-prune', replace: replacement, desc: `剪枝 → ${replacement}` })
    }
  }
}

// B2 注释块
for (const c of audit.sections.commentedCode) {
  if (DEAD_FILES.includes(c.file)) continue
  if (KEEP_COMMENTS.has(`${c.file}:${c.line}`)) continue
  const text = fs.readFileSync(abs(c.file), 'utf8')
  const span = commentSpan(text, c)
  if (!span) {
    addOp(c.file, { failed: true, kind: 'comment', desc: `L${c.line}（${c.kind}）定位失败` })
    continue
  }
  addOp(c.file, { ...span, kind: 'comment', desc: `L${c.line}${c.endLine ? '-' + c.endLine : ''}（${c.kind}）` })
}

// A5 配置
const configOps = []
{
  const appJsonPath = 'miniprogram/app.json'
  const text = fs.readFileSync(abs(appJsonPath), 'utf8')
  const cfg = JSON.parse(text)
  if (cfg.useExtendedLib && cfg.useExtendedLib.weui) {
    delete cfg.useExtendedLib
    configOps.push({ file: appJsonPath, content: JSON.stringify(cfg, null, 2) + '\n', desc: '移除未使用的 useExtendedLib.weui' })
  }
  const gi = '.gitignore'
  const giText = fs.readFileSync(abs(gi), 'utf8')
  const giNext = giText
    .split(/\r?\n/)
    .filter((l) => l.trim() !== 'cloudfunctions/newsFetcher/node_modules' && l.trim() !== 'miniprogram/node_modules')
    .join('\n')
  if (giNext !== giText) configOps.push({ file: gi, content: giNext, desc: '移除 2 条失效路径' })
}

// ---------------------------------------------------------------- 套用
const results = new Map()
for (const [file, list] of ops) {
  const text = fs.readFileSync(abs(file), 'utf8')
  const valid = list.filter((o) => !o.failed)
  const failed = list.filter((o) => o.failed)
  valid.sort((a, b) => b.from - a.from)
  let out = text
  let lastFrom = Infinity
  for (const o of valid) {
    if (o.to > lastFrom) {
      failed.push({ ...o, failed: true, desc: `${o.desc} —— 与后续区间重叠，已跳过` })
      continue
    }
    lastFrom = o.from
    const piece = o.replace !== undefined ? o.replace : ''
    out = out.slice(0, o.from) + piece + out.slice(o.to)
  }
  out = out.replace(/\n{3,}/g, '\n\n')
  if (out.endsWith('\n\n')) out = out.replace(/\n+$/, '\n')
  results.set(file, { out, applied: valid.length, failed })
}

if (APPLY) {
  for (const f of DEAD_FILES) if (fs.existsSync(abs(f))) fs.unlinkSync(abs(f))
  const dir = path.dirname(abs(DEAD_FILES[0]))
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  for (const [file, r] of results) {
    const before = fs.readFileSync(abs(file), 'utf8')
    if (before !== r.out) fs.writeFileSync(abs(file), r.out, 'utf8')
  }
  for (const c of configOps) fs.writeFileSync(abs(c.file), c.content, 'utf8')
}

// ---------------------------------------------------------------- 报告
const grouped = { symbol: [], 'css-block': [], 'css-prune': [], comment: [] }
let failedTotal = 0
for (const [file, r] of results) {
  for (const o of r.failed) {
    failedTotal += 1
    grouped.symbol.push(`   ✗ ${file.replace('miniprogram/', '')}  ${o.desc}`)
  }
}
for (const [file, list] of ops) {
  for (const o of list) {
    if (o.failed) continue
    grouped[o.kind].push(`   ${file.replace('miniprogram/', '')}  ${o.desc}`)
  }
}
console.log(`==== ${APPLY ? '已执行' : 'DRY-RUN（未写入）'} ====`)
console.log(`A1 删除文件: ${DEAD_FILES.length}`)
DEAD_FILES.forEach((f) => console.log('   - ' + f))
console.log(`A2/A3 JS 符号: ${grouped.symbol.filter((l) => !l.includes('✗')).length}`)
grouped.symbol.forEach((l) => console.log(l))
console.log(`A4 CSS 规则块删除: ${grouped['css-block'].length}；选择器剪枝: ${grouped['css-prune'].length}`)
console.log(`   待删类名 ${cssReport.length} 个，未被任何规则覆盖 ${cssReport.filter((r) => !r.handled).length} 个`)
cssReport.filter((r) => !r.handled).forEach((r) => console.log(`   · 未覆盖（保留）: ${r.file.replace('miniprogram/', '')} → ${r.className}`))
grouped['css-prune'].forEach((l) => console.log(l))
console.log(`B2 注释块: ${grouped.comment.length}`)
grouped.comment.forEach((l) => console.log(l))
console.log(`A5 配置: ${configOps.length}`)
configOps.forEach((c) => console.log('   - ' + c.file + ': ' + c.desc))
console.log(`\n定位/重叠失败: ${failedTotal}`)
console.log(`涉及文件: ${results.size + DEAD_FILES.length + configOps.length}`)
