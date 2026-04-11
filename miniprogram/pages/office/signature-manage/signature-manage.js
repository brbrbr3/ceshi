const app = getApp()
const utils = require('../../../common/utils.js')

const MAX_SIGNATURES = 2

Page({
  data: {
    signatures: [],
    showSignaturePad: false,
    editingSlotIndex: -1,
    canAdd: true,
    maxCount: MAX_SIGNATURES
  },

  onShow() {
    // 字体缩放
    const fontScale = app.globalData.fontScale || 1
    if (this.data.fontScale !== fontScale) {
      this.setData({
        fontScale,
        pageStyle: `--font-scale: ${fontScale}`
      })
    }
    this.loadSignatures()
  },

  loadSignatures() {
    const db = wx.cloud.database()
    db.collection('user_signatures')
      .orderBy('index', 'asc')
      .limit(MAX_SIGNATURES)
      .get()
      .then(res => {
        const signatures = (res.data || []).map(item => ({
          ...item,
          tempUrl: '',
          loading: true,
          timeText: item.createdAt ? utils.formatDate(item.createdAt) : ''
        }))
        this.setData({
          signatures,
          canAdd: signatures.length < MAX_SIGNATURES
        })
        this.loadSignatureUrls()
      })
      .catch(err => {
        console.error('加载签字失败', err)
        utils.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  loadSignatureUrls() {
    const { signatures } = this.data
    const fileIDs = signatures.map(s => s.fileID).filter(Boolean)

    if (fileIDs.length === 0) return

    wx.cloud.getTempFileURL({
      fileList: fileIDs
    }).then(res => {
      const urlMap = {}
      res.fileList.forEach(item => {
        urlMap[item.fileID] = item.tempFileURL
      })

      const updated = signatures.map(s => ({
        ...s,
        tempUrl: urlMap[s.fileID] || '',
        loading: false
      }))
      this.setData({ signatures: updated })
    }).catch(err => {
      console.error('获取签字图片链接失败', err)
      this.setData({
        signatures: signatures.map(s => ({ ...s, loading: false }))
      })
    })
  },

  handleAddSignature() {
    if (!this.data.canAdd) return
    const nextIndex = this.data.signatures.length
    this.setData({
      editingSlotIndex: nextIndex,
      showSignaturePad: true
    })
  },

  handleReplaceSignature(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      editingSlotIndex: index,
      showSignaturePad: true
    })
  },

  handlePreviewSignature(e) {
    const index = e.currentTarget.dataset.index
    const sig = this.data.signatures[index]
    if (sig && sig.tempUrl) {
      wx.previewImage({
        urls: [sig.tempUrl],
        current: sig.tempUrl
      })
    }
  },

  onSignConfirm(e) {
    const tempFilePath = e.detail.tempFilePath
    if (!tempFilePath) return

    this.setData({ showSignaturePad: false })

    wx.showLoading({ title: '保存中...' })

    app.checkUserRegistration({ forceRefresh: false })
      .then(result => {
        if (!result.registered || !result.openid) {
          wx.hideLoading()
          utils.showToast({ title: '请先登录', icon: 'none' })
          return
        }
        const openid = result.openid
        const slotIndex = this.data.editingSlotIndex
        const cloudPath = `signatures/${openid}/${Date.now()}_${slotIndex}.png`

        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempFilePath
        }).then(uploadRes => {
          return this.saveSignatureRecord(slotIndex, uploadRes.fileID)
        }).then(() => {
          wx.hideLoading()
          utils.showToast({ title: '保存成功', icon: 'success' })
          this.loadSignatures()
        }).catch(err => {
          wx.hideLoading()
          console.error('保存签字失败', err)
          utils.showToast({ title: '保存失败', icon: 'none' })
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error('获取用户信息失败', err)
      })
  },

  saveSignatureRecord(slotIndex, fileID) {
    const db = wx.cloud.database()
    const { signatures } = this.data

    const existing = signatures[slotIndex]
    const now = Date.now()

    if (existing && existing._id) {
      let oldFileID = existing.fileID
      return db.collection('user_signatures').doc(existing._id).update({
        data: { fileID, updatedAt: now }
      }).then(() => {
        if (oldFileID && oldFileID !== fileID) {
          wx.cloud.deleteFile({ fileList: [oldFileID] }).catch(() => {})
        }
      })
    }

    return db.collection('user_signatures').add({
      data: {
        fileID,
        label: '签字 ' + (slotIndex + 1),
        index: slotIndex,
        createdAt: now,
        updatedAt: now
      }
    })
  },

  onSignCancel() {
    this.setData({ showSignaturePad: false, editingSlotIndex: -1 })
  },

  handleDeleteSignature(e) {
    const index = e.currentTarget.dataset.index
    const sig = this.data.signatures[index]
    if (!sig) return

    wx.showModal({
      title: '确认删除',
      content: '删除后将无法恢复，确定要删除这个签字吗？',
      confirmColor: '#EF4444',
      success: (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '删除中...' })
        const fileID = sig.fileID

        const db = wx.cloud.database()
        db.collection('user_signatures').doc(sig._id).remove()
          .then(() => {
            if (fileID) {
              return wx.cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
            }
          }).then(() => {
          wx.hideLoading()
          utils.showToast({ title: '已删除', icon: 'success' })
          this.loadSignatures()
        }).catch(err => {
          wx.hideLoading()
          console.error('删除签字失败', err)
          utils.showToast({ title: '删除失败', icon: 'none' })
        })
      }
    })
  }
})
