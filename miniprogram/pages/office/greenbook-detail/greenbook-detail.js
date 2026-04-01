/**
 * 小绿书 - 帖子详情页
 * Skyline 渲染 + share-element 卡片转场 + 手势返回
 */
const app = getApp()
const utils = require('../../../common/utils.js')

Component({
  data: {
    postId: '',
    index: -1,
    post: null,

    // 图片swiper
    currentImage: 0,
    swiperHeight: 375,

    // 交互状态
    isLiked: false,
    isCollected: false,
    likeCount: 0,
    collectCount: 0,
    commentCount: 0,

    // 评论
    comments: [],
    commentPage: 1,
    commentHasMore: false,
    loadingComments: false,

    // 输入
    commentContent: '',
    replyTarget: null, // { commentId, authorName }

    // 导航栏
  },

  lifetimes: {
    created() {
      try {
        const { shared } = wx.worklet
        this.startX = shared(0)
        this.startY = shared(0)
        this.transX = shared(0)
        this.transY = shared(0)
        this.isInteracting = shared(false)
      } catch (e) {}
    },
    attached() {
      const { postId, index } = this.data
      this.setData({ postId, index: parseInt(index) || 0 })

      const { screenWidth } = wx.getSystemInfoSync()

      try {
        this.customRouteContext = wx.router?.getRouteContext(this)
        const { primaryAnimation, primaryAnimationStatus, userGestureInProgress, shareEleTop } = this.customRouteContext || {}

        const { Easing, shared, derived } = wx.worklet
        const AnimationStatus = { dismissed: 0, forward: 1, reverse: 2, completed: 3 }
        const Curves = { fastOutSlowIn: Easing.cubicBezier(0.4, 0.0, 0.2, 1.0) }

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

        const _curvePrimaryAnimation = CurveAnimation({
          animation: primaryAnimation, animationStatus: primaryAnimationStatus,
          curve: Easing.in(Curves.fastOutSlowIn),
          reverseCurve: Easing.out(Curves.fastOutSlowIn)
        })

        // 内容淡入
        this.applyAnimatedStyle('.gb-detail-content', () => {
          'worklet'
          return { opacity: _curvePrimaryAnimation.value }
        })

        // 卡片缩放
        this.applyAnimatedStyle('#gb-fake-host', () => {
          'worklet'
          if (userGestureInProgress.value &&
              globalThis['GbRouteCardSrcRect'] &&
              globalThis['GbRouteCardSrcRect'].value != undefined) {
            const begin = globalThis['GbRouteCardSrcRect'].value
            const end = globalThis['GbRouteCardDestRect'].value
            const t = 1 - _curvePrimaryAnimation.value
            const shareEleX = lerp(begin.left, end.left, t)
            const shareEleY = lerp(begin.top, end.top, t)
            const shareEleW = lerp(begin.width, end.width, t)
            const scale = shareEleW / screenWidth
            return {
              transform: `translateX(${shareEleX}px) translateY(${shareEleY - shareEleTop.value * scale}px) scale(${scale})`,
              transformOrigin: '0 0'
            }
          }
          return {
            transform: `translateX(${this.transX.value}px) translateY(${this.transY.value}px) scale(${clamp(1 - this.transX.value / screenWidth * 0.5, 0, 1)})`,
            transformOrigin: '50% 50%'
          }
        }, { immediate: false })
      } catch (e) {
        console.warn('路由动画初始化失败:', e)
      }

      // 加载数据
      this.loadPostDetail()
      this.loadComments()
    }
  },

  methods: {
    /**
     * 加载帖子详情
     */
    async loadPostDetail() {
      const { postId } = this.data
      if (!postId) return

      try {
        const res = await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: { action: 'detail', postId }
        })

        if (res.result.code === 0) {
          const post = res.result.data
          const { screenWidth } = wx.getSystemInfoSync()
          const firstRatio = post.imageRatios && post.imageRatios[0] ? post.imageRatios[0] : 1
          this.setData({
            post,
            isLiked: post.isLiked || false,
            isCollected: post.isCollected || false,
            likeCount: post.likeCount || 0,
            collectCount: post.collectCount || 0,
            commentCount: post.commentCount || 0,
            swiperHeight: screenWidth / firstRatio,
            currentImage: 0
          })
        }
      } catch (e) {
        console.error('加载详情失败:', e)
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    },

    /**
     * 加载评论
     */
    async loadComments(append = false) {
      const { postId, commentPage } = this.data
      if (!postId) return
      if (this.data.loadingComments) return
      this.setData({ loadingComments: true })

      try {
        const res = await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: {
            action: 'getComments',
            postId,
            page: append ? commentPage : 1,
            pageSize: 20
          }
        })

        if (res.result.code === 0) {
          const { comments, hasMore } = res.result.data
          this.setData({
            comments: append ? [...this.data.comments, ...comments] : comments,
            commentPage: (append ? commentPage : 1) + 1,
            commentHasMore: hasMore,
            loadingComments: false
          })
        }
      } catch (e) {
        console.error('加载评论失败:', e)
        this.setData({ loadingComments: false })
      }
    },

    /**
     * 图片切换
     */
    handleSwiperChange(e) {
      this.setData({ currentImage: e.detail.current })
    },

    /**
     * 点赞
     */
    async handleLike() {
      const { postId, isLiked } = this.data
      // 乐观更新
      this.setData({
        isLiked: !isLiked,
        likeCount: isLiked ? this.data.likeCount - 1 : this.data.likeCount + 1
      })
      try {
        await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: { action: 'toggleLike', targetId: postId, targetType: 'post' }
        })
      } catch (e) {
        // 回滚
        this.setData({
          isLiked,
          likeCount: this.data.likeCount + (isLiked ? 1 : -1)
        })
      }
    },

    /**
     * 收藏
     */
    async handleCollect() {
      const { postId, isCollected } = this.data
      this.setData({
        isCollected: !isCollected,
        collectCount: isCollected ? this.data.collectCount - 1 : this.data.collectCount + 1
      })
      try {
        await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: { action: 'toggleCollect', postId }
        })
      } catch (e) {
        this.setData({
          isCollected,
          collectCount: this.data.collectCount + (isCollected ? 1 : -1)
        })
      }
    },

    /**
     * 输入评论
     */
    handleCommentInput(e) {
      this.setData({ commentContent: e.detail.value })
    },

    /**
     * 聚焦评论输入
     */
    handleCommentFocus(e) {
      // 检查用户是否已登录
      app.checkUserRegistration().then(result => {
        if (!result.registered) {
          wx.showToast({ title: '请先完成注册', icon: 'none' })
          return
        }
      })
    },

    /**
     * 发送评论
     */
    async handleSendComment() {
      const { postId, commentContent, replyTarget } = this.data
      if (!commentContent || !commentContent.trim()) {
        wx.showToast({ title: '请输入评论内容', icon: 'none' })
        return
      }

      try {
        const res = await wx.cloud.callFunction({
          name: 'greenbookManager',
          data: {
            action: 'addComment',
            postId,
            content: commentContent.trim(),
            replyToId: replyTarget ? replyTarget.commentId : '',
            replyToName: replyTarget ? replyTarget.authorName : ''
          }
        })

        if (res.result.code === 0) {
          this.setData({ commentContent: '', replyTarget: null })
          this.loadComments(false)
          this.setData({ commentCount: this.data.commentCount + 1 })
          wx.showToast({ title: '评论成功', icon: 'success' })
        }
      } catch (e) {
        wx.showToast({ title: '评论失败', icon: 'none' })
      }
    },

    /**
     * 回复评论
     */
    handleReplyComment(e) {
      const { commentId, authorName } = e.currentTarget.dataset
      this.setData({
        replyTarget: { commentId, authorName },
        commentContent: `@${authorName} `
      })
    },

    /**
     * 取消回复
     */
    handleCancelReply() {
      this.setData({ replyTarget: null, commentContent: '' })
    },

    /**
     * 返回
     */
    handleBack() {
      wx.navigateBack({ delta: 1 })
    },

    /**
     * 更多操作
     */
    handleMore() {
      const { post } = this.data
      if (!post) return

      wx.showActionSheet({
        itemList: ['删除帖子'],
        success: async (res) => {
          if (res.tapIndex === 0) {
            const confirm = await wx.showModal({
              title: '确认删除',
              content: '删除后不可恢复',
              confirmColor: '#DC2626'
            })
            if (confirm.confirm) {
              try {
                const result = await wx.cloud.callFunction({
                  name: 'greenbookManager',
                  data: { action: 'delete', postId: post._id }
                })
                if (result.result.code === 0) {
                  wx.showToast({ title: '已删除', icon: 'success' })
                  setTimeout(() => wx.navigateBack(), 1500)
                }
              } catch (e) {
                wx.showToast({ title: '删除失败', icon: 'none' })
              }
            }
          }
        }
      })
    },

    /**
     * 加载更多评论
     */
    loadMoreComments() {
      if (this.data.commentHasMore && !this.data.loadingComments) {
        this.loadComments(true)
      }
    },

    /**
     * 手势返回
     */
    handlePanGesture(e) {
      try {
        'worklet'
        const GestureState = { POSSIBLE: 0, BEGIN: 1, ACTIVE: 2, END: 3, CANCELLED: 4 }
        const { screenWidth } = wx.getSystemInfoSync()
        const { startUserGesture, stopUserGesture, primaryAnimation, didPop } = this.customRouteContext

        if (e.state === GestureState.BEGIN) {
          this.startX.value = e.absoluteX
          this.startY.value = e.absoluteY
        } else if (e.state === GestureState.ACTIVE) {
          if (e.deltaX > 0 && !this.isInteracting.value) {
            this.isInteracting.value = true
          }
          if (!this.isInteracting.value) return

          const transLowerBound = -1 / 3 * screenWidth
          const transUpperBound = 2 / 3 * screenWidth
          const transX = e.absoluteX - this.startX.value
          this.transX.value = Math.min(Math.max(transX, transLowerBound), transUpperBound)
          this.transY.value = e.absoluteY - this.startY.value
        } else if (e.state === GestureState.END || e.state === GestureState.CANCELLED) {
          if (!this.isInteracting.value) return
          this.isInteracting.value = false

          const { timing, Easing } = wx.worklet
          let shouldFinish = false
          if (e.velocityX > 500 || this.transX.value / screenWidth > 0.25) {
            shouldFinish = true
          }
          if (shouldFinish) {
            startUserGesture()
            primaryAnimation.value = timing(0.0, { duration: 180, easing: Easing.linear }, () => {
              'worklet'
              stopUserGesture()
              didPop()
            })
          } else {
            this.transX.value = timing(0.0, { duration: 100 })
            this.transY.value = timing(0.0, { duration: 100 })
          }
        }
      } catch (e) {}
    },

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
      return utils.formatRelativeTime(timestamp)
    }
  }
})
