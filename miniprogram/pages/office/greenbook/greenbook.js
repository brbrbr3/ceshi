/**
 * 小绿书 - 帖子列表页
 * Skyline 渲染 + grid-view 瀑布流
 */
const app = getApp()

const CATEGORIES = ['推荐', '最新', '美食', '生活', '出行', '运动', '学习', '分享']

Component({
  data: {
    // 分类Tab
    categories: CATEGORIES,
    activeCategory: '推荐',

    // 瀑布流数据
    list: [],
    cardWidth: 0,
    gap: 8,

    // 分页
    page: 1,
    hasMore: true,
    loading: false,

    // 搜索
    searchKeyword: '',

    // 状态栏高度
    statusBarHeight: 0,
    navBarHeight: 44,
    contentTop: 0,

    // 底部安全区域
    safeBottom: 0,

    // 初始化完成标记
    ready: false
  },

  lifetimes: {
    attached() {
      const { screenWidth, statusBarHeight } = wx.getSystemInfoSync()
      const gap = 8
      const padding = gap * 2
      const cardWidth = (screenWidth - padding - gap) / 2

      this.setData({
        cardWidth,
        gap,
        statusBarHeight,
        contentTop: statusBarHeight + 44,
        safeBottom: wx.getSystemInfoSync().safeArea?.bottom ? 0 : 20,
        ready: true
      })

      // 安装自定义路由
      this.installRouteBuilder()

      this.loadPosts()
    }
  },

  pageLifetimes: {
    show() {
      if (this.data.ready) {
        this.refreshPosts()
      }
    }
  },

  methods: {
    /**
     * 安装自定义路由 builder（卡片缩放转场）
     */
    installRouteBuilder() {
      try {
        if (wx.router && wx.router.addRouteBuilder && !this._routeInstalled) {
          const { Easing, shared, derived } = wx.worklet

          const AnimationStatus = { dismissed: 0, forward: 1, reverse: 2, completed: 3 }
          const Curves = {
            fastOutSlowIn: Easing.cubicBezier(0.4, 0.0, 0.2, 1.0)
          }

          function CurveAnimation({ animation, animationStatus, curve, reverseCurve }) {
            return derived(() => {
              'worklet'
              const useForwardCurve = !reverseCurve || animationStatus.value !== AnimationStatus.reverse
              const activeCurve = useForwardCurve ? curve : reverseCurve
              const t = animation.value
              if (!activeCurve) return t
              if (t === 0 || t === 1) return t
              return activeCurve(t)
            })
          }

          function lerp(begin, end, t) {
            'worklet'
            return begin + (end - begin) * t
          }

          function clamp(cur, lowerBound, upperBound) {
            'worklet'
            if (cur > upperBound) return upperBound
            if (cur < lowerBound) return lowerBound
            return cur
          }

          const ScaleTransitionRouteBuilder = (routeContext) => {
            const { primaryAnimation, primaryAnimationStatus, userGestureInProgress } = routeContext
            const shareEleTop = shared(0)
            routeContext.shareEleTop = shareEleTop

            const _curvePrimaryAnimation = CurveAnimation({
              animation: primaryAnimation,
              animationStatus: primaryAnimationStatus,
              curve: Easing.in(Curves.fastOutSlowIn),
              reverseCurve: Easing.out(Curves.fastOutSlowIn)
            })

            const reset = () => {
              'worklet'
              if (globalThis['GbRouteCardSrcRect']) globalThis['GbRouteCardSrcRect'].value = undefined
              if (globalThis['GbRouteCardDestRect']) globalThis['GbRouteCardDestRect'].value = undefined
            }

            const handlePrimaryAnimation = () => {
              'worklet'
              const status = primaryAnimationStatus.value

              if (userGestureInProgress.value) {
                return { opacity: Easing.out(Easing.cubicBezier(0.5, 0, 0.7, 0.5)(primaryAnimation.value)) }
              }

              if (status == AnimationStatus.dismissed) { reset(); return { transform: 'translate(0, 0) scale(0)' } }
              if (status == AnimationStatus.completed) { reset(); return { transform: 'translate(0, 0) scale(1)' } }

              let transX = 0, transY = 0, scale = status === AnimationStatus.reverse ? 1 : 0

              if (globalThis['GbRouteCardSrcRect'] && globalThis['GbRouteCardSrcRect'].value != undefined) {
                const begin = globalThis['GbRouteCardSrcRect'].value
                const end = globalThis['GbRouteCardDestRect'].value

                if (status === AnimationStatus.forward) shareEleTop.value = end.top

                let t = _curvePrimaryAnimation.value
                if (status === AnimationStatus.reverse || status === AnimationStatus.dismissed) t = 1 - t

                const shareEleX = lerp(begin.left, end.left, t)
                const shareEleY = lerp(begin.top, end.top, t)
                const shareEleW = lerp(begin.width, end.width, t)
                transX = shareEleX

                if (status === AnimationStatus.reverse) {
                  scale = shareEleW / begin.width
                  transY = shareEleY - begin.top * scale
                } else {
                  scale = shareEleW / end.width
                  transY = shareEleY - end.top * scale
                }
              }

              return {
                transform: `translate(${transX}px, ${transY}px) scale(${scale})`,
                transformOrigin: '0 0',
                opacity: _curvePrimaryAnimation.value
              }
            }

            return {
              opaque: false, handlePrimaryAnimation,
              transitionDuration: 250, reverseTransitionDuration: 250,
              canTransitionTo: false, canTransitionFrom: false,
              barrierColor: "rgba(0, 0, 0, 0.3)"
            }
          }

          wx.router.addRouteBuilder('GbCardTransition', ScaleTransitionRouteBuilder)
          this._routeInstalled = true
        }
      } catch (e) {
        console.warn('[greenbook] 路由安装失败:', e)
      }
    },

    /**
     * 加载帖子列表
     */
    async loadPosts(append = false) {
      if (this.data.loading) return
      this.setData({ loading: true })

      try {
        const { activeCategory, page } = this.data
        const res = await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: {
            action: 'list',
            page: append ? page : 1,
            pageSize: 20,
            category: activeCategory === '推荐' ? '' : activeCategory,
            sortBy: activeCategory === '最新' ? 'latest' : 'hot'
          }
        })

        if (res.result.code === 0) {
          const { list, hasMore } = res.result.data
          this.setData({
            list: append ? [...this.data.list, ...list] : list,
            page: append ? page + 1 : 2,
            hasMore,
            loading: false
          })
        }
      } catch (e) {
        console.error('加载帖子失败:', e)
        this.setData({ loading: false })
      }
    },

    /**
     * 刷新帖子
     */
    refreshPosts() {
      this.setData({ page: 1, hasMore: true })
      this.loadPosts(false)
    },

    /**
     * 加载更多
     */
    loadMore() {
      if (this.data.hasMore && !this.data.loading) {
        this.loadPosts(true)
      }
    },

    /**
     * 分类切换
     */
    handleCategoryTap(e) {
      const category = e.currentTarget.dataset.category
      if (category === this.data.activeCategory) return
      this.setData({ activeCategory: category, page: 1, hasMore: true, list: [] })
      this.loadPosts(false)
    },

    /**
     * 搜索
     */
    handleSearchInput(e) {
      this.setData({ searchKeyword: e.detail.value })
    },

    handleSearchConfirm() {
      // TODO: 实现搜索功能
    },

    /**
     * 跳转发帖页
     */
    handleCreate() {
      wx.navigateTo({ url: '/pages/office/greenbook-create/greenbook-create' })
    },

    /**
     * 下拉刷新
     */
    handleRefresh() {
      this.refreshPosts()
    },

    /**
     * 滚动到底部
     */
    handleScrollToLower() {
      this.loadMore()
    }
  }
})
