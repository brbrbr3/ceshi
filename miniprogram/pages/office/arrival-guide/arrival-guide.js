const app = getApp()

Page({
  data: {
    statusBarHeight: 20,
    // 弹窗控制
    showPopup: false,
    popupTitle: '',
    popupType: '', // 'checklist' | 'static'
    popupContent: [],
    checkedCount: 0,

    // 赴任前准备 checklist（原文来自"到馆指南.docx"表格）
    // 结构：{ id, category, detail, note, checked }
    checklistItems: [
      { id: 'vaccine', category: '疫苗', detail: '请接种黄热疫苗，取得国际疫苗证（小黄本）', note: '随身携带', checked: false },
      { id: 'documents', category: '证件', detail: '护照扫描件电子版、身份证扫描件电子版、1寸、2寸白底照片及其电子版', note: '到馆后办理CPF及身份证使用', checked: false },
      { id: 'driver_license', category: '驾照', detail: '中国驾照原件', note: '以备办理翻译件', checked: false },
      { id: 'luggage_life', category: '生活行李', detail: '床上用品、毛巾、拖鞋、常用衣物', note: 'DHL可能延误，请随身带基础用品', checked: false },
      { id: 'luggage_kitchen', category: '厨房行李', detail: '电饭煲、锅具、筷子、调料、饭盒（建议4个，尺寸不要太小）', note: '食堂工作餐使用自带饭盒', checked: false },
      { id: 'luggage_electronic', category: '电子行李', detail: '路由器、插线板、转换插头（多种规格）', note: '', checked: false },
      { id: 'appliance', category: '电器', detail: '巴西利亚220V / 圣保罗110V', note: '电器需支持50–60Hz', checked: false },
      { id: 'medicine', category: '药品', detail: '感冒药、消炎药、抗过敏、肠胃药、蚊虫药、防晒霜', note: '当地蚊虫较多、气候干燥、紫外线强', checked: false },
      { id: 'china_sim', category: '中国手机卡', detail: '保留国内手机号、开通国际漫游', note: '用于接收验证码或紧急联系国内', checked: false },
      { id: 'brazil_sim', category: '巴西手机卡', detail: '提前请处室联络员代办临时电话卡，后续可转让到自己名下，或携号转网换其他套餐', note: '无CPF无法申请手机卡、新CPF无信用积分可能无法办理套餐', checked: false },
      { id: 'credit_card', category: '信用卡', detail: '国际信用卡（Visa/Master）', note: '提前开通境外支付，注意防范盗刷，尽量避免使用', checked: false },
      { id: 'cash', category: '现金', detail: '可带少量美元或雷亚尔', note: '初期应急使用', checked: false },
      { id: 'work_prep', category: '工作准备', detail: '提前联系处室联络员', note: '了解接机、住宿、手机卡、办公室等安排', checked: false }
    ],
    allChecked: false,

    // 购物指南（原文来自"到馆指南.docx"）
    // 注：以下地点可自行在Google地图搜索，均为连锁超市
    shoppingContent: [
      {
        category: '综合超市',
        items: [
          { name: 'Big Box', desc: '24小时营业' }
        ]
      },
      {
        category: '精品超市',
        items: [
          { name: 'Pão de Açúcar / OBA', desc: '生鲜质量好' }
        ]
      },
      {
        category: '大型商超',
        items: [
          { name: 'Carrefour / Assaí / Dia a Dia', desc: '价格低' }
        ]
      },
      {
        category: '山姆超市',
        items: [
          { name: "Sam's Club", desc: '需会员' }
        ]
      },
      {
        category: '家居用品',
        items: [
          { name: 'Camicado / Artex', desc: '床品、厨房用品' }
        ]
      },
      {
        category: '运动用品',
        items: [
          { name: 'Decathlon', desc: '运动品类齐全' }
        ]
      },
      {
        category: '商场',
        items: [
          { name: 'Park Shopping / Iguatemi / Conjunto Nacional / Brasília Shopping / Pier 21', desc: '大型商场，可购买服装、鞋包、化妆品、香水等' }
        ]
      }
    ],

    // 中餐/华人资源（原文来自"到馆指南.docx"）
    chineseContent: [
      {
        category: '中超、餐厅',
        items: [
          { name: 'Mikami', desc: '日本超市' },
          { name: '陈府餐厅送餐', desc: '微信：Moonshine1028_' }
        ]
      },
      {
        category: '华人',
        items: [
          { name: '慧丽', desc: '微信：Jin982479165' },
          { name: '岳花', desc: '微信：zhangsen2007816' }
        ]
      }
    ],

    // 网购平台（原文来自"到馆指南.docx"）
    shoppingOnlineContent: [
      {
        category: '平台',
        items: [
          { name: 'Amazon / Mercado Livre', desc: '巴西主流电商，发货速度快' },
          { name: 'Shopee / Shein', desc: '价格低' },
          { name: 'AliExpress', desc: '国内发货，时间长' }
        ]
      },
      {
        category: '服饰',
        items: [
          { name: 'Zara / Renner / Dafiti 等品牌官网', desc: '' }
        ]
      },
      {
        category: '美妆',
        items: [
          { name: 'Sephora / Beleza na Web', desc: '' }
        ]
      }
    ],

    // 就医信息（原文来自"到馆指南.docx"）
    medicalContent: [
      {
        category: '',
        items: [
          {name: "", desc: '根据国内规定，馆员就医实行事前审批制度。报销医院详见以下就诊医院目录：'}
        ]
      },
      {
        category: '私立综合性医院',
        items: [
          { name: 'Hospital Sírio-Libanês', desc: '' },
          { name: 'DF Star-Rede D\'OR', desc: '' },
          { name: 'Hospital Brasília', desc: '' },
          { name: 'Hospital Daher', desc: '' },
          { name: 'Hospital Santa Lúcia', desc: '' },
          { name: 'Hospital Santa Luzia', desc: '' }
        ]
      },
      {
        category: '私立综合性医院（骨科专长）',
        items: [
          { name: 'Hospital Home', desc: '' }
        ]
      },
      {
        category: '公立医院',
        items: [
          { name: 'Sarah Kubitschek', desc: '残障人士友好' },
          { name: 'Hospital das Forças Armadas', desc: '' }
        ]
      },
      {
        category: '牙科',
        items: [
          { name: 'Rita Trindade', desc: '' },
          { name: 'Clínica Implanto Odontologia Especializada', desc: '' },
          { name: 'Moreti Odontologia', desc: '' },
          { name: 'Crool by Rios', desc: '' }
        ]
      },
      {
        category: '眼科',
        items: [
          { name: 'CBV', desc: '' }
        ]
      },
      {
        category: '临床医学检查',
        items: [
          { name: 'Laboratório Sabin', desc: '巴西临床医学典范' },
          { name: 'Exame Imagem e Laboratório', desc: '临床医学检查与疫苗注射' },
          { name: 'IMEB Crispim', desc: '' }
        ]
      },
      {
        category: '骨科',
        items: [
          { name: 'Cote Brasília', desc: '' }
        ]
      },
      {
        category: '皮肤科',
        items: [
          { name: 'Aluma Dermatologia e Laser', desc: '' },
          { name: 'Verveine', desc: '' },
          { name: 'Inovaderm', desc: '' }
        ]
      },
      {
        category: '过敏',
        items: [
          { name: 'Consultório Natasha Ferraroni', desc: '' }
        ]
      },
      {
        category: '风湿科',
        items: [
          { name: 'Rheos. Reumatologia e Clínica Médica', desc: '' }
        ]
      },
      {
        category: '消化科',
        items: [
          { name: 'Prodigest', desc: '' }
        ]
      },
      {
        category: '耳鼻喉科',
        items: [
          { name: 'CEOL ENT-Otorhinolaryngology Clinic', desc: '' }
        ]
      },
      {
        category: '针灸',
        items: [
          { name: 'Centro de Acupuntura Shen', desc: '' },
          { name: 'Clínica de Acupuntura Chinesa Brasília', desc: '' }
        ]
      },
      {
        category: '妇产科',
        items: [
          { name: 'Maternidade Brasília', desc: '' }
        ]
      },
      {
        category: '妇幼专科',
        items: [
          { name: 'Hospital Materno Infantil de Brasília', desc: '' }
        ]
      },
      {
        category: '多种专科',
        items: [
          { name: 'CRIAPP', desc: '' }
        ]
      }
    ],

    // 7个按钮配置
    buttons: [
      { key: 'preparation', label: '赴任前准备', icon: '📋' },
      { key: 'shopping', label: '购物指南', icon: '🛒' },
      { key: 'chinese', label: '中餐/华人', icon: '🥢' },
      { key: 'online', label: '网购平台', icon: '📱' },
      { key: 'medical', label: '就医信息', icon: '🏥' },
      { key: 'school', label: '子女就学', icon: '👧' },
      { key: 'arrived', label: '我已到馆', icon: '✅' }
    ]
  },

  onLoad() {
    // 获取状态栏高度（自定义导航栏需要）
    const systemInfo = wx.getWindowInfo()
    this.setData({ statusBarHeight: systemInfo.statusBarHeight || 20 })

    // 验证用户角色
    app.checkUserRegistration().then((result) => {
      if (!result.registered || !result.user) {
        wx.reLaunch({ url: '/pages/auth/login/login' })
        return
      }
      // 非"待赴任馆员"角色也能查看，但仅"待赴任馆员"登录时自动跳转此页
    }).catch(() => {})
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
  },

  // 按钮点击
  handleButtonTap(e) {
    const key = e.currentTarget.dataset.key

    if (key === 'arrived') {
      this.handleArrived()
      return
    }

    const contentMap = {
      preparation: {
        title: '一、赴任前准备',
        type: 'checklist',
        content: this.data.checklistItems
      },
      shopping: {
        title: '二、购物指南',
        type: 'static',
        content: this.data.shoppingContent
      },
      chinese: {
        title: '三、中餐（品类齐全、价格高于国内）',
        type: 'static',
        content: this.data.chineseContent
      },
      online: {
        title: '四、网购',
        type: 'static',
        content: this.data.shoppingOnlineContent
      },
      medical: {
        title: '五、就医信息（报销医院目录）',
        type: 'static',
        content: this.data.medicalContent
      },
      school: {
        title: '六、子女就学',
        type: 'richtext'
      }
    }

    const config = contentMap[key]
    if (!config) return

    this.setData({
      showPopup: true,
      popupTitle: config.title,
      popupType: config.type,
      popupContent: config.content
    })
  },

  // checklist 打钩
  handleCheckToggle(e) {
    const id = e.currentTarget.dataset.id
    const checklistItems = this.data.checklistItems.map((item) => {
      if (item.id === id) {
        return { ...item, checked: !item.checked }
      }
      return item
    })
    const allChecked = checklistItems.every((item) => item.checked)
    const checkedCount = checklistItems.filter((item) => item.checked).length
    this.setData({ checklistItems, allChecked, popupContent: checklistItems, checkedCount })
  },

  // 全选/取消全选
  handleCheckAll() {
    const allChecked = !this.data.allChecked
    const checklistItems = this.data.checklistItems.map((item) => ({
      ...item,
      checked: allChecked
    }))
    const checkedCount = allChecked ? checklistItems.length : 0
    this.setData({ checklistItems, allChecked, popupContent: checklistItems, checkedCount })
  },

  // 关闭弹窗
  handleClosePopup() {
    this.setData({ showPopup: false })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 我已到馆
  handleArrived() {
    wx.navigateTo({
      url: '/pages/office/profile/edit-profile/edit-profile'
    })
  }
})