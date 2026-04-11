const app = getApp()
const utils = require('../../../common/utils.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  // 使用统一的时间处理函数
  return utils.formatShortDateTime(timestamp)
}

Page({
  data: {
    menuId: '',
    menu: {},
    comments: [],
    commentText: '',
    currentUser: null,
    canEdit: false,
    canDelete: false,
    // 菜品打分相关数据
    dishRatings: [],
    extractedDishes: [],
    showRatingPopup: false,
    tempRatings: {},
    myRatedDishes: {},
    hasTempRatings: false,
    ratingsLoading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ menuId: options.id })
      this.loadMenu()
      this.loadComments()
      this.checkPermission()
    }
  },

  onShow() {
    // 字体缩放
    const fontScale = app.globalData.fontScale || 1
    if (this.data.fontScale !== fontScale) {
      this.setData({
        fontScale,
        pageStyle: `--font-scale: ${fontScale}`
      })
    }
    // 每次显示页面时刷新数据（从编辑页返回时自动更新）
    if (this.data.menuId) {
      this.loadMenu()
      this.loadComments()
      this.loadRatings()
    }
  },

  checkPermission() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          return
        }

        const currentUser = result.user
        const isWorker = currentUser.role === '工勤'
        const isAdmin = currentUser.isAdmin

        this.setData({
          currentUser,
          canEdit: isWorker || isAdmin,
          canDelete: isWorker || isAdmin
        })
      })
      .catch((error) => {
        console.error('检查权限失败', error)
      })
  },

  loadMenu() {
    const db = wx.cloud.database()
    db.collection('menus')
      .doc(this.data.menuId)
      .get()
      .then(res => {
        this.setData({
          menu: {
            ...res.data,
            timeText: formatTime(res.data.createdAt)
          }
        })
        // 菜单内容加载完成后，提取菜品并加载打分数据
        this.loadRatings()
      })
      .catch(error => {
        console.error('加载菜单失败', error)
        utils.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  loadComments() {
    // 先获取当前用户信息
    app.checkUserRegistration()
      .then((result) => {
        const currentUser = result.user
        const isAdmin = result.user ? result.user.isAdmin : false
        const currentOpenid = app.globalData.openid || ''

        const db = wx.cloud.database()
        db.collection('menu_comments')
          .where({
            menuId: this.data.menuId
          })
          .orderBy('createdAt', 'asc')
          .get()
          .then(res => {
            const comments = (res.data || []).map(item => {
              return {
                ...item,
                authorName: item.authorName || '用户',
                authorOpenid: item.authorOpenid || '',
                timeText: formatTime(item.createdAt),
                avatar: (item.authorName || '用户').slice(0, 1),
                avatarBg: utils.getAvatarColor(item.authorName || '用户'),
                canDelete: isAdmin || item.authorOpenid === currentOpenid
              }
            })

            this.setData({ comments })
          })
          .catch(error => {
            console.error('加载评论失败', error)
          })
      })
      .catch(() => {
        // 未登录用户，加载评论但不设置删除权限
        const db = wx.cloud.database()
        db.collection('menu_comments')
          .where({
            menuId: this.data.menuId
          })
          .orderBy('createdAt', 'asc')
          .get()
          .then(res => {
            const comments = (res.data || []).map(item => {
              return {
                ...item,
                authorName: item.authorName || '用户',
                authorOpenid: item.authorOpenid || '',
                timeText: formatTime(item.createdAt),
                avatar: (item.authorName || '用户').slice(0, 1),
                avatarBg: utils.getAvatarColor(item.authorName || '用户'),
                canDelete: false
              }
            })

            this.setData({ comments })
          })
          .catch(error => {
            console.error('加载评论失败', error)
          })
      })
  },

  onCommentInput(e) {
    this.setData({
      commentText: e.detail.value
    })
  },

  submitComment() {
    const content = this.data.commentText.trim()
    if (!content) {
      utils.showToast({
        title: '请输入评论内容',
        icon: 'none'
      })
      return
    }

    const openid = app.globalData.openid
    if (!openid) {
      utils.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          utils.showToast({
            title: '请先登录',
            icon: 'none'
          })
          return
        }

        const commentData = {
          menuId: this.data.menuId,
          content: content
        }

        wx.cloud.callFunction({
          name: 'menuManager',
          data: {
            action: 'addComment',
            commentData: commentData
          }
        })
          .then(() => {
            this.setData({ commentText: '' })
            this.loadComments()
            utils.showToast({
              title: '评论成功',
              icon: 'success'
            })
          })
          .catch(error => {
            console.error('提交评论失败', error)
            utils.showToast({
              title: '提交失败',
              icon: 'none'
            })
          })
      })
      .catch(() => {
        utils.showToast({
          title: '请先登录',
          icon: 'none'
        })
      })
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'deleteComment',
              menuId: id
            }
          })
            .then(() => {
              this.loadComments()
              utils.showToast({
                title: '删除成功',
                icon: 'success'
              })
            })
            .catch(error => {
              console.error('删除评论失败', error)
              utils.showToast({
                title: '删除失败',
                icon: 'none'
              })
            })
        }
      }
    })
  },

  goEdit() {
    wx.navigateTo({
      url: `/pages/office/menu-edit/menu-edit?id=${this.data.menuId}`
    })
  },

  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个菜单吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'deleteMenu',
              menuId: this.data.menuId
            }
          })
            .then(() => {
              utils.showToast({
                title: '删除成功',
                icon: 'success'
              })
              setTimeout(() => {
                wx.navigateBack()
              }, 500)
            })
            .catch(error => {
              console.error('删除菜单失败', error)
              utils.showToast({
                title: '删除失败',
                icon: 'none'
              })
            })
        }
      }
    })
  },

  onLinkTap(e) {
    const url = e.detail.href
    if (!url) return
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  },

  // ==================== 菜品打分相关方法 ====================

  /**
   * 从菜单内容中提取菜品名称
   * 策略：去除HTML标签 → 按换行符/空格分词 → 过滤无效项 → 去重
   */
  extractDishesFromContent(content) {
    if (!content) {
      console.warn('[menu-debug] extractDishesFromContent: content 为空，直接返回[]')
      return []
    }

    // 单字类别词（汤、粥等，单独出现时不是菜品名）
    const SINGLE_CHAR_CATEGORIES = new Set(['汤', '粥', '饭', '面', '粉'])

    // 停用词（非菜品的标题/分类/说明文字）
    const STOP_WORDS = new Set([
      '菜单', '今日菜单', '本周菜单', '午餐', '晚餐', '早餐',
      '主食', '副菜', '汤类', '甜品', '饮品', '凉菜', '热菜',
      '荤菜', '素菜', '推荐', '特别推荐', '厨师推荐',
      '备注', '说明', '注意', '温馨提示'
    ])

    // 日期匹配正则（排除"星期一"、"周一"、"汤星期二"等含日期标记的词）
    const DATE_PATTERN = /星期[一二三四五六日天]|周[一二三四五六日天]/

    // 1. 先将块级HTML标签替换为换行符（解决<p>标签间无空格导致文字粘连问题）
    let text = content.replace(/<\/?(?:p|div|section|article|h[1-6]|li|tr)[^>]*>/gi, '\n')
    text = text.replace(/<br\s*\/?>/gi, '\n')

    // 2. 再去除剩余的内联HTML标签
    text = text.replace(/<[^>]+>/g, '')

    // 3. 解码常见HTML实体
    text = text.replace(/&nbsp;/g, ' ')
                 .replace(/&amp;/g, '&')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')

    // 3. 按换行符和空格分词
    const tokens = text.split(/[\n\r\s]+/).map(t => t.trim()).filter(Boolean)
    // 4. 过滤并提取菜品名
    const dishes = []
    const seen = new Set()

    tokens.forEach(token => {
      // 规则1: 长度限制（至少2字，最多20字）—— 排除"汤"、"粥"等单字
      if (token.length < 2 || token.length > 20) return

      // 规则2: 排除日期相关词汇（"星期一"、"汤星期二"、"周一"等）
      if (DATE_PATTERN.test(token)) return

      // 规则3: 排除纯数字/符号
      if (/^[\d\-+*.=!@#$%^&()]+$/.test(token)) return

      // 规则4: 排除停用词
      if (STOP_WORDS.has(token)) return

      // 规则5: 至少包含1个中文汉字
      if (!/[\u4e00-\u9fa5]/.test(token)) return

      // 规则6: 清理首尾多余字符后再次校验长度
      const cleanToken = token.replace(/^[•·\-\*\.\s:：]+/, '').replace(/[•·\-\*\.\s:：]+$/, '')
      if (!cleanToken || cleanToken.length < 2 || cleanToken.length > 20) return

      // 规则7: 清理后的词也不能是日期或停用词
      if (DATE_PATTERN.test(cleanToken)) return
      if (SINGLE_CHAR_CATEGORIES.has(cleanToken)) return

      // 去重
      if (!seen.has(cleanToken)) {
        seen.add(cleanToken)
        dishes.push(cleanToken)
      }
    })

    return dishes
  },

  /** 加载打分数据 */
  loadRatings() {
    if (!this.data.menuId || !this.data.menu.content) {
      console.warn('[menu-debug] loadRatings 提前返回! 原因:', !this.data.menuId ? 'menuId为空' : 'menu.content为空')
      return
    }

    this.setData({ ratingsLoading: true })

    // 提取菜品列表
    const extractedDishes = this.extractDishesFromContent(this.data.menu.content)

    wx.cloud.callFunction({
      name: 'menuManager',
      data: { action: 'getRatings', ratingData: { menuId: this.data.menuId } }
    }).then(res => {
      if (res.result.code === 0) {
        const data = res.result.data
        const myRatedDishes = {}
        if (data.myRatings) {
          data.myRatings.forEach(r => {
            myRatedDishes[r.dishName] = r.score
          })
        }

        // 按平均评分从高到低排序
        const sortedRatings = (data.ratings || []).sort((a, b) => {
          return (b.averageScore || 0) - (a.averageScore || 0)
        })

        this.setData({
          dishRatings: sortedRatings,
          extractedDishes,
          myRatedDishes,
          ratingsLoading: false
        })
      } else {
        this.setData({
          dishRatings: [],
          extractedDishes,
          myRatedDishes: {},
          ratingsLoading: false
        })
      }
    }).catch(err => {
      console.error('加载打分数据失败', err)
      this.setData({
        dishRatings: [],
        extractedDishes,
        myRatedDishes: {},
        ratingsLoading: false
      })
    })
  },

  /** 打开打分弹窗 */
  openRatingPopup() {
    const openid = app.globalData.openid
    if (!openid) {
      utils.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    // 检查是否有可打分的菜品
    const dishes = this.data.extractedDishes
    if (!dishes || dishes.length === 0) {
      utils.showToast({ title: '未识别到菜品，无法打分', icon: 'none' })
      return
    }

    app.checkUserRegistration().then(result => {
      if (!result.registered || !result.user) {
        utils.showToast({ title: '请先登录', icon: 'none' })
        return
      }

      // 初始化临时评分（已评过的菜品预填分数但不可修改）
      const tempRatings = {}
      this.setData({ showRatingPopup: true, tempRatings, hasTempRatings: false })
    }).catch(() => {
      utils.showToast({ title: '请先登录', icon: 'none' })
    })
  },

  /** 关闭打分弹窗 */
  closeRatingPopup() {
    this.setData({ showRatingPopup: false, tempRatings: {}, hasTempRatings: false })
  },

  /** 选择星级 */
  handleStarTap(e) {
    const dishName = e.currentTarget.dataset.dish
    const star = parseInt(e.currentTarget.dataset.star)

    // 已评过的菜品不可再改
    if (this.data.myRatedDishes[dishName]) {
      utils.showToast({ title: '您已对该菜品打过分，不可修改', icon: 'none' })
      return
    }

    const tempRatings = { ...this.data.tempRatings }
    tempRatings[dishName] = star

    // 计算是否有有效评分
    const hasValidRating = Object.keys(tempRatings).some(k => tempRatings[k] >= 1)
    this.setData({ tempRatings, hasTempRatings: hasValidRating })
  },

  /** 提交打分 */
  submitRatings() {
    const tempRatings = this.data.tempRatings
    const keys = Object.keys(tempRatings).filter(k => tempRatings[k] >= 1)

    if (keys.length === 0) {
      utils.showToast({ title: '请至少为一道菜打分', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...', mask: true })

    // 逐个提交评分（串行）
    let promiseChain = Promise.resolve()

    keys.forEach(dishName => {
      const score = tempRatings[dishName]
      promiseChain = promiseChain.then(() => {
        return wx.cloud.callFunction({
          name: 'menuManager',
          data: {
            action: 'addRating',
            ratingData: {
              menuId: this.data.menuId,
              dishName,
              score
            }
          }
        })
      })
    })

    promiseChain.then(() => {
      wx.hideLoading()
      this.closeRatingPopup()
      this.loadRatings()
      utils.showToast({ title: `成功为${keys.length}道菜打分`, icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      console.error('提交打分失败', err)
      utils.showToast({ title: err.message || '提交失败', icon: 'none' })
    })
  }
})
