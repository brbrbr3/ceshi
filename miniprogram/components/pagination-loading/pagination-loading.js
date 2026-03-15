/**
 * 分页加载组件
 * 
 * 这是一个轻量级的分页加载组件，提供通用的分页功能
 * 配合 pagination behavior 使用效果更佳
 * 
 * 使用方法：
 * 1. 在页面 WXML 中引入模板
 * 2. 使用 behavior 管理分页逻辑
 * 3. 使用此组件显示加载状态
 */

Component({
  properties: {
    // 是否正在加载
    loading: {
      type: Boolean,
      value: false
    },
    // 是否还有更多数据
    hasMore: {
      type: Boolean,
      value: true
    },
    // 列表数据长度（用于判断空状态）
    listLength: {
      type: Number,
      value: 0
    }
  },

  data: {
    
  },

  methods: {
    
  }
})
