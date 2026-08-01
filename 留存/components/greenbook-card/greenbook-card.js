/**
 * 小绿书 - 帖子卡片组件
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

  methods: {
    handleCardTap(e) {
      const { item, index } = this.data
      const url = `/pages/office/greenbook-detail/greenbook-detail?postId=${item._id}`
      wx.navigateTo({ url })
    },

    handleLike(e) {
      const { item } = this.data
      this.triggerEvent('like', { postId: item._id, isLiked: !item.isLiked })
    }
  }
})
