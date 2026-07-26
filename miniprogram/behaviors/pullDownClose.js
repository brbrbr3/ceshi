/**
 * 下拉关闭弹窗 Behavior
 *
 * 配合 pullDownClose.wxs 使用，提供 WXS 回调方法。
 * 需与 modalAnimation.js 一起引入。
 *
 * 使用方式：
 *   const modalAnimation = require('../../../behaviors/modalAnimation.js')
 *   const pullDownClose = require('../../../behaviors/pullDownClose.js')
 *
 *   Page({
 *     behaviors: [modalAnimation, pullDownClose],
 *
 *     // 页面可定义此方法处理关闭后的数据清理
 *     _onPullDownClosed(modalKey) {
 *       if (modalKey === 'showXxxPopup') {
 *         this.setData({ ... })
 *       }
 *     }
 *   })
 *
 * 注意：
 *   - 不使用 modalAnimating / is-closing，避免 CSS 动画与 WXS inline style 冲突
 *   - 使用独立的 _pullDownClosing 标志防止重复关闭
 *   - 页面的 hideXxx 方法应检查 this._pullDownClosing 以避免动画冲突
 */
module.exports = Behavior({
  methods: {
    /**
     * WXS 回调：下拉超过阈值后关闭弹窗
     * WXS 已完成滑出动画，此处等待 250ms 后隐藏 DOM
     * @param {Object} e - callMethod 事件，e.detail.modalKey 为弹窗键名
     */
    _onPullDownClose(e) {
      var modalKey = (e && e.detail && e.detail.modalKey) || 'showPersonPopup'

      // 防止重复关闭（_closeModal 或再次下拉）
      if (this._pullDownClosing) return
      this._pullDownClosing = true

      var self = this
      setTimeout(function () {
        self._pullDownClosing = false
        self.setData({
          [modalKey]: false
        })
        // 调用页面级清理回调（如有）
        if (typeof self._onPullDownClosed === 'function') {
          self._onPullDownClosed(modalKey)
        }
      }, 250)
    }
  }
})
