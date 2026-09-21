#!/usr/bin/env node
'use strict'

/**
 * 尺寸令牌一致性校验
 *
 * 检查项：
 *   1. 引用了但未定义的 var(--sp-N)
 *   2. .wxss / .wxml 中残留的裸 rpx（令牌定义块内部除外）
 *   3. app.wxss 的令牌定义块 与 app.js 的 SPACE_TOKENS 是否完全对齐
 *   4. 定义了但未被引用的令牌（仅提示，不判失败）
 *
 * 用法：node scripts/check-sp-tokens.js
 * 退出码：0 通过；1 存在致命问题
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP_ROOT = path.join(ROOT, 'miniprogram')
const MARK_START = 'SP-TOKENS:START'
const MARK_END = 'SP-TOKENS:END'
const SKIP_DIRS = new Set(['node_modules', 'cloudfunctions', 'miniprogram_npm', '.git'])

const errors = []
const warns = []

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

function rel(full) {
  return path.relative(ROOT, full).split(path.sep).join('/')
}

function stripMarkedBlock(text) {
  const start = text.indexOf(MARK_START)
  const end = text.indexOf(MARK_END)
  if (start === -1 || end === -1 || end < start) return text
  return text.slice(0, start) + text.slice(end + MARK_END.length)
}

/** 去掉注释，避免注释里的示例被当成真实引用 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

const allFiles = walk(MP_ROOT)

// ---- 1. 收集引用 -----------------------------------------------------------
const refs = new Map() // name -> Set(file)
for (const full of allFiles) {
  if (!/\.(wxss|wxml|js|wxs)$/.test(full)) continue
  if (full.endsWith(path.join('app.wxss'))) {
    // app.wxss 的令牌定义块内不产生"引用"
    const text = fs.readFileSync(full, 'utf8')
    const outside = stripComments(stripMarkedBlock(text))
    collect(outside, full)
    continue
  }
  let text = fs.readFileSync(full, 'utf8')
  if (full.endsWith('.js') || full.endsWith('.wxml')) text = stripComments(text)
  collect(text, full)
}

function collect(text, full) {
  const re = /var\(\s*(--sp-[A-Za-z0-9_]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (!refs.has(m[1])) refs.set(m[1], new Set())
    refs.get(m[1]).add(rel(full))
  }
}

// ---- 2. 收集定义（app.wxss 令牌块） ---------------------------------------
const appWxssPath = path.join(MP_ROOT, 'app.wxss')
const appWxss = fs.readFileSync(appWxssPath, 'utf8')
const start = appWxss.indexOf(MARK_START)
const end = appWxss.indexOf(MARK_END)
if (start === -1 || end === -1) {
  errors.push('app.wxss 缺少 SP-TOKENS 标记块')
}

const defined = new Map() // name -> mobile value
if (start !== -1 && end !== -1) {
  const block = appWxss.slice(start, end)
  const re = /(--sp-[A-Za-z0-9_]+)\s*:\s*([^;]+);/g
  let m
  while ((m = re.exec(block)) !== null) defined.set(m[1], m[2].trim())
}

// ---- 3. 收集 app.js 的 SPACE_TOKENS ---------------------------------------
const appJs = fs.readFileSync(path.join(MP_ROOT, 'app.js'), 'utf8')
const jsStart = appJs.indexOf(MARK_START)
const jsEnd = appJs.indexOf(MARK_END)
const jsTokens = new Set()
if (jsStart === -1 || jsEnd === -1) {
  errors.push('app.js 缺少 SP-TOKENS 标记块（SPACE_TOKENS 未同步）')
} else {
  const block = appJs.slice(jsStart, jsEnd)
  const m = block.match(/\[([^\]]*)\]/)
  if (!m) {
    errors.push('app.js 的 SPACE_TOKENS 不是数组字面量，无法解析')
  } else {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((n) => jsTokens.add(`--sp-${String(n).replace('.', '_')}`))
  }
}

// ---- 4. 校验 ---------------------------------------------------------------
// 4.1 引用未定义
for (const [name, files] of refs) {
  if (!defined.has(name)) {
    errors.push(`引用了未定义的令牌 ${name}（出现在 ${[...files].slice(0, 3).join(', ')}${files.size > 3 ? ` 等 ${files.size} 个文件` : ''}）`)
  }
}

// 4.2 两侧定义对齐
for (const name of defined.keys()) {
  if (!jsTokens.has(name)) errors.push(`app.wxss 有 ${name}，但 app.js 的 SPACE_TOKENS 缺失（桌面端不会覆盖）`)
}
for (const name of jsTokens) {
  if (!defined.has(name)) errors.push(`app.js 有 ${name}，但 app.wxss 未定义（移动端取不到值）`)
}

// 4.3 裸 rpx 残留
const residual = []
for (const full of allFiles) {
  if (!full.endsWith('.wxss') && !full.endsWith('.wxml')) continue
  let text = fs.readFileSync(full, 'utf8')
  if (full.endsWith('app.wxss')) text = stripMarkedBlock(text)
  if (full.endsWith('.wxml')) text = text.replace(/\{\{[^}]*\}\}/g, '') // 排除 {{...}}rpx 动态拼接
  text = stripComments(text)
  const hits = (text.match(/(?<![\w).%])-?\d+(?:\.\d+)?rpx/g) || []).length
  if (hits > 0) residual.push({ file: rel(full), count: hits })
}
if (residual.length) {
  warns.push(`仍有 ${residual.length} 个文件使用裸 rpx（未迁移或需人工处理）`)
}

// 4.4 定义未引用
const unused = [...defined.keys()].filter((n) => !refs.has(n))
if (unused.length) warns.push(`定义了但未被引用：${unused.join(', ')}`)

// ---- 5. 输出 ---------------------------------------------------------------
console.log('\n=== 尺寸令牌一致性校验 ===')
console.log(`令牌定义：app.wxss ${defined.size} 个 / app.js ${jsTokens.size} 个`)
console.log(`令牌引用：${refs.size} 个不同名称`)

if (defined.size) {
  const sample = [...defined.entries()].slice(0, 6).map(([k, v]) => `${k}=${v}`)
  console.log(`取值示例：${sample.join('  ')}`)
}

if (residual.length) {
  console.log('\n裸 rpx 残留（阶段二完成后应为 0）：')
  residual
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
    .forEach((r) => console.log(`  ${String(r.count).padStart(4)} 处  ${r.file}`))
  if (residual.length > 12) console.log(`  ... 另有 ${residual.length - 12} 个文件`)
}

if (warns.length) {
  console.log('\n提示：')
  warns.forEach((w) => console.log(`  - ${w}`))
}

if (errors.length) {
  console.log('\n错误：')
  errors.forEach((e) => console.log(`  ✗ ${e}`))
  console.log(`\n校验未通过（${errors.length} 个错误）\n`)
  process.exit(1)
}

console.log('\n校验通过 ✓\n')
