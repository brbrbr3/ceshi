#!/usr/bin/env node
'use strict'

/**
 * rpx → var(--sp-N) 尺寸令牌迁移脚本
 *
 * 背景：rpx 的换算基准是「页面总宽度 / 750」，PC 大屏模式下窗口变宽会导致所有 rpx 尺寸等比放大。
 * 做法：把 rpx 收敛为 CSS 自定义属性 --sp-<设计值>，移动端取 Nrpx、桌面端取 N*0.5px，
 *      口径与既有的 --fs-* 字号令牌完全一致（锁定 375px 设计稿）。
 *
 * 用法：
 *   node scripts/rpx-to-token.js                      # dry-run，只扫描并输出报告（默认试点范围）
 *   node scripts/rpx-to-token.js --apply              # 执行替换（先备份原文件）
 *   node scripts/rpx-to-token.js --scope=all          # 范围改为全项目（阶段二）
 *   node scripts/rpx-to-token.js --scope=all --apply  # 全项目替换
 *
 * 幂等：替换后样式文件中不再存在裸 rpx，重复执行不会二次替换。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP_ROOT = path.join(ROOT, 'miniprogram')
const REPORT_PATH = path.join(ROOT, '.rpx-migration-report.json')
const BACKUP_ROOT = path.join(ROOT, '.rpx-migration-backup')

const MARK_START = 'SP-TOKENS:START'
const MARK_END = 'SP-TOKENS:END'

/** 桌面端换算系数：375px 设计稿下 1rpx = 0.5px */
const RPX_TO_PX = 0.5

/**
 * 阶段一试点文件
 * - app.wxss：全局样式表，试点页大量依赖其全局类
 * - 三个试点页的 wxss
 * - 试点页实际用到的组件：multiuse-modal（login/home）、datetime-picker（trip-report）
 *   其中 multiuse-modal 为 styleIsolation: 'isolated'，用于验证令牌能否跨组件继承
 */
const PILOT_FILES = [
  'miniprogram/app.wxss',
  'miniprogram/pages/auth/login/login.wxss',
  'miniprogram/pages/office/home/home.wxss',
  'miniprogram/pages/office/trip-report/trip-report.wxss',
  'miniprogram/components/multiuse-modal/multiuse-modal.wxss',
  'miniprogram/components/datetime-picker/datetime-picker.wxss'
]

/** 不参与扫描的目录 */
const SKIP_DIRS = new Set(['node_modules', 'cloudfunctions', 'miniprogram_npm', '.git'])

/** 不参与自动替换的文件（含 {{...}}rpx 这类 JS 计算拼接，需人工按平台换算） */
const SKIP_FILES = new Set(['miniprogram/pages/office/calendar/calendar.wxml'])

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const scopeArg = args.find((a) => a.startsWith('--scope='))
const SCOPE = scopeArg ? scopeArg.split('=')[1] : 'pilot'

if (!['pilot', 'all'].includes(SCOPE)) {
  console.error(`[错误] 不支持的 scope: ${SCOPE}（可选：pilot | all）`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 令牌名：小数用下划线代替（如 0.5 → --sp-0_5） */
function tokenName(value) {
  return String(value).replace('.', '_')
}

/**
 * 桌面端取值：N * 0.5px。
 * 特例：1rpx（细边框）取 1px，避免 DPR=1 的 PC 屏幕上边框渲染不出来。
 */
function desktopValue(value) {
  if (value === 1) return '1px'
  const px = Math.round(value * RPX_TO_PX * 100) / 100
  return `${px}px`
}

/** 递归列出目录下的样式文件 */
function listCssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      listCssFiles(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.wxss')) {
      out.push(full)
    }
  }
  return out
}

/** 保留原文件的换行风格 */
function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/** 读取并抽出标记块内容；返回 { body, found } */
function extractMarkedBlock(text, startMark, endMark) {
  const start = text.indexOf(startMark)
  const end = text.indexOf(endMark)
  if (start === -1 || end === -1 || end < start) return { body: null, found: false }
  return { body: text.slice(start, end), found: true }
}

/** 去掉标记块（含标记行本身），用于避免二次替换令牌定义 */
function stripMarkedBlock(text, startMark, endMark) {
  const start = text.indexOf(startMark)
  const end = text.indexOf(endMark)
  if (start === -1 || end === -1 || end < start) return text
  const lineStart = text.lastIndexOf('\n', start)
  const lineEnd = text.indexOf('\n', end)
  const from = lineStart === -1 ? start : lineStart + 1
  const to = lineEnd === -1 ? text.length : lineEnd + 1
  return text.slice(0, from) + text.slice(to)
}

/** 就地替换标记块；若标记不存在则追加到文件末尾 */
function upsertMarkedBlock(text, block, eol) {
  const start = text.indexOf(MARK_START)
  const end = text.indexOf(MARK_END)
  if (start !== -1 && end !== -1 && end > start) {
    const lineStart = text.lastIndexOf('\n', start)
    const lineEnd = text.indexOf('\n', end)
    const from = lineStart === -1 ? start : lineStart + 1
    const to = lineEnd === -1 ? text.length : lineEnd + 1
    return text.slice(0, from) + block + eol + text.slice(to)
  }
  const trimmed = text.replace(/[ \t\r\n]+$/, '')
  return `${trimmed}${eol}${eol}${block}${eol}`
}

/**
 * rpx → var(--sp-N)
 * 负值写作 calc(var(--sp-N) * -1)，避免出现 var(--sp--20) 这种非法名。
 * lookbehind 排除「值后面的连字符」场景，保证 calc(100% - 8rpx) 里的减号不被当成负号。
 */
const RPX_RE = /(?<![\w).%])-?\d+(?:\.\d+)?rpx/g

function replaceRpx(text) {
  return text.replace(RPX_RE, (match) => {
    const isNegative = match.startsWith('-')
    const value = parseFloat(isNegative ? match.slice(1) : match)
    if (!Number.isFinite(value)) return match
    if (value === 0) return '0'
    const ref = `var(--sp-${tokenName(value)})`
    return isNegative ? `calc(${ref} * -1)` : ref
  })
}

/** 只替换非注释区域，避免把注释里提到的 rpx 也改掉 */
function replaceRpxOutsideComments(text) {
  const parts = text.split(/(\/\*[\s\S]*?\*\/)/)
  return parts.map((part, i) => (i % 2 === 1 ? part : replaceRpx(part))).join('')
}

/** 收集文本中出现的全部 rpx 取值（去重，升序） */
function collectValues(text, bucket) {
  const re = /(?<![\w).%])-?\d+(?:\.\d+)?rpx/g
  let m
  while ((m = re.exec(text)) !== null) {
    const value = Math.abs(parseFloat(m[0].replace('rpx', '')))
    if (Number.isFinite(value)) bucket.add(value)
  }
  return bucket
}

/** 生成 app.wxss 的令牌定义块 */
function buildWxssBlock(values, eol) {
  const lines = values.map((v) => `  --sp-${tokenName(v)}: ${v}rpx;`)
  return [
    `/* ${MARK_START} 由 scripts/rpx-to-token.js 自动生成，请勿手工修改 */`,
    'page {',
    ...lines,
    '}',
    `/* ${MARK_END} */`
  ].join(eol)
}

/** 生成 app.js 的 SPACE_TOKENS 定义块 */
function buildJsBlock(values, eol) {
  const nums = values.map((v) => String(v)).join(', ')
  return [
    `// ${MARK_START} 由 scripts/rpx-to-token.js 自动生成，请勿手工修改`,
    `const SPACE_TOKENS = [${nums}]`,
    `// ${MARK_END}`
  ].join(eol)
}

function rel(full) {
  return path.relative(ROOT, full).split(path.sep).join('/')
}

function backupFile(full, stamp) {
  const target = path.join(BACKUP_ROOT, stamp, rel(full))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(full, target)
  return path.relative(ROOT, target).split(path.sep).join('/')
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  const allCss = listCssFiles(MP_ROOT).map(rel)
  const targets = SCOPE === 'all'
    ? allCss
    : PILOT_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)))

  const appWxssPath = path.join(MP_ROOT, 'app.wxss')
  const appJsPath = path.join(MP_ROOT, 'app.js')

  // 1. 收集取值：目标文件中的裸 rpx + 已有令牌块中已定义的取值（保证增量执行时令牌不丢失）
  const values = new Set()
  for (const file of targets) {
    const full = path.join(ROOT, file)
    let text = fs.readFileSync(full, 'utf8')
    if (file === 'miniprogram/app.wxss') text = stripMarkedBlock(text, MARK_START, MARK_END)
    collectValues(text, values)
  }
  const appWxssText = fs.readFileSync(appWxssPath, 'utf8')
  const existingWxss = extractMarkedBlock(appWxssText, MARK_START, MARK_END)
  if (existingWxss.found) collectValues(existingWxss.body, values)

  // 排除 0：0rpx 会被替换为 0，无需令牌
  const sorted = Array.from(values)
    .filter((v) => v > 0)
    .sort((a, b) => a - b)

  // 2. 逐文件替换
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const report = {
    scope: SCOPE,
    apply: APPLY,
    generatedAt: new Date().toISOString(),
    tokenCount: sorted.length,
    tokens: sorted.map((v) => ({ name: `--sp-${tokenName(v)}`, mobile: `${v}rpx`, desktop: desktopValue(v) })),
    files: [],
    skipped: [],
    warnings: []
  }

  let replacedTotal = 0
  const pendingWrites = []

  for (const file of targets) {
    const full = path.join(ROOT, file)
    if (SKIP_FILES.has(file)) {
      report.skipped.push({ file, reason: '含 {{...}}rpx 动态拼接，需人工按平台换算' })
      continue
    }
    const original = fs.readFileSync(full, 'utf8')
    const eol = detectEol(original)

    let working = original
    let tokenBlockRefreshed = false
    if (file === 'miniprogram/app.wxss') {
      working = stripMarkedBlock(working, MARK_START, MARK_END)
      tokenBlockRefreshed = true
    }

    const before = (working.match(RPX_RE) || []).length
    let next = replaceRpxOutsideComments(working)

    if (file === 'miniprogram/app.wxss') {
      next = upsertMarkedBlock(next, buildWxssBlock(sorted, eol), eol)
    }

    if (next !== original) {
      pendingWrites.push({ full, file, next })
      if (APPLY) backupFile(full, stamp)
    }

    replacedTotal += before
    report.files.push({
      file,
      replaced: before,
      tokenBlockRefreshed,
      changed: next !== original,
      residualRpx: (next.replace(/\r?\n/g, '\n').match(RPX_RE) || []).length
    })

    // 记录注释区里被跳过的 rpx（提示人工确认）
    const commentRpx = (original.match(/\/\*[\s\S]*?\*\//g) || []).join(' ').match(RPX_RE)
    if (commentRpx && commentRpx.length) {
      report.warnings.push({ file, type: 'comment-rpx', count: commentRpx.length, samples: [...new Set(commentRpx)].slice(0, 10) })
    }
  }

  // 3. app.js 的 SPACE_TOKENS 同步
  const appJsText = fs.readFileSync(appJsPath, 'utf8')
  const appJsEol = detectEol(appJsText)
  const appJsHasMarkers = appJsText.includes(MARK_START) && appJsText.includes(MARK_END)
  if (appJsHasMarkers) {
    // 就地替换（不可先 strip，否则标记丢失会被追加到文件末尾）
    const nextAppJs = upsertMarkedBlock(appJsText, buildJsBlock(sorted, appJsEol), appJsEol)
    if (nextAppJs !== appJsText) {
      pendingWrites.push({ full: appJsPath, file: 'miniprogram/app.js', next: nextAppJs })
      if (APPLY) backupFile(appJsPath, stamp)
    }
    report.files.push({
      file: 'miniprogram/app.js',
      replaced: 0,
      tokenBlockRefreshed: true,
      changed: nextAppJs !== appJsText,
      residualRpx: 0
    })
  } else {
    report.warnings.push({ file: 'miniprogram/app.js', type: 'missing-markers', message: `未找到 ${MARK_START}/${MARK_END} 标记，未同步 SPACE_TOKENS` })
  }

  // 4. 落盘（必须先写入，残留体检才反映真实结果）
  if (APPLY) {
    for (const item of pendingWrites) {
      fs.writeFileSync(item.full, item.next, 'utf8')
    }
    report.backupDir = path.relative(ROOT, path.join(BACKUP_ROOT, stamp)).split(path.sep).join('/')
  }

  // 5. 全项目残留体检（不受 scope 限制）
  const residual = []
  for (const file of allCss) {
    if (SKIP_FILES.has(file)) continue
    let text = fs.readFileSync(path.join(ROOT, file), 'utf8')
    if (file === 'miniprogram/app.wxss') text = stripMarkedBlock(text, MARK_START, MARK_END)
    const hits = (text.replace(/\r?\n/g, '\n').match(RPX_RE) || []).length
    if (hits > 0) residual.push({ file, count: hits })
  }
  report.projectResidual = residual

  // 5. 落盘
  if (APPLY) {
    for (const item of pendingWrites) {
      fs.writeFileSync(item.full, item.next, 'utf8')
    }
    report.backupDir = path.relative(ROOT, path.join(BACKUP_ROOT, stamp)).split(path.sep).join('/')
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  // 6. 控制台摘要
  const mode = APPLY ? '【已执行替换】' : '【dry-run 仅扫描】'
  console.log(`\n${mode} scope=${SCOPE}`)
  console.log(`扫描文件：${targets.length} 个；去重后 rpx 取值：${sorted.length} 个；本次替换点：${replacedTotal} 处`)
  console.log(`取值清单：${sorted.join(', ')}`)
  console.log('\n各文件替换点：')
  report.files.forEach((f) => {
    console.log(`  ${String(f.replaced).padStart(4)} 处  ${f.file}${f.changed ? '' : '  (无需改动)'}`)
  })
  if (report.skipped.length) {
    console.log('\n人工处理：')
    report.skipped.forEach((s) => console.log(`  - ${s.file}：${s.reason}`))
  }
  if (report.warnings.length) {
    console.log('\n提示：')
    report.warnings.forEach((w) => console.log(`  - ${w.file}：${w.type}`))
  }
  console.log(`\n全项目 rpx 残留：${residual.length} 个文件（阶段二完成后应为 0）`)
  residual.slice(0, 10).forEach((r) => console.log(`  ${String(r.count).padStart(4)} 处  ${r.file}`))
  if (residual.length > 10) console.log(`  ... 另有 ${residual.length - 10} 个文件`)
  console.log(`\n报告：${rel(REPORT_PATH)}`)
  if (!APPLY) console.log('（当前为 dry-run，未改动任何文件；加 --apply 执行替换）\n')
  else console.log(`备份目录：${report.backupDir}\n`)
}

main()
