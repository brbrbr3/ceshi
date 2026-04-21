/**
 * 弹窗退出动画 Behavior
 *
 * 为页面提供统一的弹窗关闭动画能力。
 * 核心思路：先播放 CSS 退出动画（遮罩淡出 + 弹窗下滑），动画结束后再真正隐藏 DOM。
 *
 * 使用方式：
 *   1. 在页面 JS 中引入：const modalAnimation = require('../../../behaviors/modalAnimation.js')
 *   2. 挂载 behavior：behaviors: [modalAnimation]
 *   3. 将弹窗关闭方法改为调用 this._closeModal(key, callback)
 *   4. WXML 遮罩添加动态类：class="xxx-mask {{modalAnimating ? 'is-closing' : ''}}"
 *   5. WXSS 中添加退出动画关键帧和类（见 CODING_STANDARDS.md）
 *
 * 参考：meal-management 页面的完整实现
 */
module.exports = Behavior({
  data: {
    modalAnimating: false // true = 退出动画播放中，防止重复关闭
  },

  methods: {
    /**
     * 带退出动画的弹窗关闭
     * @param {string} modalKey - data 中控制弹窗显示的键名（如 'showFormPopup'）
     * @param {Function} [onAfterClose] - 动画结束后的回调（如清理关联数据）
     */
    _closeModal(modalKey, onAfterClose) {
      if (this.data.modalAnimating) return
      this.setData({ modalAnimating: true })

      // 退出动画时长 250ms，与 CSS 中 .is-closing 的 animation-duration 保持一致
      setTimeout(() => {
        const resetData = { [modalKey]: false, modalAnimating: false }
        this.setData(resetData)
        if (onAfterClose) onAfterClose()
      }, 250)
    },

    /** 阻止事件冒泡（弹窗内容区点击不关闭） */
    stopPropagation() {}
  }
})
