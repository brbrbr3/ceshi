// pages/office/help/help.js
const app = getApp()
const utils = require('../../../common/utils.js')
Page({

  /**
   * 页面的初始数据
   */
  data: {
    isAdmin: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {

  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    const app = getApp()
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    this.syncUserProfile()
  },

  async syncUserProfile() {
    try {
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.reLaunch({
          url: '/pages/auth/login/login'
        })
        return
      }
      const user = result.user
      this.setData({
        isAdmin: !!user.isAdmin
      })
    } catch (error) {
      utils.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    }
  },
  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})