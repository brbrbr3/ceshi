const utils = require('../../../../common/utils.js')

const formatLocation = utils.formatLocation

Page({
  onShareAppMessage() {
    return {
      title: '获取位置',
      path: 'packageAPI/pages/location/get-location/get-location'
    }
  },

  data: {
    theme: 'light',
    hasLocation: false,
  },
  getLocation() {
    const that = this
    wx.getLocation({
      success(res) {
        console.log(res)
        that.setData({
          hasLocation: true,
          location: formatLocation(res.longitude, res.latitude)
        })
      }
    })
  },
  clear() {
    this.setData({
      hasLocation: false
    })
  },
  onLoad() {
    this.setData({
      theme: wx.getSystemInfoSync().theme || 'light'
    })

    if (wx.onThemeChange) {
      wx.onThemeChange(({theme}) => {
        this.setData({theme})
      })
    }
  }
})
