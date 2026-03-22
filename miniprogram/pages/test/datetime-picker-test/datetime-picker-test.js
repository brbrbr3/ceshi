/**
 * datetime-picker-test.js
 * 日期时间选择器组件测试页面
 */
Page({
  data: {
    // 测试配置
    testCases: [
      {
        title: '日期选择器（年月日星期）',
        desc: '显示年、月、日、星期几',
        fields: ['year', 'month', 'day', 'weekday'],
        value: '',
        placeholder: '请选择日期'
      },
      {
        title: '日期时间选择器',
        desc: '显示年、月、日、时、分',
        fields: ['year', 'month', 'day', 'hour', 'minute'],
        value: '',
        placeholder: '请选择日期时间'
      },
      {
        title: '时间选择器',
        desc: '只显示时、分、秒',
        fields: ['hour', 'minute', 'second'],
        value: '',
        placeholder: '请选择时间'
      },
      {
        title: '完整日期时间选择器',
        desc: '显示全部字段',
        fields: ['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second'],
        value: '',
        placeholder: '请选择完整日期时间'
      },
      {
        title: '简洁日期选择器',
        desc: '只显示年、月、日',
        fields: ['year', 'month', 'day'],
        value: '',
        placeholder: '请选择日期'
      },
      {
        title: '日期时间选择器（含秒）',
        desc: '显示年、月、日、时、分、秒',
        fields: ['year', 'month', 'day', 'hour', 'minute', 'second'],
        value: '',
        placeholder: '请选择日期时间'
      }
    ],
    // 不同样式类型
    styleTypes: [
      {
        title: '默认样式',
        type: 'default',
        value: ''
      },
      {
        title: '卡片样式',
        type: 'card',
        value: ''
      },
      {
        title: '边框样式',
        type: 'border',
        value: ''
      }
    ],
    // 日期范围限制测试
    rangeTest: {
      title: '日期范围限制',
      desc: '限制选择范围：2024-01-01 ~ 2024-12-31',
      fields: ['year', 'month', 'day'],
      value: '',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      placeholder: '请选择2024年日期'
    },
    // 预设值测试
    presetTest: {
      title: '预设值测试',
      desc: '预设值为：2026-03-22 14:30:00',
      fields: ['year', 'month', 'day', 'weekday', 'hour', 'minute'],
      value: '2026-03-22 14:30:00',
      placeholder: '请选择日期时间'
    },
    // 选择结果
    results: []
  },

  onLoad() {
    // 设置当前日期为预设值
    const now = new Date()
    const dateStr = this.formatDateTime(now)
    
    // 更新第一个测试用例的默认值
    const testCases = [...this.data.testCases]
    testCases[0].value = dateStr.split(' ')[0] // 只取日期部分
    
    this.setData({ testCases })
  },

  /**
   * 格式化日期时间
   */
  formatDateTime(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    const second = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  },

  /**
   * 处理选择变化
   */
  handlePickerChange(e) {
    const { index, type } = e.currentTarget.dataset
    const value = e.detail.value
    
    console.log('选择结果：', e.detail)
    
    // 更新对应的值
    if (type === 'testCases') {
      const testCases = [...this.data.testCases]
      testCases[index].value = value
      this.setData({ testCases })
    } else if (type === 'styleTypes') {
      const styleTypes = [...this.data.styleTypes]
      styleTypes[index].value = value
      this.setData({ styleTypes })
    } else if (type === 'rangeTest') {
      this.setData({ 'rangeTest.value': value })
    } else if (type === 'presetTest') {
      this.setData({ 'presetTest.value': value })
    }
    
    // 添加到结果列表
    const results = [...this.data.results]
    results.unshift({
      title: type === 'testCases' ? this.data.testCases[index].title : 
             type === 'styleTypes' ? this.data.styleTypes[index].title :
             type === 'rangeTest' ? '日期范围限制' : '预设值测试',
      value: value,
      detail: e.detail,
      time: new Date().toLocaleTimeString()
    })
    
    // 只保留最近5条
    if (results.length > 5) {
      results.pop()
    }
    
    this.setData({ results })
  },

  /**
   * 清空某个选择器的值
   */
  clearValue(e) {
    const { index, type } = e.currentTarget.dataset
    
    if (type === 'testCases') {
      const testCases = [...this.data.testCases]
      testCases[index].value = ''
      this.setData({ testCases })
    } else if (type === 'styleTypes') {
      const styleTypes = [...this.data.styleTypes]
      styleTypes[index].value = ''
      this.setData({ styleTypes })
    }
  },

  /**
   * 清空所有结果
   */
  clearResults() {
    this.setData({ results: [] })
  },

  /**
   * 重置预设值
   */
  resetPresetValue() {
    this.setData({ 'presetTest.value': '2026-03-22 14:30:00' })
  },

  /**
   * 设置当前时间
   */
  setCurrentTime(e) {
    const { index, type } = e.currentTarget.dataset
    const now = new Date()
    const value = this.formatDateTime(now)
    
    if (type === 'testCases') {
      const testCases = [...this.data.testCases]
      testCases[index].value = value
      this.setData({ testCases })
    } else if (type === 'styleTypes') {
      const styleTypes = [...this.data.styleTypes]
      styleTypes[index].value = value
      this.setData({ styleTypes })
    }
  }
})
