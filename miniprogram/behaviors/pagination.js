/**
 * 分页加载 Behavior
 * 
 * 提供通用的分页加载功能，支持：
 * 1. 滚动到底部自动加载更多
 * 2. 下拉刷新重置分页
 * 3. 加载状态管理
 * 4. 防重复加载
 * 5. 空状态和无更多数据提示
 * 
 * 使用方法：
 * 1. 在页面的 behaviors 中引入此 behavior
 * 2. 在 data 中定义分页相关字段
 * 3. 实现 loadData 方法来加载数据
 * 4. 在 WXML 中使用提供的模板
 */

module.exports = Behavior({
  behaviors: [],

  data: {
    // 分页相关数据
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    list: [],

    // 分页配置
    initialPageSize: 20,  // 初始加载数量
    loadMorePageSize: 10,  // 滚动加载更多时的数量
  },

  methods: {
    /**
     * 初始化分页
     * @param {Object} options - 配置选项
     * @param {number} options.initialPageSize - 初始加载数量
     * @param {number} options.loadMorePageSize - 加载更多时的数量
     * @param {number} options.defaultPageSize - 默认每页数量
     */
    initPagination(options = {}) {
      const {
        initialPageSize = 20,
        loadMorePageSize = 10,
        defaultPageSize = 20
      } = options

      this.setData({
        page: 1,
        pageSize: initialPageSize,
        initialPageSize,
        loadMorePageSize,
        hasMore: true,
        loading: false,
        list: []
      })
    },

    /**
     * 重置分页状态
     */
    resetPagination() {
      this.setData({
        page: 1,
        pageSize: this.data.initialPageSize || 20,
        hasMore: true,
        loading: false
      })
    },

    /**
     * 加载数据（由子类实现）
     * @param {Object} params - 分页参数 { page, pageSize }
     * @returns {Promise} - 返回数据对象 { data: [], hasMore: boolean }
     */
    loadData: function(params) {
      console.error('[PaginationBehavior] 子类必须实现 loadData 方法')
      return Promise.reject(new Error('子类必须实现 loadData 方法'))
    },

    /**
     * 加载列表数据
     * @param {boolean} loadMore - 是否加载更多
     */
    async loadListData(loadMore = false) {
      // 防止重复加载
      if (this.data.loading) {
        return
      }

      // 检查是否还有更多数据
      if (loadMore && !this.data.hasMore) {
        return
      }

      try {
        this.setData({ loading: true })

        const page = loadMore ? this.data.page : 1
        const pageSize = loadMore 
          ? (this.data.loadMorePageSize || 10)
          : (this.data.initialPageSize || 20)

        // 调用子类实现的 loadData 方法
        const result = await this.loadData({ page, pageSize })

        if (!result) {
          throw new Error('loadData 返回数据格式错误')
        }

        const newData = result.data || []
        const hasMore = result.hasMore !== undefined ? result.hasMore : (newData.length === pageSize)

        this.setData({
          list: loadMore ? [...this.data.list, ...newData] : newData,
          page: page + 1,
          hasMore,
          loading: false
        })

        return { success: true, data: newData, hasMore }
      } catch (error) {
        console.error('[PaginationBehavior] 加载数据失败:', error)
        this.setData({ loading: false })
        
        wx.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })

        return { success: false, error }
      }
    },

    /**
     * 刷新列表（下拉刷新）
     */
    async refreshList() {
      this.resetPagination()
      await this.loadListData(false)
    },

    /**
     * 加载更多（滚动到底部）
     */
    async loadMore() {
      if (this.data.hasMore && !this.data.loading) {
        await this.loadListData(true)
      }
    },

    /**
     * 滚动到底部事件（由子页面调用）
     */
    onReachBottom() {
      this.loadMore()
    },

    /**
     * 下拉刷新事件（由子页面调用）
     */
    async onPullDownRefresh() {
      await this.refreshList()
      wx.stopPullDownRefresh()
    },

    /**
     * 设置列表数据（用于手动设置列表，如搜索、筛选等场景）
     * @param {Array} list - 列表数据
     * @param {boolean} hasMore - 是否还有更多数据
     */
    setListData(list, hasMore = true) {
      this.setData({
        list,
        hasMore,
        page: 1
      })
    },

    /**
     * 追加数据到列表（如实时插入新数据）
     * @param {Array|Object} data - 要追加的数据
     */
    appendToList(data) {
      const items = Array.isArray(data) ? data : [data]
      this.setData({
        list: [...items, ...this.data.list]
      })
    },

    /**
     * 更新列表中的某项数据
     * @param {string|number} id - 项的 ID
     * @param {Object} updates - 要更新的字段
     * @param {string} idField - ID 字段名，默认 '_id'
     */
    updateListItem(id, updates, idField = '_id') {
      const { list } = this.data
      const index = list.findIndex(item => item[idField] === id)

      if (index !== -1) {
        const updatedList = [...list]
        updatedList[index] = { ...updatedList[index], ...updates }
        this.setData({ list: updatedList })
      }
    },

    /**
     * 从列表中删除某项数据
     * @param {string|number} id - 项的 ID
     * @param {string} idField - ID 字段名，默认 '_id'
     */
    removeListItem(id, idField = '_id') {
      const { list } = this.data
      const updatedList = list.filter(item => item[idField] !== id)
      this.setData({ list: updatedList })
    }
  }
})
