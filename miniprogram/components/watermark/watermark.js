/**
 * 水印组件
 *
 * 在页面上叠加显示用户信息水印（姓名、昵称、openid 脱敏）
 * 使用 Canvas 2D 离屏绘制水印单元，导出为图片后以背景平铺方式覆盖全屏
 *
 * 水印单元布局：每个单元是一行，行内按 姓名 → 昵称 → openid 顺序横向排列
 * openid 脱敏规则：保留前 4 位 + ... + 后 4 位
 *
 * 使用方法：
 * 1. 页面 JSON 中引入：{ "usingComponents": { "watermark": "/components/watermark/watermark" } }
 * 2. 页面 WXML 中添加：<watermark />
 * 3. 默认自动获取用户信息（app.checkUserRegistration），也可手动传入 name/nickName/openid
 */

Component({
  properties: {
    // 用户姓名，不传则自动获取
    name: {
      type: String,
      value: ''
    },
    // 微信昵称，不传则自动获取
    nickName: {
      type: String,
      value: ''
    },
    // openid，不传则自动获取
    openid: {
      type: String,
      value: ''
    },
    // 是否自动调用 app.checkUserRegistration() 获取用户信息
    autoFetch: {
      type: Boolean,
      value: true
    },
    // 水印透明度（0-1）
    opacity: {
      type: Number,
      value: 0.06
    },
    // 字体大小（px）
    fontSize: {
      type: Number,
      value: 8
    },
    // 文字颜色
    color: {
      type: String,
      value: '#000000'
    },
    // 旋转角度
    rotate: {
      type: Number,
      value: -22
    },
    // 水印单元宽度（px）
    gapX: {
      type: Number,
      value: 120
    },
    // 水印单元高度（px）
    gapY: {
      type: Number,
      value: 50
    },
    // 层级
    zIndex: {
      type: Number,
      value: 999
    },
    // 是否显示
    visible: {
      type: Boolean,
      value: true
    }
  },

  data: {
    watermarkUrl: '',
    _name: '',
    _nickName: '',
    _openid: ''
  },

  lifetimes: {
    attached() {
      if (this.data.autoFetch) {
        this.fetchUserInfo()
      } else {
        this.setData({
          _name: this.data.name,
          _nickName: this.data.nickName,
          _openid: this.data.openid
        })
        this.drawWatermark()
      }
    }
  },

  observers: {
    'name, nickName, openid': function (name, nickName, openid) {
      if (!this.data.autoFetch) {
        this.setData({ _name: name, _nickName: nickName, _openid: openid })
        this.drawWatermark()
      }
    }
  },

  methods: {
    /**
     * 获取用户信息（遵循编码规范 §6.2 使用 app.checkUserRegistration）
     */
    async fetchUserInfo() {
      try {
        const app = getApp()
        const result = await app.checkUserRegistration()
        if (result.registered && result.user) {
          this.setData({
            _name: this.data.name || result.user.name || '',
            _nickName: this.data.nickName || result.user.nickName || '',
            _openid: this.data.openid || app.globalData.openid || ''
          })
          this.drawWatermark()
        }
      } catch (err) {
        // 静默失败，不影响页面正常使用
        console.warn('水印组件获取用户信息失败:', err)
      }
    },

    /**
     * openid 脱敏：保留前 4 位 + ... + 后 4 位
     * 示例: "oXyZ123abc456def" → "oXyZ...6def"
     */
    maskOpenid(openid) {
      if (!openid || openid.length <= 8) return openid || ''
      return openid.slice(0, 4) + '...' + openid.slice(-4)
    },

    /**
     * 绘制水印并导出为临时图片
     */
    drawWatermark() {
      const { _name, _nickName, _openid, fontSize, color, opacity, rotate, gapX, gapY } = this.data

      // 三段文字都为空时不绘制
      if (!_name && !_nickName && !_openid) return

      const maskedOpenid = this.maskOpenid(_openid)
      const texts = [maskedOpenid, _name, _nickName].filter(t => t)

      if (texts.length === 0) return

      const query = wx.createSelectorQuery().in(this)
      query.select('#watermarkCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            console.warn('水印 canvas 节点未找到')
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const { pixelRatio: dpr } = wx.getWindowInfo()

          // 设置 canvas 绘图分辨率
          canvas.width = gapX * dpr
          canvas.height = gapY * dpr
          ctx.scale(dpr, dpr)

          // 清空画布
          ctx.clearRect(0, 0, gapX, gapY)

          // 设置文字样式
          ctx.fillStyle = color
          ctx.globalAlpha = opacity
          ctx.font = `${fontSize}px sans-serif`
          ctx.textBaseline = 'middle'
          ctx.textAlign = 'left'

          // 移动到单元中心并旋转
          ctx.save()
          ctx.translate(gapX / 2, gapY / 2)
          ctx.rotate(rotate * Math.PI / 180)

          // 计算三段文字总宽度（含段间距）
          const spacing = 10
          const widths = texts.map(t => ctx.measureText(t).width)
          const totalWidth = widths.reduce((sum, w) => sum + w, 0) + spacing * (texts.length - 1)

          // 从左到右居中绘制
          let xOffset = -totalWidth / 2
          texts.forEach((text, i) => {
            ctx.fillText(text, xOffset, 0)
            xOffset += widths[i] + spacing
          })

          ctx.restore()

          // 导出为临时图片
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: gapX,
            height: gapY,
            destWidth: gapX * dpr,
            destHeight: gapY * dpr,
            success: (res) => {
              this.setData({ watermarkUrl: res.tempFilePath })
            },
            fail: (err) => {
              console.warn('水印图片导出失败:', err)
            }
          })
        })
    }
  }
})
