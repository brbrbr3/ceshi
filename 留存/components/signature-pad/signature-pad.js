/**
 * 签字板组件
 *
 * 功能：手写签名、撤销、清除、横竖屏切换、导出图片
 *
 * 属性：
 *   show(Boolean)     - 控制显示/隐藏
 *   penColor(String)  - 默认画笔颜色（#000000）
 *   penWidth(Number)  - 默认画笔粗细（3）
 *
 * 事件：
 *   confirm - 确认签名，detail: { tempFilePath }
 *   cancel  - 取消签名
 */
Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
      observer: '_onShowChange'
    },
    penColor: {
      type: String,
      value: '#000000'
    },
    penWidth: {
      type: Number,
      value: 3
    }
  },

  data: {
    visible: false,
    isLandscape: false,
    isEmpty: true,
    currentPenColor: '#000000',
    showOrientHint: false
  },

  lifetimes: {
    attached() {
      this.canvas = null
      this.ctx = null
      this.dpr = 1
      this.canvasWidth = 0
      this.canvasHeight = 0
      this.strokes = []
      this.currentStroke = null
      this.isDrawing = false
      this._canvasRect = null
    }
  },

  methods: {
    noop() {},

    /**
     * show 属性变化时触发
     */
    _onShowChange(newVal) {
      if (newVal) {
        this.resetState()
        this.setData({ visible: true })
        wx.nextTick(() => {
          this.initCanvas()
        })
      } else {
        this.setData({ visible: false })
      }
    },

    resetState() {
      this.strokes = []
      this.currentStroke = null
      this.isDrawing = false
      this._canvasRect = null
      this.canvasWidth = 0
      this.canvasHeight = 0
      this.setData({
        isLandscape: false,
        isEmpty: true,
        currentPenColor: this.properties.penColor,
        showOrientHint: false
      })
    },

    /**
     * 初始化 Canvas 2D
     * 画布分辨率根据实际显示区域动态设置，确保导出图片与所见一致
     */
    initCanvas() {
      const query = this.createSelectorQuery()
      query.select('#sigCanvas')
        .fields({ node: true })
        .exec(res => {
          if (!res[0] || !res[0].node) {
            console.error('签名画布初始化失败')
            return
          }
          const canvas = res[0].node
          const dpr = wx.getWindowInfo().pixelRatio

          // 获取画布实际显示尺寸
          this.createSelectorQuery()
            .select('.sig-canvas-area')
            .boundingClientRect(areaRect => {
              if (!areaRect) return

              // 画布内部分辨率 = 显示尺寸 × dpr（取整避免模糊）
              const w = Math.round(areaRect.width)
              const h = Math.round(areaRect.height)
              canvas.width = w * dpr
              canvas.height = h * dpr

              this.canvasWidth = w
              this.canvasHeight = h
              this.dpr = dpr

              const ctx = canvas.getContext('2d')
              ctx.scale(dpr, dpr)

              this.canvas = canvas
              this.ctx = ctx

              // 缓存画布位置
              this._refreshCanvasRect()

              this._drawBackground()
            })
            .exec()
        })
    },

    /**
     * 刷新画布位置缓存
     */
    _refreshCanvasRect() {
      this.createSelectorQuery()
        .select('#sigCanvas')
        .boundingClientRect(rect => {
          if (rect) this._canvasRect = rect
        })
        .exec()
    },

    /**
     * 绘制背景（白色 + 签名线）
     */
    _drawBackground() {
      const { ctx, canvasWidth: W, canvasHeight: H, data } = this
      if (!ctx || !W || !H) return

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      ctx.beginPath()
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = 1
      ctx.setLineDash([8, 4])

      if (data.isLandscape) {
        // 横屏：画竖线（CSS 旋转90°后显示为横线，靠近视觉底部）
        const lineX = W * 0.22
        ctx.moveTo(lineX, 30)
        ctx.lineTo(lineX, H - 30)
        ctx.stroke()
        ctx.setLineDash([])

        // "签名" 文字：旋转-90°绘制，与CSS +90°抵消后水平可读
        ctx.save()
        ctx.font = '12px sans-serif'
        ctx.fillStyle = '#e0e0e0'
        ctx.translate(lineX - 20, 60)
        ctx.rotate(-Math.PI / 2)
        ctx.textAlign = 'left'
        ctx.fillText('签名', 0, 0)
        ctx.restore()
      } else {
        // 竖屏：画横线
        ctx.moveTo(30, H * 0.78)
        ctx.lineTo(W - 30, H * 0.78)
        ctx.stroke()
        ctx.setLineDash([])

        ctx.font = '12px sans-serif'
        ctx.fillStyle = '#e0e0e0'
        ctx.textAlign = 'left'
        ctx.fillText('签名', 30, H * 0.78 + 18)
      }
    },

    /**
     * 将触摸坐标转换为画布坐标
     *
     * 横屏模式下容器经过 rotate(90deg) 变换。
     * boundingClientRect 在基础库 2.9+ 返回变换后的可视区域。
     * 90° 顺时针旋转映射：
     *   canvasX = relY / visualHeight * canvasWidth
     *   canvasY = (visualWidth - relX) / visualWidth * canvasHeight
     */
    _getCanvasPoint(touch) {
      const rect = this._canvasRect
      if (!rect) return null

      const relX = touch.clientX - rect.left
      const relY = touch.clientY - rect.top

      if (this.data.isLandscape) {
        return {
          x: relY / rect.height * this.canvasWidth,
          y: (rect.width - relX) / rect.width * this.canvasHeight
        }
      }

      return {
        x: relX / rect.width * this.canvasWidth,
        y: relY / rect.height * this.canvasHeight
      }
    },

    // ========== 触摸事件 ==========

    onTouchStart(e) {
      if (!this.ctx) return

      const touch = e.touches[0]
      const point = this._getCanvasPoint(touch)
      if (!point) return

      this.isDrawing = true
      this.currentStroke = {
        color: this.data.currentPenColor,
        width: this.properties.penWidth,
        points: [point]
      }

      // 绘制起始点（处理单次点击）
      const { ctx } = this
      ctx.beginPath()
      ctx.fillStyle = this.currentStroke.color
      ctx.arc(point.x, point.y, this.currentStroke.width / 2, 0, Math.PI * 2)
      ctx.fill()
    },

    onTouchMove(e) {
      if (!this.isDrawing || !this.ctx || !this.currentStroke) return

      const touch = e.touches[0]
      const point = this._getCanvasPoint(touch)
      if (!point) return

      const points = this.currentStroke.points
      const prev = points[points.length - 1]
      points.push(point)

      // 绘制线段
      const { ctx } = this
      ctx.beginPath()
      ctx.strokeStyle = this.currentStroke.color
      ctx.lineWidth = this.currentStroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    },

    onTouchEnd() {
      if (!this.isDrawing || !this.currentStroke) return
      this.isDrawing = false

      if (this.currentStroke.points.length > 0) {
        this.strokes.push(this.currentStroke)
        this.setData({ isEmpty: false })
      }
      this.currentStroke = null
    },

    // ========== 操作 ==========

    /**
     * 撤销上一笔
     */
    undo() {
      if (this.strokes.length === 0) return
      this.strokes.pop()
      this._redrawAll()
      this.setData({ isEmpty: this.strokes.length === 0 })
    },

    /**
     * 清除全部
     */
    clear() {
      this.strokes = []
      this.currentStroke = null
      this._drawBackground()
      this.setData({ isEmpty: true })
    },

    /**
     * 重绘所有笔画
     * 使用二次贝塞尔曲线实现平滑绘制
     */
    _redrawAll() {
      this._drawBackground()
      const { ctx } = this
      if (!ctx) return

      for (const stroke of this.strokes) {
        const pts = stroke.points
        if (pts.length === 0) continue

        ctx.strokeStyle = stroke.color
        ctx.fillStyle = stroke.color
        ctx.lineWidth = stroke.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (pts.length === 1) {
          ctx.beginPath()
          ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (pts.length === 2) {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          ctx.lineTo(pts[1].x, pts[1].y)
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.moveTo(pts[0].x, pts[0].y)
          for (let i = 1; i < pts.length - 1; i++) {
            const midX = (pts[i].x + pts[i + 1].x) / 2
            const midY = (pts[i].y + pts[i + 1].y) / 2
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
          }
          const last = pts[pts.length - 1]
          ctx.lineTo(last.x, last.y)
          ctx.stroke()
        }
      }
    },

    /**
     * 切换画笔颜色
     */
    setColor(e) {
      const color = e.currentTarget.dataset.color
      this.setData({ currentPenColor: color })
    },

    /**
     * 切换横竖屏
     */
    toggleOrientation() {
      const isLandscape = !this.data.isLandscape
      this.setData({ isLandscape })

      // 切换后需要重新初始化画布（尺寸改变）
      wx.nextTick(() => {
        setTimeout(() => {
          this.initCanvas()
          if (isLandscape) {
            this.setData({ showOrientHint: true })
            setTimeout(() => this.setData({ showOrientHint: false }), 2000)
          }
        }, 150)
      })
    },

    /**
     * 确认签名 → 导出为临时图片
     */
    onConfirm() {
      if (this.strokes.length === 0) {
        wx.showToast({ title: '请先签名', icon: 'none' })
        return
      }

      wx.showLoading({ title: '生成中...' })

      wx.canvasToTempFilePath({
        canvas: this.canvas,
        x: 0,
        y: 0,
        width: this.canvasWidth * this.dpr,
        height: this.canvasHeight * this.dpr,
        destWidth: this.canvasWidth * 2,
        destHeight: this.canvasHeight * 2,
        fileType: 'png',
        success: (res) => {
          wx.hideLoading()
          this.triggerEvent('confirm', { tempFilePath: res.tempFilePath })
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('导出签名失败:', err)
          wx.showToast({ title: '导出失败', icon: 'none' })
        }
      }, this)
    },

    /**
     * 取消
     */
    onCancel() {
      this.triggerEvent('cancel')
    }
  }
})
