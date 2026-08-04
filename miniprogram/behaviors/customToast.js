/**
 * 自定义 Toast Behavior
 * 支持多行文字、毛玻璃样式，可定制显示时长和淡出时长。
 * 
 * 使用方法：
 * 1. 页面引入 behaviors: [customToast]
 * 2. WXML 末尾加上 custom-toast 结构（见下方 WXML 模板）
 * 3. 调用 this._showCustomToast('文本', { duration: 2000, fadeOutMs: 400 })
 * 
 * WXML 模板（放在页面最外层 view 底部）：
 * <view class="custom-toast {{_customToast.visible ? 'is-visible' : ''}}" style="transition-duration: {{_customToast.fadeOutMs}}ms;">
 *   <view class="custom-toast-text">{{_customToast.text}}</view>
 * </view>
 *
 * WXSS 模板（追加到页面 wxss 末尾）：
 * .custom-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) scale(0.9);
 *   background: rgba(30,41,59,0.8); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
 *   border-radius: 20rpx; padding: 24rpx 40rpx; max-width: 600rpx;
 *   opacity: 0; pointer-events: none; z-index: 9999; box-shadow: 0 8rpx 40rpx rgba(0,0,0,0.2); }
 * .custom-toast.is-visible { opacity: 1; transform: translate(-50%,-50%) scale(1);
 *   transition: opacity 0.18s ease, transform 0.22s cubic-bezier(.25,.1,.25,1); }
 * .custom-toast-text { color: #fff; font-size: 28rpx; line-height: 1.7; text-align: center;
 *   word-break: break-all; }
 */

module.exports = Behavior({

  data: {
    _customToast: {
      visible: false,
      text: '',
      duration: 2000,
      fadeOutMs: 400
    },
    _toastTimer: null
  },

  methods: {
    /**
     * 显示自定义 Toast
     * @param {string} text - 提示文本（支持多行）
     * @param {Object} options - 可选配置
     * @param {number} options.duration - 可见时长（ms），默认 2000
     * @param {number} options.fadeOutMs - 淡出时长（ms），默认 400
     */
    _showCustomToast(text, options = {}) {
      const { duration = 2000, fadeOutMs = 400 } = options

      // 清除之前的定时器
      if (this.data._toastTimer) clearTimeout(this.data._toastTimer)

      this.setData({ _customToast: { visible: true, text, duration, fadeOutMs } })

      // 到时间后开始淡出
      this.data._toastTimer = setTimeout(() => {
        this.setData({ '_customToast.visible': false })
      }, duration)
    }
  },

  detached() {
    if (this.data._toastTimer) clearTimeout(this.data._toastTimer)
  }
})
