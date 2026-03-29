Page({
  data: {
    showSignature: false,
    signImage: ''
  },

  openSignature() {
    this.setData({ showSignature: true })
  },

  onSignConfirm(e) {
    this.setData({
      signImage: e.detail.tempFilePath,
      showSignature: false
    })
    wx.showToast({ title: '签名成功', icon: 'success' })
  },

  onSignCancel() {
    this.setData({ showSignature: false })
  },

  previewImage() {
    wx.previewImage({ urls: [this.data.signImage] })
  },

  clearResult() {
    this.setData({ signImage: '' })
  }
})
