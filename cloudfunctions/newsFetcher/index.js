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
const MAX_ARTICLES_PER_SOURCE = 10       // 每个源每次最多抓取篇数
const OLD_ARTICLE_TTL = 7 * 24 * 60 * 60 * 1000 // 旧文章保留时间：7天
const REQUEST_TIMEOUT = 10000            // HTTP 请求超时：10秒（默认）
const DELAY_MIN = 1000                   // 请求间最小延迟（ms）
const DELAY_MAX = 2000                   // 请求间最大延迟（ms）

// ===== User-Agent 池（轮换使用，避免被封锁） =====
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
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

// ===== 垃圾文本黑名单（用于清洗文章正文） =====
const JUNK_TEXT_PATTERNS = [
  /leia\s+mais/gi,
  /compartilhe/gi,
  /carregando\.\.\./gi,
  /assine.*folha/gi,
  /assinante.*liberar/gi,
  /já é assinante/gi,
  /faça seu login/gi,
  /benefício do assinante/gi,
  /dê um conteúdo/gi,
  /salvar para ler depois/gi,
  /guardar para depois/gi,
  /copiar link/gi,
  /whatsapp/gi,
  /envie sua notícia/gi,
  /erramos\?/gi,
  /ombudsman/gi,
  /sua assinatura pode valer/gi,
  /sua assinatura vale muito/gi,
  /assine por r\$/gi,
  /oferta exclusiva/gi,
  /assine a folha/gi,
  /PUBLICIDADE/gi,
  /Publicidade/gi,
  /Veja também/gi,
  /Leia também/gi,
  /Compartilhar/gi,
  /Siga nas redes/gi,
  /Encontrou algum erro/gi,
  /Tópicos relacionados/gi,
  /Últimas:/gi,
  /Mais lidas/gi,
  /newsletter/gi,
  /Gostaria de receber/gi,
  /Acesse seus artigos salvos/gi,
  /Recomendadas para você/gi,
  / Mais em/gi
]

function removeJunkText(text) {
  if (!text) return ''
  let cleaned = text
  for (const pattern of JUNK_TEXT_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }
  return cleaned.replace(/\n{3,}/g, '\n\n').trim()
}

// ===== 新闻源注册表（扩展新源只需在此添加配置） =====
const SOURCES_REGISTRY = [
  {
    id: 'globo',
    name: 'Globo',
    enabled: true,
    // Globo 对云服务器IP封锁严重，使用短超时快速失败，避免拖慢其他源
    // 保留2个不同域名的URL作为最后尝试
    requestTimeout: 5000,   // 5秒超时（比默认10秒快）
    requestRetries: 0,      // 不重试（403重试无意义）
    listUrls: [
      'https://g1.globo.com/rss/g1/',
      'https://feedproxy.google.com/g1/ultimas-noticias'
    ],
    parseList: (root, url) => {
      const articles = []
      // RSS XML 格式：从 <item> 标签提取 <title>、<link>、<media:content>、<description>
      const excludePatterns = [
        'globoplay', '/ao-vivo/', '/podcast/', '/videos/', '/imposto-de-renda/',
        'loterias', '/playlist-', 'megasena', 'lotofacil', 'quina', 'dia-de-sorte',
        'resultados-', 'tv-globo/', 'jornal-', '/telejornais/'
      ]
      
      const allItems = root.querySelectorAll('item')
      console.log(`[parseList] 总item数: ${allItems.length}`)
      
      let debugStats = { noHrefOrTitle: 0, notG1Domain: 0, excluded: 0, titleTooShort: 0, titleTooLong: 0, duplicate: 0, passed: 0 }
      
      root.querySelectorAll('item').forEach((item, idx) => {
        const titleEl = item.querySelector('title')
        const linkEl = item.querySelector('link')
        const title = getText(titleEl)
        const href = getText(linkEl)
        
        // 调试：每10条输出一次
        if (idx < 5 || idx % 20 === 0) {
          console.log(`[parseList] item#${idx}: href=${href?.slice(0, 80)}, title="${title?.slice(0, 50)}", titleLen=${title?.length || 0}`)
        }
        
        if (!href || !title) { debugStats.noHrefOrTitle++; return }
        if (!href.includes('g1.globo.com/')) { debugStats.notG1Domain++; console.log(`[parseList] ❌ 非g1域名: ${href}`); return }
        const matchedPattern = excludePatterns.find(p => href.includes(p))
        if (matchedPattern) { debugStats.excluded++; return }
        if (!(title.length > 10 && title.length < 200)) { 
          if (title.length <= 10) debugStats.titleTooShort++
          else debugStats.titleTooLong++
          return 
        }
        if (!articles.find(a => a.url === href)) {
          // 从 <media:content> 提取图片
          const mediaContent = item.querySelector('media\\:content') || item.querySelector('content')
          const imageUrl = mediaContent ? getAttr(mediaContent, 'url') : ''
          // 从 <description> 提取摘要
          const descEl = item.querySelector('description')
          let summary = ''
          if (descEl) {
            // description 可能包含 HTML，提取纯文本并截断
            const descText = getText(parse(getText(descEl)))
            summary = descText.slice(0, 200)
          }
          // 从 <pubDate> 提取发布时间
          let publishedAt = 0
          const pubDateEl = item.querySelector('pubDate')
          if (pubDateEl) {
            const pubDateStr = getText(pubDateEl)
            // RSS标准格式: "Sat, 04 Apr 2026 22:30:00 GMT"
            const parsed = new Date(pubDateStr)
            if (!isNaN(parsed.getTime())) {
              publishedAt = parsed.getTime()
            }
          }
          articles.push({ url: href, title, imageUrl, summary, publishedAt })
          debugStats.passed++
        } else { debugStats.duplicate++ }
      })
      
      console.log(`[parseList] 过滤统计:`, JSON.stringify(debugStats))
      const result = articles.slice(0, MAX_ARTICLES_PER_SOURCE)
      console.log(`[parseList] 最终返回: ${result.length} 条（上限${MAX_ARTICLES_PER_SOURCE}）`)
      return result
    },
    parseDetail: (root, url) => {
      let content = ''
      let author = ''
      // 1. 尝试多种内容选择器
      const contentSelectors = [
        '.content-text__container',
        '.content-text',
        '.mc-article-content article',
        'article'
      ]
      for (const sel of contentSelectors) {
        const el = root.querySelector(sel)
        if (el) {
          // 移除干扰元素
          el.querySelectorAll('script, style, iframe, noscript, .recommended, .multi-content, .bastian-related').forEach(n => n.remove())
          const text = getText(el)
          if (text.length > 100) {
            content = el.innerHTML || text
            break
          }
        }
      }
      if (!content) {
        content = getAttr(root.querySelector('meta[name="description"]'), 'content') || ''
      }

      // 2. 提取作者
      const authorEl = root.querySelector('meta[itemprop="author"]')
      if (authorEl) {
        author = getAttr(authorEl, 'content')
      }
      if (!author) {
        // 从 "Por Nome" 文本中提取
        const allText = getTextSafe(root)
        const authorMatch = allText.match(/Por\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+(?:\s+[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+)*)/)
        if (authorMatch) {
          author = authorMatch[1].trim()
        }
      }

      // 3. 提取图片
      const imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') || ''

      // 4. 提取分类
      let category = getAttr(root.querySelector('meta[name="channel"]'), 'content') ||
        getAttr(root.querySelector('meta[property="article:section"]'), 'content') || ''
      // 从 URL 中提取分类
      if (!category) {
        const urlCatMatch = url.match(/g1\.globo\.com\/([^/]+)\//)
        if (urlCatMatch) {
          const catMap = { economia: 'Economia', mundo: 'Mundo', ciencia: 'Ciência', 'trabalho-e-carreira': 'Trabalho', politica: 'Política', sp: 'São Paulo', rs: 'Rio Grande do Sul' }
          category = catMap[urlCatMatch[1]] || urlCatMatch[1].charAt(0).toUpperCase() + urlCatMatch[1].slice(1)
        }
      }

      return {
        content: removeJunkText(content),
        imageUrl,
        category,
        author
      }
    }
  },
  {
    id: 'folha',
    name: 'Folha',
    enabled: true,
    listUrls: [
      'https://www.folha.uol.com.br/',
      'https://www1.folha.uol.com.br/ultimas-noticias/',
      'https://www1.folha.uol.com.br/poder/',
      'https://www1.folha.uol.com.br/mundo/',
      'https://www1.folha.uol.com.br/mercado/'
    ],
    parseList: (root, url) => {
      const articles = []
      // Folha 文章链接格式：
      // - https://www1.folha.uol.com.br/{secao}/{yyyy}/{mm}/{slug}.shtml
      // - https://www1.folha.uol.com.br/colunas/{colunista}/{yyyy}/{mm}/{slug}.shtml
      // - https://www1.folha.uol.com.br/blogs/{blog}/{yyyy}/{mm}/{slug}.shtml
      const excludePatterns = ['/folha-topicos/', '/mapa-do-site', '/falecomafolha', '/erramos', '/ombudsman', '/maispopulares', '/institucional', '/podcasts/', '/todas', '/colecoes']
      root.querySelectorAll('a[href]').forEach(el => {
        const href = getAttr(el, 'href')
        if (!href) return
        // 匹配包含日期路径和 .shtml 结尾的文章链接
        if (!href.match(/\/\d{4}\/\d{2}\//) && !href.match(/\.shtml$/)) return
        if (excludePatterns.some(p => href.includes(p))) return
        const title = getText(el).replace(/\\/g, '').trim()
        // 排除包含HTML标签的"标题"（通常是匹配到了图片/广告等非文章元素）
        if (title.length > 10 && title.length < 200 && !/<(img|svg|script|iframe|video|audio|source|button|input|select|textarea)\s/i.test(title)) {
          const fullUrl = href.startsWith('http') ? href : `https://www1.folha.uol.com.br${href}`
          if (fullUrl.includes('folha.uol.com.br') && !articles.find(a => a.url === fullUrl)) {
            articles.push({ url: fullUrl, title })
          }
        }
      })
      return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
    },
    parseDetail: (root, url) => {
      let content = ''
      let author = ''

      // 1. 提取正文：Folha 的文章内容在 .c-news__body 或 article 标签内
      const contentSelectors = [
        '.c-news__body',
        'article',
        '.news-body'
      ]
      for (const sel of contentSelectors) {
        const el = root.querySelector(sel)
        if (el) {
          // 移除 Folha 特有的干扰元素
          el.querySelectorAll('script, style, iframe, noscript, .c-share, .c-signature, .c-related, .c-topics, .c-recommendations, .taboola, .ad, [class*="newsletter"], [class*="paywall"], [class*="share"], .c-news__toolbar, .c-news__footer, .c-news__sidebar').forEach(n => n.remove())
          // 移除空图片占位、加载动画等
          el.querySelectorAll('img[alt="Carregando"]').forEach(n => n.remove())
          const text = getText(el)
          if (text.length > 100) {
            content = el.innerHTML || text
            break
          }
        }
      }
      if (!content) {
        content = getAttr(root.querySelector('meta[name="description"]'), 'content') || ''
      }

      // 2. 提取作者：Folha 作者通常在 a 标签中，链接指向 /autores/ 页面
      const authorEl = root.querySelector('a[href*="/autores/"]')
      if (authorEl) {
        author = getText(authorEl).trim()
      }
      if (!author) {
        // 尝试 meta 标签
        author = getAttr(root.querySelector('meta[name="author"]'), 'content') || ''
      }
      if (!author) {
        // 从文本中提取 "Por Nome" 模式
        const allText = getTextSafe(root)
        const authorMatch = allText.match(/Por\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+(?:\s+[a-záéíóúãõâêîôûç]+)*(?:\s+[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+)*)/)
        if (authorMatch) author = authorMatch[1].trim()
      }

      // 3. 提取图片
      const imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') || ''

      // 4. 提取分类
      let category = ''
      const urlCatMatch = url.match(/folha\.uol\.com\.br\/([^/]+)\//)
      if (urlCatMatch && !['colunas', 'blogs'].includes(urlCatMatch[1])) {
        const catMap = { poder: 'Poder', mercado: 'Mercado', mundo: 'Mundo', cotidiano: 'Cotidiano', ciencia: 'Ciência', esporte: 'Esporte', ilustrada: 'Ilustrada', equilibrioesaude: 'Equilíbrio e Saúde', educacao: 'Educação', ambiente: 'Ambiente', turismo: 'Turismo' }
        category = catMap[urlCatMatch[1]] || urlCatMatch[1].charAt(0).toUpperCase() + urlCatMatch[1].slice(1)
      }

      return {
        content: removeJunkText(content),
        imageUrl,
        category,
        author
      }
    }
  },
  {
    id: 'estadao',
    name: 'Estadão',
    enabled: true,
    listUrls: [
      'https://www.estadao.com.br/',
      'https://www.estadao.com.br/politica/',
      'https://www.estadao.com.br/economia/',
      'https://www.estadao.com.br/internacional/',
      'https://www.estadao.com.br/brasil/'
    ],
    parseList: (root, url) => {
      const articles = []
      // Estadão 文章链接格式：
      // - https://www.estadao.com.br/{categoria}/{slug}
      // - https://www.estadao.com.br/{categoria}/{autor}/{slug}（博客/专栏）
      // - 以 /-npr 结尾的是短新闻
      const excludePatterns = ['/assine', '/newsletter', '/podcasts', '/videos', '/redes-', '/tag/', '/rss', '/jornal-do-carro', '/sp-innovation-week', '/descubra', '/paladar', '/emais/tv', '/web-stories', '/loterias', '/aplicativos', '/fale-conosco', '/correcoes', '/acervo', '/termo-de-uso', '/blogs-e-colunas', '/mais-lidas', '/tudo-sobre', '/ultimas', '/fotos', '/tv', '/midia-mkt', '/sustentabilidade', '/viagem', '/eldorado']
      root.querySelectorAll('a[href]').forEach(el => {
        const href = getAttr(el, 'href')
        if (!href || !href.includes('estadao.com.br/')) return
        if (excludePatterns.some(p => href.includes(p))) return
        // 排除非文章链接（纯导航/功能页面）
        const path = href.replace('https://www.estadao.com.br', '').replace(/\/$/, '')
        const segments = path.split('/').filter(Boolean)
        // 文章至少2段路径，排除纯分类页（只有1段如 /economia）
        if (segments.length < 2) return
        // 排除外部链接
        if (href.includes('einvestidor.estadao') || href.includes('tecmundo.com')) return
        const title = getText(el).replace(/\\/g, '').trim()
        if (title.length > 10 && title.length < 200) {
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
      let author = ''
      let imageUrl = ''

      // 0. 尝试从 JSON-LD 提取结构化数据（ARC XP CMS 常用）
      const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]')
      for (const script of jsonLdScripts) {
        try {
          const jsonData = JSON.parse(script.textContent || '')
          if (jsonData['@type'] === 'NewsArticle' || jsonData.articleBody) {
            // 提取正文
            if (jsonData.articleBody) {
              content = jsonData.articleBody.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')
              if (!content.startsWith('<')) {
                content = '<p>' + content + '</p>'
              }
            }
            // 提取作者
            if (jsonData.author) {
              if (Array.isArray(jsonData.author)) {
                author = jsonData.author.map(a => a.name || '').join(', ')
              } else if (typeof jsonData.author === 'object') {
                author = jsonData.author.name || ''
              } else {
                author = jsonData.author || ''
              }
            }
            // 提取图片
            if (jsonData.image) {
              if (typeof jsonData.image === 'string') {
                imageUrl = jsonData.image
              } else if (Array.isArray(jsonData.image) && jsonData.image[0]) {
                imageUrl = typeof jsonData.image[0] === 'string' ? jsonData.image[0] : (jsonData.image[0].url || '')
              } else if (typeof jsonData.image === 'object') {
                imageUrl = jsonData.image.url || ''
              }
            }
            if (content) break
          }
        } catch (e) {
          // JSON 解析失败，继续尝试下一个
        }
      }

      // 1. 如果 JSON-LD 没有提取到正文，尝试 HTML 选择器
      if (!content || getText(parse(content || '')).length < 100) {
        const contentSelectors = [
          '.laudo-content',
          '.news-content',
          '.content-text',
          'article .content',
          '.article-body',
          '.news-body',
          'article .news-body',
          '.arc-content',
          'article'
        ]
        for (const sel of contentSelectors) {
          const el = root.querySelector(sel)
          if (el) {
            // 移除 Estadão 特有的干扰元素
            el.querySelectorAll('script, style, iframe, noscript, .related-content, .share-bar, .newsletter-signup, .ad, [class*="correction"], [class*="update"], [class*="paywall"], [class*="subscribe"], [class*="premium"], [class*="assine"], .taboola').forEach(n => n.remove())
            const text = getText(el)
            if (text.length > 100) {
              content = el.innerHTML || text
              break
            }
          }
        }
      }

      // 2. 降级：提取所有段落和图片
      if (!content || getText(parse(content || '')).length < 100) {
        const paras = root.querySelectorAll('article p:not(.correction):not(.update), .news-content p, .laudo-content p, .news-body p, .content-text p')
        const images = root.querySelectorAll('article figure img, .news-content figure img, .laudo-content figure img, .news-body figure img, .content-text figure img')
        if (paras.length > 1 || (paras.length > 0 && images.length > 0)) {
          let html = ''
          // 按文档顺序提取所有内容节点（段落和图片）
          const contentContainers = root.querySelectorAll('article, .news-content, .laudo-content, .news-body, .content-text')
          for (const container of contentContainers) {
            for (const child of container.childNodes) {
              const tag = child.tagName ? child.tagName.toLowerCase() : ''
              if (tag === 'p' || tag === 'figure') {
                html += (child.outerHTML || '') + '\n'
              }
            }
          }
          if (html.length > 100) content = html
        }
      }

      // 3. 最终降级：meta description
      if (!content || getText(parse(content || '')).length < 50) {
        content = getAttr(root.querySelector('meta[name="description"]'), 'content') ||
          getAttr(root.querySelector('meta[property="og:description"]'), 'content') || ''
      }

      // 4. 提取作者（如果 JSON-LD 没有提取到）
      if (!author) {
        const authorEl = root.querySelector('a[href*="/autores/"]')
        if (authorEl) {
          author = getText(authorEl).trim()
        }
      }
      if (!author) {
        const allText = getTextSafe(root)
        const authorMatch = allText.match(/Por\s+([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+(?:\s+[a-záéíóúãõâêîôûç]+)*(?:\s+[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+)*)/)
        if (authorMatch) author = authorMatch[1].trim()
      }
      if (!author) {
        author = getAttr(root.querySelector('meta[name="author"]'), 'content') || ''
      }

      // 5. 提取图片（如果 JSON-LD 没有提取到）
      if (!imageUrl) {
        imageUrl = getAttr(root.querySelector('meta[property="og:image"]'), 'content') || ''
      }

      // 6. 提取分类
      let category = getAttr(root.querySelector('meta[property="article:section"]'), 'content') ||
        getAttr(root.querySelector('meta[name="channel"]'), 'content') || ''
      if (!category) {
        const urlCatMatch = url.match(/estadao\.com\.br\/([^/]+)\//)
        if (urlCatMatch) {
          const catMap = { politica: 'Política', economia: 'Economia', internacional: 'Internacional', brasil: 'Brasil', saoPaulo: 'São Paulo', ciencias: 'Ciência', esportes: 'Esportes', cultura: 'Cultura', saude: 'Saúde', educacao: 'Educação' }
          category = catMap[urlCatMatch[1]] || urlCatMatch[1].charAt(0).toUpperCase() + urlCatMatch[1].slice(1)
        }
      }

      return {
        content: removeJunkText(content),
        imageUrl,
        category,
        author
      }
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
async function fetchPage(url, options = {}) {
  const { retries = 1, referer = null, timeout: optTimeout } = options
  const effectiveTimeout = optTimeout || REQUEST_TIMEOUT
  console.log(`[fetchPage] 开始请求: ${url}${referer ? ` (Referer: ${referer})` : ''}`)

  // 从 URL 自动推导 Referer（如果未手动指定）
  const autoReferer = referer || (() => {
    try {
      const u = new URL(url)
      return `${u.protocol}//${u.host}/`
    } catch { return null }
  })()

  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.log(`[fetchPage] 第${attempt}次重试: ${url}`)
      await randomDelay()
    }

    let response
    try {
      response = await axios.get(url, {
        timeout: effectiveTimeout,
        headers: {
          'User-Agent': getRandomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          // 反爬虫：浏览器指纹头
          ...(autoReferer ? { 'Referer': autoReferer } : {}),
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        },
        responseType: 'text',
        responseEncoding: 'utf-8'
      })
      console.log(`[fetchPage] 请求成功: ${url}, 状态码: ${response.status}, 数据长度: ${(response.data || '').length}`)
      return response.data
    } catch (err) {
      lastError = err
      console.error(`[fetchPage] 请求失败(尝试${attempt + 1}/${retries + 1}): ${url}`, err.message)
      if (err.response) {
        console.error(`[fetchPage] HTTP状态码: ${err.response.status}, 响应长度: ${(err.response.data || '').length}`)
        // 403/429 不重试（被封锁，重试也没用）
        if ([403, 429].includes(err.response.status)) break
      }
    }
  }
  throw lastError
}

// ===== 爬取单个源 =====
async function scrapeSource(source) {
  const results = []
  const allListItems = []

  // 源级请求配置（可覆盖全局默认值）
  const srcTimeout = source.requestTimeout || REQUEST_TIMEOUT
  const srcRetries = (source.requestRetries !== undefined) ? source.requestRetries : 1

  console.log(`[scrapeSource] 开始抓取源: ${source.id} (${source.name}), listUrls数量: ${(source.listUrls || []).length}, 超时:${srcTimeout}ms, 重试:${srcRetries}`)

  // 1. 从所有 listUrl 获取文章链接
  let domainBlocked = false    // 标记：当前域名是否已被403封锁
  let blockedDomain = ''       // 被封锁的域名

  for (const listUrl of source.listUrls) {
    // 域名级403跳过：如果同域名的前一个URL已返回403，直接跳过
    if (domainBlocked) {
      try {
        const urlHost = new URL(listUrl).host
        if (urlHost === blockedDomain) {
          console.log(`[scrapeSource] ⏭️ 跳过(域名${urlHost}已被403): ${listUrl}`)
          continue
        }
      } catch { /* URL解析失败，不跳过 */ }
    }

    console.log(`[scrapeSource] 正在获取列表页: ${listUrl}`)
    try {
      const html = await fetchPage(listUrl, { timeout: srcTimeout, retries: srcRetries })
      console.log(`[scrapeSource] HTML长度: ${html.length}, 是否含RSS标签: ${html.includes('<rss')}, 是否含item: ${html.includes('<item>')}`)
      const root = parse(html)
      console.log(`[scrapeSource] 解析完成, root节点数(querySelectorAll('*').length): ${root.querySelectorAll('*').length}`)
      console.log(`[scrapeSource] item标签数量: ${root.querySelectorAll('item').length}`)
      
      // 调试：输出前3个item的结构
      const firstItems = root.querySelectorAll('item').slice(0, 3)
      firstItems.forEach((item, idx) => {
        const titleEl = item.querySelector('title')
        const linkEl = item.querySelector('link')
        console.log(`[scrapeSource] item#${idx}: title="${getText(titleEl)}", link="${getText(linkEl)}"`)
      })
      
      const items = source.parseList(root, listUrl)
      console.log(`[scrapeSource] parseList返回: ${items.length} 条文章`)
      if (items.length > 0) {
        items.slice(0, 3).forEach((a, i) => {
          console.log(`[scrapeSource] 文章#${i}: url=${a.url?.slice(0, 80)}, title=${a.title?.slice(0, 50)}, hasImage=!!${!!a.imageUrl}, hasSummary=!!${!!a.summary}`)
        })
      }
      allListItems.push(...items)
    } catch (err) {
      console.error(`[${source.id}] 获取列表页失败: ${listUrl}`, err.message)
      // 检测403封锁并标记域名
      if (err.response && err.response.status === 403) {
        try {
          blockedDomain = new URL(listUrl).host
          domainBlocked = true
          console.log(`[scrapeSource] 🚫 域名 ${blockedDomain} 已返回403，跳过该域名的其余URL`)
        } catch { /* 忽略URL解析错误 */ }
      }
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
    const dedupSkippedCount = targetItems.filter(i => existingSet.has(i.url)).length
    console.log(`[scrapeSource] 数据库去重: 总${targetItems.length}篇, 已存在${dedupSkippedCount}篇, 待抓取${targetItems.length - dedupSkippedCount}篇`)

    // 3. 逐个抓取新文章详情
    let successCount = 0
    let failCount = 0
    for (const item of targetItems) {
      if (existingSet.has(item.url)) continue

      try {
        const html = await fetchPage(item.url)
        const root = parse(html)
        const detail = source.parseDetail(root, item.url)

        // 生成摘要（优先使用详情页正文生成，降级使用RSS的description）
        let summary = item.summary || ''
        if (detail.content && !summary) {
          const tempRoot = parse(detail.content)
          summary = tempRoot.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
        }

        // 图片：优先使用详情页og:image，降级使用RSS media:content
        const imageUrl = detail.imageUrl || item.imageUrl || ''

        // 提取发布时间：优先使用RSS的pubDate，再尝试详情页meta标签
        let publishedAt = item.publishedAt || 0
        const timeMeta = getAttr(root.querySelector('meta[property="article:published_time"]'), 'content') ||
          getAttr(root.querySelector('meta[name="date"]'), 'content') ||
          getAttr(root.querySelector('meta[itemprop="datePublished"]'), 'content') ||
          getAttr(root.querySelector('time[datetime]'), 'datetime') ||
          getAttr(root.querySelector('meta[name="sailthru.date"]'), 'content') ||
          getAttr(root.querySelector('meta[name="DC.date.issued"]'), 'content')
        if (timeMeta) {
          const parsed = new Date(timeMeta)
          if (!isNaN(parsed.getTime())) {
            publishedAt = parsed.getTime()
          }
        }
        // 降级：从文本中提取巴西日期格式 "dd/mm/aaaa"
        if (publishedAt === Date.now()) {
          const allText = getTextSafe(root)
          const brDateMatch = allText.match(/(\d{1,2})\.?(abr|jan|fev|mar|mai|jun|jul|ago|set|out|nov|dez)\.?\.?\s*(\d{4})/i) ||
            allText.match(/(\d{2})\/(\d{2})\/(\d{4})/)
          if (brDateMatch) {
            const monthMap = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 }
            if (brDateMatch[2]) {
              // 文本月份格式：02.abr.2026
              const day = parseInt(brDateMatch[1])
              const month = monthMap[brDateMatch[2].toLowerCase()]
              const year = parseInt(brDateMatch[3])
              if (month !== undefined) publishedAt = new Date(year, month, day).getTime()
            } else {
              // 数字格式：02/04/2026
              const day = parseInt(brDateMatch[1])
              const month = parseInt(brDateMatch[2]) - 1
              const year = parseInt(brDateMatch[3])
              publishedAt = new Date(year, month, day).getTime()
            }
          }
        }

        const now = Date.now()
        results.push({
          title: item.title,
          content: cleanHtml(detail.content),
          summary,
          imageUrl,
          source: source.id,
          sourceName: source.name,
          sourceUrl: item.url,
          category: detail.category || '',
          author: detail.author || '',
          publishedAt,
          scrapedAt: now,
          createdAt: now,
          updatedAt: now
        })
        successCount++
        console.log(`[scrapeSource] ✅ 详情成功: "${item.title?.slice(0, 40)}" (${item.url?.slice(0, 60)})`)

        await randomDelay()
      } catch (err) {
        failCount++
        console.error(`[scrapeSource] ❌ 详情失败: ${item.url}`, err.message)
      }
    }
    console.log(`[scrapeSource] 详情页统计: 成功=${successCount}, 失败=${failCount}, 跳过(已存在)=${dedupSkippedCount}`)
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
  const { action } = event || {}
  
  console.log(`[main] 收到请求, action="${action || '(空-默认refresh)'}", 触发方式: ${context && context.trigger_name ? context.trigger_name : '手动调用'}`)

  try {
        switch (action || 'refresh') {
      case 'list': return await handleList(event)
      case 'detail': return await handleDetail(event)
      case 'refresh':
        console.log('[main] 执行 refresh 操作')
        return await handleRefresh(event)
      default: // 未知操作（非空但不是已知action）
        return fail('未知操作', 400)
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

  // 当数据用完时（hasMore=false 且总数据不足），触发后台刷新以获取更多
  if (!hasMore && total < 30) {
    handleRefresh(event).catch(err => console.error('数据不足，后台补充刷新失败:', err.message))
  }

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
  console.log(`[handleRefresh] 开始刷新, 启用的源数量: ${enabledSources.length}, 源列表: ${enabledSources.map(s => s.id).join(',')}`)
  const allNewArticles = []

  for (const source of enabledSources) {
    try {
      console.log(`开始抓取: ${source.name}`)
      const articles = await scrapeSource(source)
      console.log(`${source.name}: scrapeSource返回 ${articles.length} 篇, 文章URL列表: ${articles.map(a => a.sourceUrl?.slice(0, 60)).join(' | ')}`)
      allNewArticles.push(...articles)
    } catch (err) {
      console.error(`${source.name} 抓取失败:`, err.message)
      console.error(`${source.name} 错误堆栈:`, err.stack || '无')
    }
  }

  // 批量写入数据库（全局去重）
  let writtenCount = 0
  if (allNewArticles.length > 0) {
    console.log(`[handleRefresh] 准备去重, 新文章总数: ${allNewArticles.length}`)
    // 先查库中已存在的 sourceUrl，避免跨源重复
    const allUrls = allNewArticles.map(a => a.sourceUrl)
    const existingDocs = await newsArticlesCollection
      .where({ sourceUrl: _.in(allUrls) })
      .field({ sourceUrl: true })
      .limit(500)
      .get()
    console.log(`[handleRefresh] 数据库已有文章数: ${existingDocs.data.length}`)
    const existingSet = new Set(existingDocs.data.map(d => d.sourceUrl))
    const deduped = allNewArticles.filter(a => !existingSet.has(a.sourceUrl))
    console.log(`[handleRefresh] 去重后待写入: ${deduped.length} 篇`)

    if (deduped.length > 0) {
      const batchSize = 20
      for (let i = 0; i < deduped.length; i += batchSize) {
        const batch = deduped.slice(i, i + batchSize)
        await newsArticlesCollection.add({ data: batch })
      }
      writtenCount = deduped.length
      console.log(`共写入 ${writtenCount} 篇新文章（去重后）`)
    } else {
      console.log(`[handleRefresh] 所有文章均已存在，无需写入`)
    }
  } else {
    console.log(`[handleRefresh] 没有新文章需要处理（scrapeSource返回为空）`)
  }

  // 清理旧文章
  await cleanOldArticles()

  return success({
    newCount: writtenCount,
    sourcesProcessed: enabledSources.length
  }, '刷新完成')
}
