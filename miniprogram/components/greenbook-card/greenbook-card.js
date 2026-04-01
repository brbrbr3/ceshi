/**
 * 小绿书 - 帖子卡片组件
 * 支持瀑布流展示 + share-element 卡片转场
 */
Component({
  options: {
    virtualHost: true
  },

  properties: {
    item: { type: Object, value: {} },
    cardWidth: { type: Number, value: 0 },
    index: { type: Number, value: 0 }
  },

  lifetimes: {
    attached() {
      try {
        const { shared } = wx.worklet
        this.scale = shared(1)
        this.opacity = shared(0)
        this.srcWidth = shared('100%')
        this.radius = shared(16)

        const beginRect = shared(undefined)
        const endRect = shared(undefined)
        wx.worklet.runOnUI(() => {
          'worklet'
          globalThis['GbRouteCardSrcRect'] = beginRect
          globalThis['GbRouteCardDestRect'] = endRect
        })()
      } catch (e) {
        // worklet 不可用时静默处理
      }
    },
    ready() {
      try {
        this.applyAnimatedStyle('.greenbook-card-wrap', () => {
          'worklet'
          return {
            width: this.srcWidth.value,
            transform: `scale(${this.scale.value})`
          }
        }, { immediate: false, flush: 'sync' }, () => {})

        this.applyAnimatedStyle('.greenbook-card-image', () => {
          'worklet'
          return {
            opacity: this.opacity.value,
            borderTopRightRadius: this.radius.value,
            borderTopLeftRadius: this.radius.value
          }
        }, { immediate: false, flush: 'sync' }, () => {})

        this.applyAnimatedStyle('.greenbook-card-desc', () => {
          'worklet'
          return { opacity: this.opacity.value }
        }, { immediate: false, flush: 'sync' }, () => {})
      } catch (e) {
        // share-element 动画不可用时静默处理
      }
    }
  },

  methods: {
    /**
     * 点击卡片跳转详情
     */
    handleCardTap(e) {
      const { item, index } = this.data
      const url = `/pages/office/greenbook-detail/greenbook-detail?postId=${item._id}&index=${index}`
      wx.navigateTo({
        url,
        routeType: 'GbCardTransition'
      })
    },

    /**
     * share-element 帧回调
     */
    handleFrame(data) {
      'worklet'
      try {
        const FlightDirection = { PUSH: 0, POP: 1 }

        if (data.direction === FlightDirection.PUSH) {
          this.srcWidth.value = `${data.begin.width}px`
          this.scale.value = data.current.width / data.begin.width
          this.opacity.value = 1 - data.progress
          this.radius.value = 0
        } else if (data.direction === FlightDirection.POP) {
          this.scale.value = data.current.width / data.end.width
          this.opacity.value = data.progress
          this.radius.value = 16
        }

        if (globalThis['GbRouteCardSrcRect'] && globalThis['GbRouteCardSrcRect'].value == undefined) {
          globalThis['GbRouteCardSrcRect'].value = data.begin
        }
        if (globalThis['GbRouteCardDestRect'] && globalThis['GbRouteCardDestRect'].value == undefined) {
          globalThis['GbRouteCardDestRect'].value = data.end
        }
      } catch (e) {}
    },

    /**
     * 点赞
     * 注意：wxml 中使用 catchtap 已阻止冒泡，无需调用 stopPropagation
     */
    handleLike(e) {
      const { item } = this.data
      this.triggerEvent('like', { postId: item._id, isLiked: !item.isLiked })
    }
  }
})
