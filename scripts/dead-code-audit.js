#!/usr/bin/env node
/**
 * 死代码审计（只读，不修改任何文件）
 *
 * 用法：
 *   node scripts/dead-code-audit.js            # 控制台摘要 + 写出 JSON
 *   node scripts/dead-code-audit.js --no-write # 只看控制台
 *
 * 审计项：
 *   1. commentedCode  被注释掉的代码（区分「文字注释」与「代码」）
 *   2. unusedFiles    全项目零引用的文件（页面/组件/工具/图片/模板…）
 *   3. unusedSymbols  声明后从未被引用的函数/方法/常量/数据字段
 *   4. unusedClasses  WXSS 里零引用的类选择器
 *   5. unusedCloudFns 未被任何端调用、也无触发器的云函数
 *   6. unusedAssets   未被引用的图片资源
 *   7. staleEntries   .gitignore 等清单里指向已不存在路径的条目
 *
 * 输出：scripts/.dead-audit.json（pretty JSON，便于逐段查看）
 * 注意：静态扫描无法覆盖动态字符串拼接/`this[expr]()` 之类的调用，结果需人工复核。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_JSON = path.join(__dirname, '.dead-audit.json')
const SKIP_DIRS = new Set(['node_modules', 'miniprogram_npm', '.git', 'dist', 'build', 'coverage'])
const TEXT_EXTS = new Set(['.js', '.wxs', '.ts', '.wxml', '.wxss', '.json', '.md'])
const CODE_EXTS = new Set(['.js', '.wxs', '.ts'])

const toPosix = (p) => p.split(path.sep).join('/')

function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(full, out)
    } else if (e.isFile()) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------- 文件与内容
const allFiles = [...walk(path.join(ROOT, 'miniprogram')), ...walk(path.join(ROOT, 'cloudfunctions'))]
const textFiles = allFiles.filter((f) => TEXT_EXTS.has(path.extname(f)))
const contents = new Map()
for (const f of textFiles) contents.set(toPosix(path.relative(ROOT, f)), fs.readFileSync(f, 'utf8'))
const rel = (f) => toPosix(path.relative(ROOT, f))

// ---------------------------------------------------------------- 注释掉的代码
// 判断一段注释内容「像代码」而非「像说明文字」
function looksLikeCode(raw) {
  let t = raw.trim()
  if (!t) return false
  // 先剥掉行尾注释：`this.loadX() // 加载数据` 是代码，不是说明文字
  t = t.replace(/\s*\/\/.*$/, '').replace(/\s*\/\*[\s\S]*?\*\/\s*$/, '').trim()
  if (!t) return false
  if (/^(?:={3,}|-{3,}|\*{3,}|#{3,})/.test(t)) return false // 分隔线
  if (/^(?:eslint|prettier|ts-|@ts|webpack|istanbul)/.test(t)) return false // 工具指令
  if (/^(?:[A-Z]+-TOKENS|SP-TOKENS)/.test(t)) return false
  if (/https?:\/\//.test(t)) return false
  if (/^[@*]/.test(t)) return false // JSDoc 标签行 / 续行
  if (/^[）)、，。：；！？]/.test(t)) return false // 纯标点续行

  const hasChinese = /[\u4e00-\u9fa5]/.test(t)
  if (hasChinese) {
    // 以中文（或中文标点）收尾 → 说明文字
    if (/[\u4e00-\u9fa5][。，、：；！？）】”"]?$/.test(t)) return false
    // 中文占比过半 → 说明文字
    const cnCount = (t.match(/[\u4e00-\u9fa5]/g) || []).length
    if (cnCount / t.length > 0.35) return false
  }

  const startsWithKeyword =
    /^(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|await|async|import|export|class|delete|typeof|void|module\.exports|exports\.)\b/

  if (hasChinese) {
    // 含中文行：只认「以代码结构开头」的形态，其余视为说明文字
    // （`menuId -> { ... }`、`云函数返回结构：{...}` 这类类型说明通不过）
    if (startsWithKeyword.test(t)) {
      // 排除 `new Date('YYYY-MM-DD') 会被解析为…` 这类「代码片段 + 中文解释」
      return !/[\u4e00-\u9fa5]{2,}/.test(t)
    }
    if (/^\s*(?:this|wx|app|db|console|cloud|_)\s*[.[]/.test(t)) return true
    if (/^[}\]){]/.test(t)) return true // 以括号开头（对象/数组字面量、收尾行）
    if (/^[A-Za-z_$][\w$.[\]]*\s*[=:([]/.test(t)) return true // foo: / foo( / foo[ / foo=
    if (/^['"`]/.test(t)) return true // 字符串字面量开头
    return false
  }

  if (startsWithKeyword.test(t)) return true
  if (/=>/.test(t)) return true
  if (/^\s*(?:this|wx|app|db|_|console|cloud|Promise)\s*[.[]/.test(t)) return true
  if (/^\s*[A-Za-z_$][\w$.[\]]*\s*\([^)]*\)\s*;?\s*$/.test(t)) return true // 单行调用
  if (/^[}\]){]/.test(t)) return true
  if (/^[A-Za-z_$][\w$.[\]]*\s*[=:]\s*[^=]/.test(t) && /[([{'"`\d-]/.test(t)) return true // 赋值/属性
  // 纯英文：再看是否带代码符号
  if (/[;{}$]\s*$/.test(t)) return true
  if (/[(){}[\]=<>]/.test(t) && /["'`]|\d/.test(t)) return true
  return false
}

function looksLikeCss(body) {
  return /\{|\}/.test(body) && /[a-z-]+\s*:/.test(body)
}
function looksLikeWxml(body) {
  return /<\/?[a-z-]+[\s>]/.test(body) || /\{\{/.test(body)
}

function firstLines(text, n = 2, width = 100) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .map((l) => (l.length > width ? l.slice(0, width) + '…' : l))
}

function scanCommentedCode(file, content) {
  const ext = path.extname(file)
  const out = []

  if (ext === '.wxss') {
    const re = /\/\*([\s\S]*?)\*\//g
    let m
    while ((m = re.exec(content))) {
      if (!looksLikeCss(m[1])) continue
      out.push({
        file,
        line: content.slice(0, m.index).split(/\r?\n/).length,
        kind: 'css-block',
        preview: firstLines(m[1])
      })
    }
    return out
  }

  if (ext === '.wxml') {
    const re = /<!--([\s\S]*?)-->/g
    let m
    while ((m = re.exec(content))) {
      if (!looksLikeWxml(m[1])) continue
      out.push({
        file,
        line: content.slice(0, m.index).split(/\r?\n/).length,
        kind: 'wxml-block',
        preview: firstLines(m[1])
      })
    }
    return out
  }

  if (!CODE_EXTS.has(ext)) return out

  // 块注释 /* */
  const blockRe = /\/\*([\s\S]*?)\*\//g
  let b
  while ((b = blockRe.exec(content))) {
    if (content.slice(b.index).startsWith('/**')) continue // JSDoc
    const body = b[1]
    const lines = body.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, ''))
    const codeish = lines.filter((l) => l.trim() && looksLikeCode(l)).length
    const total = lines.filter((l) => l.trim()).length
    if (total > 0 && codeish / total >= 0.5) {
      out.push({
        file,
        line: content.slice(0, b.index).split(/\r?\n/).length,
        kind: 'block',
        preview: firstLines(body)
      })
    }
  }

  // 连续 // 行注释块
  const lines = content.split(/\r?\n/)
  let group = null
  const flush = () => {
    if (!group) return
    const parts = group.parts
    const codeish = parts.filter((p) => looksLikeCode(p)).length
    const isCode = codeish > 0 && codeish / parts.length >= 0.5
    if (isCode) {
      out.push({
        file,
        line: group.start,
        endLine: group.end,
        kind: 'line-block',
        preview: parts.filter(Boolean).slice(0, 2).map((s) => (s.length > 100 ? s.slice(0, 100) + '…' : s))
      })
    }
    group = null
  }
  lines.forEach((raw, i) => {
    const t = raw.trim()
    if (t.startsWith('//') && !/^\/\/+$/.test(t)) {
      if (!group) group = { start: i + 1, end: i + 1, parts: [] }
      group.end = i + 1
      group.parts.push(t.replace(/^\/\/+\s?/, ''))
    } else {
      flush()
    }
  })
  flush()
  return out
}

// ---------------------------------------------------------------- 符号引用
const IDENT_SAFE = /^[A-Za-z_$][\w$]*$/
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 行是否是注释行（用于过滤「注释里的引用」） */
function isCommentLine(line, ext) {
  const t = line.trim()
  if (ext === '.wxml' || ext === '.wxss') return t.startsWith('<!--') || t.startsWith('/*') || t.startsWith('*')
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function extractDeclarations(file, content) {
  const ext = path.extname(file)
  if (!CODE_EXTS.has(ext)) return []
  const out = []
  content.split(/\r?\n/).forEach((line, i) => {
    if (isCommentLine(line, ext)) return
    let m
    if ((m = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(line))) {
      out.push({ name: m[1], line: i + 1, kind: 'function' })
    } else if ((m = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line))) {
      out.push({ name: m[1], line: i + 1, kind: 'const' })
    } else if ((m = /^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(line))) {
      out.push({ name: m[1], line: i + 1, kind: 'method' })
    } else if ((m = /^ {2}([A-Za-z_$][\w$]*)\s*:/.exec(line))) {
      out.push({ name: m[1], line: i + 1, kind: 'prop' })
    }
  })
  return out.filter((d) => !['if', 'else', 'for', 'while', 'switch', 'return', 'function'].includes(d.name))
}

// ---------------------------------------------------------------- 引用图（文件级）
function resolveRef(fromFile, spec) {
  if (!spec || /^(?:https?:|plugin:|wxfile:|~|miniprogram_npm)/.test(spec)) return null
  const baseDir = path.dirname(path.join(ROOT, fromFile))
  let abs
  if (spec.startsWith('/')) abs = path.join(ROOT, 'miniprogram', spec.slice(1))
  else abs = path.resolve(baseDir, spec)
  return toPosix(path.relative(ROOT, abs))
}

const usedFiles = new Set()
const usedBases = new Set()
const markQuartet = (baseNoExt) => {
  for (const e of ['.js', '.json', '.wxml', '.wxss', '.wxs']) usedFiles.add(baseNoExt + e)
}

// 1) app.json：pages、tabBar 图标、usingComponents
const appJson = JSON.parse(contents.get('miniprogram/app.json') || '{}')
for (const p of appJson.pages || []) {
  usedBases.add('miniprogram/' + p)
  markQuartet('miniprogram/' + p)
}
for (const item of (appJson.tabBar && appJson.tabBar.list) || []) {
  if (item.iconPath) usedFiles.add('miniprogram/' + item.iconPath)
  if (item.selectedIconPath) usedFiles.add('miniprogram/' + item.selectedIconPath)
}

// 2) 所有 json 的 usingComponents
for (const [file, content] of contents) {
  if (!file.endsWith('.json')) continue
  let json
  try {
    json = JSON.parse(content)
  } catch (e) {
    continue
  }
  const uc = json.usingComponents || {}
  for (const val of Object.values(uc)) {
    const target = typeof val === 'string' ? val : val && val.path
    const resolved = resolveRef(file, target)
    if (resolved) {
      const noExt = resolved.replace(/\.(js|json|wxml|wxss)$/, '')
      usedBases.add(noExt)
      markQuartet(noExt)
    }
  }
}

// 3) js 的 require / import
const REQUIRE_RE = /(?:require\s*\(\s*|from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
for (const [file, content] of contents) {
  if (!CODE_EXTS.has(path.extname(file))) continue
  let m
  while ((m = REQUIRE_RE.exec(content))) {
    const resolved = resolveRef(file, m[1])
    if (!resolved) continue
    const noExt = resolved.replace(/\.(js|json|wxml|wxss|wxs|ts)$/, '')
    usedFiles.add(noExt + '.js')
    usedFiles.add(noExt + '.json')
    usedBases.add(noExt)
    // require 目录（如 '../../common'）时把该目录下文件一并标记
    try {
      const dirAbs = path.join(ROOT, noExt)
      if (fs.existsSync(dirAbs) && fs.statSync(dirAbs).isDirectory()) {
        for (const e of fs.readdirSync(dirAbs)) {
          if (e.endsWith('.js') || e.endsWith('.wxs')) usedFiles.add(toPosix(path.join(noExt, e)))
        }
      }
    } catch (e) {}
  }
}

// 4) wxml / wxss 的各种 src、@import、url()
for (const [file, content] of contents) {
  const ext = path.extname(file)
  if (ext === '.wxml') {
    const re = /(?:src|is)\s*=\s*["']([^"'{}]+)["']/g
    let m
    while ((m = re.exec(content))) {
      const r = resolveRef(file, m[1])
      if (r) usedFiles.add(r)
    }
  }
  if (ext === '.wxss') {
    const re = /@import\s+["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/g
    let m
    while ((m = re.exec(content))) {
      const r = resolveRef(file, m[1] || m[2])
      if (r) usedFiles.add(r)
    }
  }
}

// 5) js 里出现的图片/字体等资源路径
const ASSET_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.otf', '.ttf', '.woff']
for (const [file, content] of contents) {
  for (const ext of ASSET_EXT) {
    const re = new RegExp(`[\\w./-]+\\${ext}`, 'g')
    let m
    while ((m = re.exec(content))) {
      const r = resolveRef(file, m[0])
      if (r) usedFiles.add(r)
      else usedFiles.add(toPosix(m[0].replace(/^\.\//, 'miniprogram/')))
    }
  }
}

// ---------------------------------------------------------------- 逐项审计
const report = { generatedAt: new Date().toISOString(), sections: {} }

// A. 注释掉的代码
const commentedCode = []
for (const [file, content] of contents) {
  if (!['.js', '.wxs', '.ts', '.wxml', '.wxss'].includes(path.extname(file))) continue
  for (const item of scanCommentedCode(file, content)) commentedCode.push(item)
}
commentedCode.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
report.sections.commentedCode = commentedCode

// B. 未被引用的文件
const KEEP_ALWAYS = new Set([
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/theme.json',
  'miniprogram/sitemap.json'
])
const unusedFiles = []
for (const f of allFiles) {
  const key = rel(f)
  if (KEEP_ALWAYS.has(key)) continue
  if (key.includes('/node_modules/')) continue
  const base = key.replace(/\.(js|json|wxml|wxss|wxs|ts)$/, '')
  const isCfEntry = /^cloudfunctions\/[^/]+\/(index\.js|package\.json|config\.json)$/.test(key)
  if (isCfEntry) continue
  const used = usedFiles.has(key) || usedBases.has(base)
  if (!used) unusedFiles.push(key)
}
unusedFiles.sort()
report.sections.unusedFiles = unusedFiles

// C. 声明后未被引用的符号
const declarations = []
for (const [file, content] of contents) {
  if (!CODE_EXTS.has(path.extname(file))) continue
  if (file.startsWith('cloudfunctions/') && /node_modules/.test(file)) continue
  for (const d of extractDeclarations(file, content)) declarations.push({ file, ...d })
}

// 预先建立每行文本，供引用计数
const lineIndex = new Map() // file -> [{text, isComment}]
for (const [file, content] of contents) {
  const ext = path.extname(file)
  lineIndex.set(
    file,
    content.split(/\r?\n/).map((text) => ({ text, isComment: isCommentLine(text, ext) }))
  )
}

// 框架会调用的名字（代码里不会出现引用），不算死代码
const FRAMEWORK_HOOKS = new Set([
  'onLoad', 'onShow', 'onHide', 'onUnload', 'onReady', 'onPullDownRefresh', 'onReachBottom',
  'onShareAppMessage', 'onShareTimeline', 'onAddToFavorites', 'onPageScroll', 'onTabItemTap',
  'onResize', 'onError', 'onLaunch', 'onThemeChange', 'onInit', 'onSaveExitState',
  'attached', 'detached', 'ready', 'created', 'moved', 'lifetimes', 'pageLifetimes',
  'observers', 'properties', 'data', 'methods', 'behaviors', 'options', 'relations',
  'externalClasses', 'definitionFunction', 'definitionFilter', 'pureDataPattern', 'componentGenerics'
])

/** 名字的等价写法：组件属性在 wxml 里写 kebab-case（showMask → show-mask） */
function nameVariants(name) {
  const out = [name]
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  if (kebab !== name) out.push(kebab)
  return out
}

const unusedSymbols = []
const frameworkHooks = []
const seenDecl = new Set()
for (const d of declarations) {
  if (!IDENT_SAFE.test(d.name)) continue
  const key = `${d.file}:${d.name}:${d.line}`
  if (seenDecl.has(key)) continue
  seenDecl.add(key)
  if (FRAMEWORK_HOOKS.has(d.name)) {
    frameworkHooks.push({ file: d.file, line: d.line, kind: d.kind, name: d.name })
    continue
  }
  // 边界只排除「标识符字符」，不排除 `.` —— 否则 app.xxx() / this.xxx() 会被漏掉
  const res = nameVariants(d.name).map((v) => new RegExp(`(?<![\\w$])${escapeRe(v)}(?![\\w$])`, 'g'))
  let usageCount = 0
  const sample = []
  for (const [file, lines] of lineIndex) {
    for (let i = 0; i < lines.length; i++) {
      if (file === d.file && i + 1 === d.line) continue // 声明自身
      if (lines[i].isComment) continue // 注释里的引用不算
      const hit = res.some((re) => {
        re.lastIndex = 0
        return re.test(lines[i].text)
      })
      if (!hit) continue
      usageCount += 1
      if (sample.length < 3) sample.push(`${file}:${i + 1}`)
    }
  }
  if (usageCount === 0) unusedSymbols.push({ file: d.file, line: d.line, kind: d.kind, name: d.name })
}
report.sections.unusedSymbols = unusedSymbols
report.sections.frameworkHooks = frameworkHooks

// D. 未被引用的 WXSS 类
const classRefs = [] // 所有 wxml/js/wxs 文本拼接，做子串判断
for (const [file, content] of contents) {
  if (!file.endsWith('.wxml') && !CODE_EXTS.has(path.extname(file))) continue
  classRefs.push({ file, content })
}
const unusedClasses = []
for (const [file, content] of contents) {
  if (!file.endsWith('.wxss')) continue
  const classNames = new Set()
  const re = /\.(-?[A-Za-z_][\w-]*)/g
  let m
  while ((m = re.exec(content))) classNames.add(m[1])
  for (const name of classNames) {
    let hit = false
    for (const r of classRefs) {
      if (r.file === file) continue
      if (r.content.includes(name)) {
        hit = true
        break
      }
    }
    if (!hit) unusedClasses.push({ file, className: name })
  }
}
report.sections.unusedClasses = unusedClasses

// E. 云函数引用情况
const cfDirs = fs
  .readdirSync(path.join(ROOT, 'cloudfunctions'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
const unusedCloudFns = []
for (const name of cfDirs) {
  const hasTrigger = fs.existsSync(path.join(ROOT, 'cloudfunctions', name, 'config.json'))
  let called = false
  const re = new RegExp(`['"\`]${escapeRe(name)}['"\`]`)
  for (const [file, content] of contents) {
    if (file.includes('/node_modules/')) continue
    if (file === `cloudfunctions/${name}/index.js`) continue
    if (re.test(content)) {
      called = true
      break
    }
  }
  if (!called) unusedCloudFns.push({ name, hasTrigger })
}
report.sections.unusedCloudFns = unusedCloudFns

// F. 图片资源
const imageFiles = allFiles.filter((f) => ['miniprogram/image/', 'miniprogram/images/'].some((p) => rel(f).startsWith(p)))
const unusedAssets = []
for (const f of imageFiles) {
  const key = rel(f)
  const base = path.basename(key)
  let hit = false
  for (const [file, content] of contents) {
    if (file === key) continue
    if (content.includes(base)) {
      hit = true
      break
    }
  }
  if (!hit) unusedAssets.push(key)
}
report.sections.unusedAssets = unusedAssets

// G. .gitignore 等清单里的失效条目
const staleEntries = []
try {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  for (const raw of gi.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const p = line.replace(/\/$/, '')
    if (!fs.existsSync(path.join(ROOT, p))) staleEntries.push({ file: '.gitignore', entry: line })
  }
} catch (e) {}
report.sections.staleEntries = staleEntries

// ---------------------------------------------------------------- 输出
const s = report.sections
console.log('==== 死代码审计摘要 ====')
console.log(`注释掉的代码块      : ${s.commentedCode.length}`)
console.log(`零引用文件          : ${s.unusedFiles.length}`)
console.log(`零引用符号          : ${s.unusedSymbols.length}`)
console.log(`零引用 WXSS 类      : ${s.unusedClasses.length}`)
console.log(`无调用/无触发器云函数: ${s.unusedCloudFns.length}`)
console.log(`零引用图片          : ${s.unusedAssets.length}`)
console.log(`失效清单条目        : ${s.staleEntries.length}`)
console.log('\n--- 注释掉的代码（按文件）---')
const byFile = {}
for (const c of s.commentedCode) byFile[c.file] = (byFile[c.file] || 0) + 1
Object.entries(byFile)
  .sort((a, b) => b[1] - a[1])
  .forEach(([f, n]) => console.log(`  ${n}\t${f}`))
console.log('\n--- 零引用文件 ---')
s.unusedFiles.forEach((f) => console.log('  ' + f))
console.log('\n--- 无调用/无触发器云函数 ---')
s.unusedCloudFns.forEach((c) => console.log(`  ${c.name}${c.hasTrigger ? '  (有触发器配置)' : ''}`))
console.log('\n--- 零引用图片 / 失效清单条目 ---')
s.unusedAssets.forEach((f) => console.log('  asset: ' + f))
s.staleEntries.forEach((e) => console.log(`  ${e.file}: ${e.entry}`))

if (!process.argv.includes('--no-write')) {
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n完整结果已写入 ${toPosix(path.relative(ROOT, OUT_JSON))}`)
}
