/**
 * 新闻爬取云函数
 * 从巴西主流媒体网站抓取最新新闻，缓存到 news_articles 集合
 * 
 * Actions:
 *   - list:   获取新闻列表（带缓存）
 *   - detail: 获取新闻详情
 *   - refresh: 强制刷新所有源（供定时触发器调用）
 * 
 * 扩展性：新增新闻源只需在 SOURCES_REGISTRY 数组中添加配置即可
 */
const cloud = require('wx-server-sdk')
const axios = require('axios')
const { parse } = require('node-html-parser')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合引用（集中定义）
const newsArticlesCollection = db.collection('news_articles')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

// ===== 配置常量 =====
const CACHE_TTL = 15 * 60 * 1000        // 数据库缓存有效期：15分钟
const MAX_ARTICLES_PER_SOURCE = 5        // 每个源每次最多抓取篇数
const OLD_ARTICLE_TTL = 24 * 60 * 60 * 1000 // 旧文章保留时间：24小时
const REQUEST_TIMEOUT = 10000            // HTTP 请求超时：10秒
const DELAY_MIN = 1000                   // 请求间最小延迟（ms）
const DELAY_MAX = 2000                   // 请求间最大延迟（ms）

// ===== User-Agent 池（轮换使用，避免被封锁） =====
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
]

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function randomDelay() {
  const delay = DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN)
  return new Promise(resolve => setTimeout(resolve, delay))
}

// ===== node-html-parser 辅助函数 =====
function getAttr(node, attr) {
  return node ? (node.getAttribute(attr) || '') : ''
}

function getText(node) {
  return node ? (node.textContent || '').trim() : ''
}

function getTextSafe(node) {
  return node ? node.textContent : ''
}

// ===== 新闻源注册表（扩展新源只需在此添加配置） =====
const SOURCES_REGISTRY = [
  {
    id: 'globo',
    name: 'Globo',
    enabled: true,
    listUrls: ['https://g1.globo.com/'],
    parseList: (root, url) => {
      const articles = []
      // G1 首页文章链接
      root.querySelectorAll('a[href*="/g1/"]').forEach(el => {
        const href = getAttr(el, 'href')
        const title = getText(el)
        // 过滤非文章链接
        if (href.match(/\/g1\/[^\/]+\/[^\/]+\/\d{4}\/\d{2}\/\d{2}\//) && title.length > 10 && title.length < 200) {
          const fullUrl = href.startsWith('http') ? href : `https://g1.globo.com${href}`
          // 去重
          if (!articles.find(a => a.url === fullUrl)) {
            articles.push({ url: fullUrl, title })
          }
        }
      })
      return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
    },
    parseDetail: (root, url) => {
      let content = ''
      const selectors = [
        '.content-text__container',
        '.mc-article-content',
        '.article__content',
        'article .content'
      ]
      for (const sel of selectors) {
        const el = root.querySelector(sel)
        if (el && getText(el).length > 50) {
          // 清理 script、style 标签
          el.querySelectorAll('script, style, iframe, noscript').forEach(n => n.remove())
          content = el.innerHTML || getText(el)
          break
        }
      }
      if (!content) {
        // 降级：取 meta description
        content = getAttr(root.querySelector('meta[name="description"]'), 'content')
      }
      // 提取封面图
      const imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') ||
        getAttr(root.querySelector('article img'), 'src')
      // 提取分类
      let category = ''
      const breadcrumb = root.querySelector('.breadcrumb-item, .content-header__label')
      if (breadcrumb) {
        category = getText(breadcrumb)
      }
      return { content, imageUrl: imageUrl || '', category }
    }
  },
  {
    id: 'folha',
    name: 'Folha',
    enabled: true,
    listUrls: ['https://www.folha.uol.com.br/'],
    parseList: (root, url) => {
      const articles = []
      root.querySelectorAll('a.c-headline__url, a[href*="/colunas/"], a[href*="/poder/"], a[href*="/mercado/"], a[href*="/mundo/"]').forEach(el => {
        const href = getAttr(el, 'href')
        const title = getText(el) || getText(el.querySelector('.c-headline__title'))
        if (href.match(/\/\d{4}\//) && title.length > 10 && title.length < 200) {
          const fullUrl = href.startsWith('http') ? href : `https://www.folha.uol.com.br${href}`
          if (!articles.find(a => a.url === fullUrl)) {
            articles.push({ url: fullUrl, title })
          }
        }
      })
      return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
    },
    parseDetail: (root, url) => {
      let content = ''
      const selectors = [
        '.c-news__body',
        '.article-body',
        '.news-body'
      ]
      for (const sel of selectors) {
        const el = root.querySelector(sel)
        if (el && getText(el).length > 50) {
          el.querySelectorAll('script, style, iframe, noscript').forEach(n => n.remove())
          content = el.innerHTML || getText(el)
          break
        }
      }
      if (!content) {
        content = getAttr(root.querySelector('meta[name="description"]'), 'content')
      }
      const imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') ||
        getAttr(root.querySelector('article img'), 'src')
      const category = getAttr(root.querySelector('meta[name="channel"]'), 'content')
      return { content, imageUrl: imageUrl || '', category }
    }
  },
  {
    id: 'estadao',
    name: 'Estadão',
    enabled: true,
    listUrls: ['https://www.estadao.com.br/'],
    parseList: (root, url) => {
      const articles = []
      root.querySelectorAll('a[href]').forEach(el => {
        const href = getAttr(el, 'href')
        const title = getAttr(el, 'title') || getText(el)
        if (href.match(/estadao\.com\.br\/[^\/]+\/\d{4}/) && title.length > 10 && title.length < 200) {
          const fullUrl = href.startsWith('http') ? href : `https://www.estadao.com.br${href}`
          if (!articles.find(a => a.url === fullUrl)) {
            articles.push({ url: fullUrl, title })
          }
        }
      })
      return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
    },
    parseDetail: (root, url) => {
      let content = ''
      const selectors = [
        '.laudo-content',
        '.news-content',
        '.content-text',
        'article .content'
      ]
      for (const sel of selectors) {
        const el = root.querySelector(sel)
        if (el && getText(el).length > 50) {
          el.querySelectorAll('script, style, iframe, noscript').forEach(n => n.remove())
          content = el.innerHTML || getText(el)
          break
        }
      }
      if (!content) {
        content = getAttr(root.querySelector('meta[name="description"]'), 'content')
      }
      const imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') ||
        getAttr(root.querySelector('article img'), 'src')
      const category = getAttr(root.querySelector('meta[property="article:section"]'), 'content')
      return { content, imageUrl: imageUrl || '', category }
    }
  }
  // ===== 扩展示例：添加新源只需复制以下模板并修改 =====
  // {
  //   id: 'uoL',
  //   name: 'UOL',
  //   enabled: true,
  //   listUrls: ['https://www.uol.com.br/'],
  //   parseList: (root, url) => { ... },
  //   parseDetail: (root, url) => { ... }
  // }
]

// ===== 获取已启用的新闻源 =====
function getEnabledSources() {
  return SOURCES_REGISTRY.filter(s => s.enabled)
}

// ===== HTTP 请求封装 =====
async function fetchPage(url) {
  const response = await axios.get(url, {
    timeout: REQUEST_TIMEOUT,
    headers: {
      'User-Agent': getRandomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache'
    },
    responseType: 'text',
    // 处理编码
    responseEncoding: 'utf-8'
  })
  return response.data
}

// ===== 爬取单个源 =====
async function scrapeSource(source) {
  const results = []
  const allListItems = []

  // 1. 从所有 listUrl 获取文章链接
  for (const listUrl of source.listUrls) {
    try {
      const html = await fetchPage(listUrl)
      const root = parse(html)
      const items = source.parseList(root, listUrl)
      allListItems.push(...items)
    } catch (err) {
      console.error(`[${source.id}] 获取列表页失败: ${listUrl}`, err.message)
    }
    await randomDelay()
  }

  // 去重
  const uniqueItems = []
  const seenUrls = new Set()
  for (const item of allListItems) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url)
      uniqueItems.push(item)
    }
  }

  // 限制数量
  const targetItems = uniqueItems.slice(0, MAX_ARTICLES_PER_SOURCE)

  // 2. 检查去重（数据库中已存在的 sourceUrl）
  if (targetItems.length > 0) {
    const existingUrls = targetItems.map(i => i.url)
    const existingDocs = await newsArticlesCollection
      .where({ sourceUrl: _.in(existingUrls) })
      .field({ sourceUrl: true })
      .limit(100)
      .get()
    const existingSet = new Set(existingDocs.data.map(d => d.sourceUrl))

    // 3. 逐个抓取新文章详情
    for (const item of targetItems) {
      if (existingSet.has(item.url)) continue

      try {
        const html = await fetchPage(item.url)
        const root = parse(html)
        const { content, imageUrl, category } = source.parseDetail(root, item.url)

        // 生成摘要（纯文本，最多200字）
        let summary = ''
        if (content) {
          const tempRoot = parse(content)
          summary = tempRoot.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
        }

        // 提取发布时间
        let publishedAt = Date.now()
        const timeMeta = getAttr(root.querySelector('meta[property="article:published_time"]'), 'content') ||
          getAttr(root.querySelector('meta[name="date"]'), 'content') ||
          getAttr(root.querySelector('time[datetime]'), 'datetime') ||
          getAttr(root.querySelector('meta[itemprop="datePublished"]'), 'content')
        if (timeMeta) {
          const parsed = new Date(timeMeta)
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed.getTime()
          }
        }

        const now = Date.now()
        results.push({
          title: item.title,
          content: cleanHtml(content),
          summary,
          imageUrl: imageUrl || '',
          source: source.id,
          sourceName: source.name,
          sourceUrl: item.url,
          category: category || '',
          publishedAt,
          scrapedAt: now,
          createdAt: now,
          updatedAt: now
        })

        await randomDelay()
      } catch (err) {
        console.error(`[${source.id}] 抓取文章详情失败: ${item.url}`, err.message)
      }
    }
  }

  return results
}

// ===== HTML 清洗 =====
function cleanHtml(html) {
  if (!html) return ''
  const root = parse(html)
  // 移除不需要的标签
  root.querySelectorAll('script, style, iframe, noscript, nav, footer, header, aside').forEach(el => el.remove())
  // 移除所有事件属性和style属性
  root.querySelectorAll('*').forEach(el => {
    const attrNames = el.getAttributeNames ? el.getAttributeNames() : []
    for (const key of attrNames) {
      if (key.startsWith('on') || key === 'style') {
        el.removeAttribute(key)
      }
    }
  })
  return root.innerHTML || ''
}

// ===== 清理旧文章 =====
async function cleanOldArticles() {
  const threshold = Date.now() - OLD_ARTICLE_TTL
  try {
    // 每次最多删除100条，避免超时
    const oldDocs = await newsArticlesCollection
      .where({ scrapedAt: _.lt(threshold) })
      .limit(100)
      .field({ _id: true })
      .get()
    
    if (oldDocs.data.length > 0) {
      const ids = oldDocs.data.map(d => d._id)
      // 分批删除
      const batchSize = 20
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize)
        await newsArticlesCollection.where({ _id: _.in(batch) }).remove()
      }
      console.log(`清理旧文章: ${ids.length} 条`)
    }
  } catch (err) {
    console.error('清理旧文章失败:', err.message)
  }
}

// ===== 检查缓存是否有效 =====
async function isCacheValid() {
  try {
    const latest = await newsArticlesCollection
      .orderBy('scrapedAt', 'desc')
      .limit(1)
      .field({ scrapedAt: true })
      .get()
    
    if (latest.data.length > 0) {
      return Date.now() - latest.data[0].scrapedAt < CACHE_TTL
    }
    return false
  } catch (err) {
    return false
  }
}

// ===== 导出 =====
exports.main = async (event, context) => {
  const { action } = event

  try {
    switch (action) {
      case 'list': return await handleList(event)
      case 'detail': return await handleDetail(event)
      case 'refresh': return await handleRefresh(event)
      default: return fail('未知操作', 400)
    }
  } catch (error) {
    console.error('newsFetcher 错误:', error)
    return fail(error.message)
  }
}

// ===== Action: 获取新闻列表 =====
async function handleList(event) {
  const { page = 1, pageSize = 15, source = '' } = event
  const skip = (page - 1) * pageSize

  // 检查缓存，过期则后台刷新
  const cacheValid = await isCacheValid()
  if (!cacheValid) {
    // 异步刷新，不阻塞返回
    handleRefresh(event).catch(err => console.error('后台刷新失败:', err.message))
  }

  // 构建查询条件
  let query = newsArticlesCollection
  if (source) {
    query = query.where({ source })
  }

  // 查询总数
  const countResult = await query.count()
  const total = countResult.total

  // 分页查询
  const listResult = await query
    .orderBy('scrapedAt', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const hasMore = skip + listResult.data.length < total

  return success({
    list: listResult.data,
    hasMore,
    total,
    page,
    pageSize
  })
}

// ===== Action: 获取新闻详情 =====
async function handleDetail(event) {
  const { articleId } = event
  if (!articleId) {
    return fail('缺少文章ID', 400)
  }

  const result = await newsArticlesCollection.doc(articleId).get()
  if (!result.data) {
    return fail('文章不存在', 404)
  }

  return success(result.data)
}

// ===== Action: 强制刷新 =====
async function handleRefresh(event) {
  const enabledSources = getEnabledSources()
  const allNewArticles = []

  for (const source of enabledSources) {
    try {
      console.log(`开始抓取: ${source.name}`)
      const articles = await scrapeSource(source)
      console.log(`${source.name}: 新增 ${articles.length} 篇`)
      allNewArticles.push(...articles)
    } catch (err) {
      console.error(`${source.name} 抓取失败:`, err.message)
    }
  }

  // 批量写入数据库
  if (allNewArticles.length > 0) {
    const batchSize = 20
    for (let i = 0; i < allNewArticles.length; i += batchSize) {
      const batch = allNewArticles.slice(i, i + batchSize)
      await newsArticlesCollection.add({ data: batch })
    }
    console.log(`共写入 ${allNewArticles.length} 篇新文章`)
  }

  // 清理旧文章
  await cleanOldArticles()

  return success({
    newCount: allNewArticles.length,
    sourcesProcessed: enabledSources.length
  }, '刷新完成')
}
