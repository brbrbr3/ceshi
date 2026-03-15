# 分页加载框架使用文档

## 📋 概述

本分页加载框架为小程序提供了一个通用的分页加载解决方案，旨在提高程序性能和用户体验。框架支持滚动加载、下拉刷新、加载状态管理等核心功能。

## 🎯 核心特性

- ✅ **滚动加载**：滚动到列表底部自动加载更多数据
- ✅ **下拉刷新**：支持下拉刷新重置分页状态
- ✅ **加载状态管理**：防止重复加载，提升用户体验
- ✅ **空状态提示**：友好的空数据提示
- ✅ **多 Tab 支持**：支持多个独立分页的 Tab
- ✅ **灵活配置**：可配置初始加载数量和后续加载数量

## 📦 框架结构

```
miniprogram/
├── behaviors/
│   └── pagination.js          # 分页加载 Behavior（核心逻辑）
├── components/
│   └── pagination-loading/    # 分页加载 UI 组件
│       ├── pagination-loading.wxml
│       ├── pagination-loading.wxss
│       ├── pagination-loading.js
│       └── pagination-loading.json
├── pages/
│   ├── office/
│   │   ├── notifications/    # 通知列表（已改造）
│   │   └── approval/        # 审批列表（已改造）
```

## 🚀 快速开始

### 1. 引入 Pagination Behavior

在页面的 `.js` 文件中引入 behavior：

```javascript
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],
  
  data: {
    // 页面自定义数据
  },
  
  onLoad() {
    // 初始化分页配置
    this.initPagination({
      initialPageSize: 20,  // 初始加载数量
      loadMorePageSize: 10   // 滚动加载更多时的数量
    })
    
    // 加载第一页数据
    this.loadListData()
  }
})
```

### 2. 实现 loadData 方法

重写 `loadData` 方法来实现数据加载逻辑：

```javascript
Page({
  behaviors: [paginationBehavior],
  
  // 重写 loadData 方法
  async loadData(params) {
    const { page, pageSize } = params
    
    // 调用云函数或 API 获取数据
    const result = await app.callOfficeAuth('getApprovalData', {
      page,
      pageSize
    })
    
    // 返回数据对象
    return {
      data: result.list || [],      // 数据列表
      hasMore: result.hasMore      // 是否还有更多数据
    }
  }
})
```

### 3. 配置页面支持滚动和下拉刷新

在页面的 `.json` 文件中添加配置：

```json
{
  "navigationBarTitleText": "页面标题",
  "enablePullDownRefresh": true,
  "onReachBottomDistance": 50,
  "usingComponents": {}
}
```

### 4. 在 WXML 中使用分页加载状态

在页面的 `.wxml` 文件中添加分页加载状态显示：

```xml
<!-- 列表内容 -->
<view wx:if="{{list.length > 0}}">
  <view wx:for="{{list}}" wx:key="_id">
    <!-- 列表项内容 -->
  </view>
</view>

<!-- 分页加载状态 -->
<view class="pagination-loading" wx:if="{{loading}}">
  <view class="loading-spinner"></view>
  <text class="loading-text">加载中...</text>
</view>

<!-- 没有更多数据提示 -->
<view class="pagination-no-more" wx:elif="{{!hasMore && list.length > 0}}">
  <text class="no-more-text">没有更多数据了</text>
</view>

<!-- 空状态 -->
<view class="empty-state" wx:elif="{{list.length === 0 && !loading}}">
  <view class="empty-icon">📭</view>
  <view class="empty-text">暂无数据</view>
</view>
```

### 5. 添加分页加载样式

在页面的 `.wxss` 文件中添加样式（如果页面没有统一样式）：

```css
/* 分页加载样式 */
.pagination-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx 0;
}

.loading-spinner {
  width: 32rpx;
  height: 32rpx;
  border: 3rpx solid #e0e0e0;
  border-top-color: #1890ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 16rpx;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 28rpx;
  color: #999;
}

.pagination-no-more {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx 0;
}

.no-more-text {
  font-size: 24rpx;
  color: #ccc;
}
```

## 📚 API 文档

### Behavior 数据字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | Number | 1 | 当前页码 |
| `pageSize` | Number | 20 | 每页数量 |
| `hasMore` | Boolean | true | 是否还有更多数据 |
| `loading` | Boolean | false | 是否正在加载 |
| `list` | Array | [] | 列表数据 |
| `initialPageSize` | Number | 20 | 初始加载数量 |
| `loadMorePageSize` | Number | 10 | 加载更多时的数量 |

### Behavior 方法

#### `initPagination(options)`

初始化分页配置。

**参数：**
- `options.initialPageSize` (Number): 初始加载数量，默认 20
- `options.loadMorePageSize` (Number): 加载更多时的数量，默认 10
- `options.defaultPageSize` (Number): 默认每页数量，默认 20

**示例：**
```javascript
this.initPagination({
  initialPageSize: 20,
  loadMorePageSize: 10
})
```

#### `resetPagination()`

重置分页状态（页码重置为 1，清空列表）。

**示例：**
```javascript
this.resetPagination()
```

#### `loadData(params)` **必须实现**

加载数据的方法，由子类实现。

**参数：**
- `params.page` (Number): 当前页码
- `params.pageSize` (Number): 每页数量

**返回：**
- `Promise<{ data: Array, hasMore: Boolean }>`

**示例：**
```javascript
async loadData(params) {
  const { page, pageSize } = params
  const result = await wx.cloud.callFunction({
    name: 'cloudFunction',
    data: { page, pageSize }
  })
  return {
    data: result.data.list,
    hasMore: result.data.hasMore
  }
}
```

#### `loadListData(loadMore)`

加载列表数据。

**参数：**
- `loadMore` (Boolean): 是否加载更多，默认 false

**示例：**
```javascript
// 加载第一页
this.loadListData()

// 加载更多
this.loadListData(true)
```

#### `refreshList()`

刷新列表（下拉刷新）。

**示例：**
```javascript
this.refreshList()
```

#### `loadMore()`

加载更多（滚动到底部）。

**示例：**
```javascript
this.loadMore()
```

#### `onReachBottom()` **自动调用**

滚动到底部事件，Behavior 会自动调用 `loadMore()`。

**注意：** 页面需要在 `.json` 文件中配置 `"onReachBottomDistance": 50`

#### `onPullDownRefresh()` **自动调用**

下拉刷新事件，Behavior 会自动调用 `refreshList()`。

**注意：** 页面需要在 `.json` 文件中配置 `"enablePullDownRefresh": true`

#### `setListData(list, hasMore)`

设置列表数据（用于手动设置列表，如搜索、筛选等场景）。

**参数：**
- `list` (Array): 列表数据
- `hasMore` (Boolean): 是否还有更多数据，默认 true

**示例：**
```javascript
this.setListData(newList, true)
```

#### `appendToList(data)`

追加数据到列表（如实时插入新数据）。

**参数：**
- `data` (Array|Object): 要追加的数据

**示例：**
```javascript
// 追加单条数据
this.appendToList(newItem)

// 追加多条数据
this.appendToList([item1, item2, item3])
```

#### `updateListItem(id, updates, idField)`

更新列表中的某项数据。

**参数：**
- `id` (String|Number): 项的 ID
- `updates` (Object): 要更新的字段
- `idField` (String): ID 字段名，默认 '_id'

**示例：**
```javascript
this.updateListItem('123', { read: true })
```

#### `removeListItem(id, idField)`

从列表中删除某项数据。

**参数：**
- `id` (String|Number): 项的 ID
- `idField` (String): ID 字段名，默认 '_id'

**示例：**
```javascript
this.removeListItem('123')
```

## 🎨 高级用法

### 多 Tab 分页

对于有多个 Tab 的页面（如审批列表），需要为每个 Tab 单独管理分页状态：

```javascript
Page({
  behaviors: [paginationBehavior],
  
  data: {
    activeTab: 'pending',
    pagination: {
      pending: { page: 1, hasMore: true, loading: false },
      mine: { page: 1, hasMore: true, loading: false },
      done: { page: 1, hasMore: true, loading: false }
    }
  },
  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    
    // 切换 tab 时，如果该 tab 的列表为空，加载第一页
    if (this.data[tab + 'List'].length === 0) {
      this.loadListData()
    }
  },
  
  loadData(params) {
    const { page, pageSize } = params
    const activeTab = this.data.activeTab
    
    // 根据当前 tab 加载对应数据
    return app.callOfficeAuth('getApprovalData', {
      page,
      pageSize,
      tab: activeTab
    }).then(result => {
      // 更新对应 tab 的分页状态
      this.setData({
        [`pagination.${activeTab}.page`]: page,
        [`pagination.${activeTab}.hasMore`]: result.hasMore
      })
      
      return {
        data: result.list,
        hasMore: result.hasMore
      }
    })
  }
})
```

### 搜索场景

对于搜索场景，需要先清空列表，然后加载搜索结果：

```javascript
Page({
  behaviors: [paginationBehavior],
  
  search(keyword) {
    // 重置分页状态
    this.resetPagination()
    
    // 更新数据源标识
    this.setData({ isSearch: true, keyword })
    
    // 加载搜索结果
    this.loadListData()
  },
  
  loadData(params) {
    const { page, pageSize } = params
    const { isSearch, keyword } = this.data
    
    if (isSearch && keyword) {
      return app.searchData({ keyword, page, pageSize })
    }
    
    return app.loadData({ page, pageSize })
  }
})
```

### 实时更新

对于需要实时更新的场景，可以使用 `updateListItem` 方法：

```javascript
Page({
  behaviors: [paginationBehavior],
  
  // 接收实时更新
  onRealtimeUpdate(update) {
    if (update.type === 'update') {
      this.updateListItem(update.id, update.changes)
    } else if (update.type === 'add') {
      this.appendToList(update.data)
    } else if (update.type === 'delete') {
      this.removeListItem(update.id)
    }
  }
})
```

## 📊 性能优化建议

### 1. 合理设置分页大小

```javascript
this.initPagination({
  initialPageSize: 20,  // 初始加载 20 条
  loadMorePageSize: 10   // 每次加载 10 条
})
```

**推荐配置：**
- 初始加载：15-20 条
- 滚动加载：10-15 条
- 根据列表项的复杂度调整

### 2. 使用虚拟列表

对于超长列表（超过 100 项），建议使用虚拟列表组件：

```json
{
  "usingComponents": {
    "recycle-view": "/miniprogram_npm/miniprogram-recycle-view/recycle-view"
  }
}
```

### 3. 图片懒加载

对于包含图片的列表，使用懒加载：

```xml
<image 
  wx:for="{{list}}" 
  wx:key="_id"
  lazy-load 
  mode="aspectFill"
/>
```

### 4. 防抖和节流

对于滚动事件，可以使用防抖：

```javascript
onReachBottom: throttle(function() {
  this.loadMore()
}, 500)
```

## 🔧 云函数改造

### 添加分页参数

在云函数中添加分页参数支持：

```javascript
async function getData(openid, pagination = {}) {
  const { page = 1, pageSize = 20 } = pagination
  const skipCount = (page - 1) * pageSize
  
  const result = await db.collection('collection')
    .where({ /* 查询条件 */ })
    .orderBy('createdAt', 'desc')
    .skip(skipCount)
    .limit(pageSize)
    .get()
  
  return {
    data: result.data,
    hasMore: result.data.length >= pageSize
  }
}
```

## 📝 已改造页面

- ✅ **通知列表** (`pages/office/notifications/notifications`)
  - 支持滚动加载
  - 支持下拉刷新
  - 加载状态提示

- ✅ **审批列表** (`pages/office/approval/approval`)
  - 支持多 Tab 分页
  - 每个 Tab 独立管理分页状态
  - 支持滚动加载和下拉刷新

## 🎯 后续扩展

### 新页面如何使用分页加载？

1. 在页面 JS 中引入 behavior
2. 实现 `loadData` 方法
3. 在 WXML 中添加分页加载状态
4. 在 JSON 中配置下拉刷新和滚动加载

### 通用最佳实践

1. **初始加载**：在 `onLoad` 中调用 `loadListData()`
2. **滚动加载**：Behavior 自动处理，无需手动调用
3. **下拉刷新**：Behavior 自动处理，无需手动调用
4. **空状态**：显示友好的空状态提示
5. **加载状态**：防止重复加载，提升用户体验

## 📚 参考资料

- [微信小程序文档 - 页面事件](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html#onReachBottom)
- [微信小程序文档 - 下拉刷新](https://developers.weixin.qq.com/miniprogram/dev/api/pulldown.html)
- [CloudBase 文档 - 数据库查询](https://docs.cloudbase.net/database/introduce.html)

## 🤝 贡献

如果您发现任何问题或有改进建议，欢迎提出！

## 📄 版本历史

### v1.0.0 (2026-03-15)

- ✅ 创建分页加载 Behavior
- ✅ 创建分页加载 UI 组件
- ✅ 改造通知列表页面
- ✅ 改造审批列表页面
- ✅ 修改云函数支持分页
- ✅ 修改 app.js 数据获取方法支持分页
