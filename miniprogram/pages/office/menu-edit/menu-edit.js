const app = getApp()
const util = require('../../../util/util.js')

Page({
  data: {
    menuId: '',
    isEdit: false,
    loading: false,
    form: {
      title: '',
      content: ''
    },
    editorCtx: null
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ menuId: options.id, isEdit: true })
      this.loadMenu()
    } else {
      this.setData({
        'form.content': this.getDefaultContent()
      })
    }
  },

  getDefaultContent() {
    return '周一：<br/><br/>周二：<br/><br/>周三：<br/><br/>周四：<br/><br/>周五：<br/><br/>'
  },

  loadMenu() {
    const db = wx.cloud.database()
    db.collection('menus')
      .doc(this.data.menuId)
      .get()
      .then(res => {
        this.setData({
          'form.title': res.data.title,
          'form.content': res.data.content
        })
        if (this.data.editorCtx) {
          this.data.editorCtx.setContents({
            html: res.data.content
          })
        }
      })
      .catch(error => {
        console.error('加载菜单失败', error)
        util.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  onEditorReady() {
    const query = wx.createSelectorQuery()
    query.select('#editor').context(res => {
      this.setData({ editorCtx: res.context })

      if (this.data.isEdit && this.data.form.content) {
        res.context.setContents({
          html: this.data.form.content
        })
      } else if (!this.data.isEdit) {
        const defaultContent = this.getDefaultContent()
        this.setData({ 'form.content': defaultContent })
        res.context.setContents({
          html: defaultContent
        })
      }
    }).exec()
  },

  onEditorInput(e) {
    this.setData({
      'form.content': e.detail.html
    })
  },

  onTitleInput(e) {
    this.setData({
      'form.title': e.detail.value
    })
  },

  handleSubmit() {
    if (this.data.loading) {
      return
    }

    const title = this.data.form.title.trim()
    if (!title) {
      util.showToast({
        title: '请输入菜单标题',
        icon: 'none'
      })
      return
    }

    const content = this.data.form.content.trim()
    if (!content) {
      util.showToast({
        title: '请输入菜单内容',
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          util.showToast({
            title: '请先登录',
            icon: 'none'
          })
          this.setData({ loading: false })
          return
        }

        // 保存用户信息到组件数据，供后续使用
        this.setData({ currentUser: result.user })

        const openid = app.globalData.openid
        const menuData = {
          title: title,
          content: content,
          authorName: result.user.name
        }

        if (this.data.isEdit) {
          return wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'updateMenu',
              menuId: this.data.menuId,
              menuData: menuData
            }
          })
        } else {
          return wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'addMenu',
              menuData: menuData
            }
          })
        }
      })
      .then((res) => {
        // 只在新增菜单时广播通知
        if (!this.data.isEdit) {
          const menuId = res._id || res.id
          const menuTitle = this.data.form.title
          const userName = this.data.currentUser ? this.data.currentUser.name : '用户'
          const notificationTitle = '新菜单通知'
          const notificationContent = `${userName}提交了新的工作餐菜单「${menuTitle}」，点击查看`

          console.log('=== 开始广播通知 ===')
          console.log('菜单ID:', menuId)
          console.log('菜单标题:', menuTitle)
          console.log('用户名:', userName)

          wx.cloud.callFunction({
            name: 'broadcastNotification',
            data: {
              title: notificationTitle,
              content: notificationContent,
              type: 'menu',
              menuId: menuId
            }
          }).then(res => {
            console.log('广播通知返回:', res)
            console.log('=== 广播通知成功 ===')
          }).catch(err => {
            console.error('广播通知失败', err)
          })
        }

        util.showToast({
          title: this.data.isEdit ? '保存成功' : '提交成功',
          icon: 'success'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 500)
      })
      .catch(error => {
        console.error('提交失败', error)
        util.showToast({
          title: '提交失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  goBack() {
    wx.navigateBack()
  }
})
