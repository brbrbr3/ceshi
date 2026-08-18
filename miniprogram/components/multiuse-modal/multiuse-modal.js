/**
 * multiuse-modal 多用途弹窗组件
 *
 * 能力：
 *  1. 纯确认弹窗（无输入框、无倒计时）
 *  2. 倒计时确认弹窗（countdown > 0，确认按钮锁定 N 秒，带环形倒计时）
 *  3. 输入弹窗（单输入/多输入，支持 text / password / textarea）
 *  4. 危险操作确认（danger 红色态）
 *
 * inputs 配置项：
 *  {
 *    key: 'xxx',          // 字段标识，confirm 事件回传 values[key]
 *    placeholder: '...',
 *    type: 'text' | 'password' | 'textarea',
 *    required: false,     // 是否必填（组件内做非空校验）
 *    emptyTip: '...',     // required 为空时的提示文案
 *    maxlength: 140
 *  }
 *
 * 事件：
 *  confirm -> e.detail.values  { key: value, ... }
 *  cancel  -> 无 detail
 */
Component({
  options: {
    styleIsolation: 'isolated'
  },

  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' },
    confirmText: { type: String, value: '确定' },
    cancelText: { type: String, value: '' },
    danger: { type: Boolean, value: false },
    countdown: { type: Number, value: 0 },
    confirmLoading: { type: Boolean, value: false },
    inputs: { type: Array, value: [] }
  },

  data: {
    _show: false,        // 实际渲染开关（配合退出动画）
    _closing: false,     // 退出动画播放中
    remaining: 0,        // 剩余倒计时秒数
    ringPercent: 0,      // 环形倒计时进度（0~100，剩余比例）
    inputItems: [],      // 处理后的输入项（含密码可见态）
    inputValues: {}      // 输入值 { key: value }
  },

  observers: {
    visible(v) {
      if (v) {
        this._open()
      } else if (this.data._show) {
        this._close()
      }
    }
  },

  lifetimes: {
    detached() {
      this._clearTimer()
    }
  },

  methods: {
    _open() {
      this._clearTimer()
      const countdown = this.properties.countdown || 0
      const inputs = (this.properties.inputs || []).map(item => ({
        ...item,
        _pwVisible: false
      }))
      const inputValues = {}
      inputs.forEach(i => { inputValues[i.key] = '' })

      this.setData({
        _show: true,
        _closing: false,
        remaining: countdown,
        ringPercent: countdown > 0 ? 100 : 0,
        inputItems: inputs,
        inputValues
      })

      if (countdown > 0) {
        this._timer = setInterval(() => {
          const remaining = this.data.remaining - 1
          if (remaining <= 0) {
            this._clearTimer()
            this.setData({ remaining: 0, ringPercent: 0 })
          } else {
            this.setData({
              remaining,
              ringPercent: Math.round((remaining / countdown) * 100)
            })
          }
        }, 1000)
      }
    },

    _close() {
      if (this.data._closing) return
      this._clearTimer()
      this.setData({ _closing: true })
      setTimeout(() => {
        this.setData({ _show: false, _closing: false })
      }, 250)
    },

    _clearTimer() {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    },

    handleInput(e) {
      const key = e.currentTarget.dataset.key
      this.setData({ [`inputValues.${key}`]: e.detail.value })
    },

    handleTogglePassword(e) {
      const index = e.currentTarget.dataset.index
      this.setData({
        [`inputItems[${index}]._pwVisible`]: !this.data.inputItems[index]._pwVisible
      })
    },

    handleConfirm() {
      if (this.data._closing) return
      if (this.data.remaining > 0) return // 倒计时未结束，不可确认
      if (this.properties.confirmLoading) return // 提交中，防重复

      // required 非空校验
      const items = this.data.inputItems || []
      for (const item of items) {
        if (item.required) {
          const val = String(this.data.inputValues[item.key] || '').trim()
          if (!val) {
            wx.showToast({ title: item.emptyTip || '请输入完整信息', icon: 'none' })
            return
          }
        }
      }

      this.triggerEvent('confirm', { values: this.data.inputValues })
    },

    handleCancel() {
      if (this.data._closing) return
      this.triggerEvent('cancel')
    },

    stopPropagation() {}
  }
})
