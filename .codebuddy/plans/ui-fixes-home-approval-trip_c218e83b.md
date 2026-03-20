---
name: ui-fixes-home-approval-trip
overview: 修复三个 UI 问题：1) Home 页 icons 改为 flex 布局并放大 emoji；2) 审批详情弹窗添加滑入/滑出动画并支持手势返回；3) 外出报备弹窗穿透滚动问题 + 目的地/同行人点击即显示历史下拉。
todos:
  - id: fix-home-grid-layout
    content: 修改 home.wxss：grid 改 flex 布局并放大 emoji 图标
    status: completed
  - id: add-approval-detail-animation
    content: 为审批详情弹窗添加底部弹出/关闭 CSS transition 动画
    status: completed
    dependencies:
      - fix-home-grid-layout
  - id: handle-approval-back-gesture
    content: 处理审批详情弹窗的系统返回手势关闭
    status: completed
    dependencies:
      - add-approval-detail-animation
  - id: fix-trip-popup-scroll-penetration
    content: 修复外出报备弹窗穿透滚动：添加 catchtouchmove
    status: completed
    dependencies:
      - handle-approval-back-gesture
  - id: add-trip-history-on-focus
    content: 目的地/同行人输入框点击即弹出历史记录下拉
    status: completed
    dependencies:
      - fix-trip-popup-scroll-penetration
---

## 用户需求

### 需求1：Home 页常用功能模块布局调整

- 当前 icons 使用 `display: grid; grid-template-columns: repeat(4, 1fr)` 固定4列网格布局
- 需改为 **flex 布局**，一行占满再换行（每项等宽自适应）
- emoji 图标字体需放大（当前 `font-size: 38rpx`）

### 需求2：审批详情弹窗动画

- 当前使用 `wx:if` 直接切换，无动画，需添加**从底部向上弹出**动画
- 系统返回手势（iOS/Android 从左向右划）时，详情页应**向下关闭**
- 可参考外出报备页 `trip-popup` 的 CSS transition 实现模式

### 需求3：外出报备页两个问题

- **穿透滚动**：弹窗打开时，滑动弹窗内容会导致背景页面跟着滚动。当前弹窗 mask（`trip-popup-mask`）缺少 `catchtouchmove` 阻止事件冒泡
- **历史记录下拉**：目的地、同行人输入框仅在**输入框为空时**（`value === ''`）才显示历史记录。需要改为**点击输入框时**即弹出历史记录下拉选项

## 技术方案

### 问题1：Home Icons Grid 改 Flex

**当前代码** (`home.wxss` 第177-180行)：

```css
.home-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 26rpx 12rpx;
}
```

**修改方案**：

- 将 `.home-grid` 改为 `display: flex; flex-wrap: wrap;`
- `.home-grid-item` 设置 `width: 25%; box-sizing: border-box;` 保持一行4个
- `.home-grid-icon` 的 `font-size` 从 `38rpx` 增大到 `48rpx`，图标容器从 `92rpx` 增大到 `100rpx`

### 问题2：审批详情弹窗添加动画

**当前实现**：组件 WXML 使用 `wx:if="{{visible && request}}"` 即时渲染/销毁，无动画。

**修改方案**（参考 `trip-report` 的成熟模式）：

- WXML：将 `wx:if` 改为始终渲染，通过 CSS class `is-visible` 控制显隐
- JS：移除 `observers` 中对 `request` 的依赖（改为方法调用），新增 `openAnimation` / `closeAnimation` 使用 `wx.createAnimation` API 控制动画（`translateY(100%)` -> `translateY(0)`），动画结束后更新 visible 状态
- WXSS：添加 `.approval-modal-mask` 的 `opacity/visibility` transition，`.approval-modal-card` 的 `transform` transition
- 对于系统返回手势：在 `onShow` 中检测弹窗状态并触发关闭动画。由于审批详情是组件而非独立页面，系统返回手势实际作用于审批页面本身，需要在 `approval.js` 的 `handleQuickAction` 中判断弹窗是否打开，若打开则关闭弹窗而非返回上一页。通过重写 `onShow` 检测弹窗状态实现。

**核心思路**：在 approval.js 页面中维护一个 `showDetail` 标记，当弹窗打开时，拦截页面返回（通过在 WXML 中用条件渲染一个覆盖层 + `catchtouchmove`，或使用自定义导航栏时拦截左划）。但由于微信小程序对系统返回手势的拦截能力有限（无法完全拦截），更实际的方案是：将审批详情改为**独立页面**（`wx.navigateTo`），这样系统返回手势会自然关闭详情页并返回审批列表。但考虑到当前是组件模式且有较多交互（审批/驳回/中止等按钮），改为 CSS 动画方案更合理。

**最终方案**：采用 CSS transition 动画（与外出报备一致），不用 `wx:if` 而是 CSS class 控制。系统返回手势通过在 approval.wxml 的页面容器上添加一个不可见的全屏 `catchtouchmove` 覆盖层来缓解穿透，同时记录弹窗状态，当系统触发返回时在 approval.js 中关闭弹窗。

### 问题3a：外出报备穿透滚动修复

**根因**：`trip-popup-mask`（第93行）只有 `bindtap="hideFormPopup"`，缺少 `catchtouchmove` 阻止触摸事件穿透到背景页面。

**修改方案**：

- 在 `trip-popup-mask` 上添加 `catchtouchmove="preventTouchMove"`
- 在 trip-report.js 中添加空方法 `preventTouchMove() {}`
- 确保弹窗容器内部仍可正常滚动（`catchtap` 已处理）

### 问题3b：历史记录点击即显示

**当前逻辑**（trip-report.js 第369-381行）：

- `handleDestinationInput` / `handleCompanionsInput` 中仅在 `value === ''` 时显示历史
- 没有点击输入框时的触发逻辑

**修改方案**：

- 在 `<input>` 上新增 `bindfocus="handleDestinationFocus"` / `bindfocus="handleCompanionsFocus"`
- focus 回调中始终设置 `showDestinationHistory: true` / `showCompanionsHistory: true`（前提是对应 history 数组非空）
- 保留原有的 `bindinput` 中 `value === ''` 时显示的逻辑作为补充
- 用户选择历史记录后关闭下拉，输入内容后自动隐藏下拉

## 实现说明

### 修改文件清单

| 文件 | 修改类型 | 说明 |
| --- | --- | --- |
| `miniprogram/pages/office/home/home.wxss` | [MODIFY] | grid 改 flex + emoji 放大 |
| `miniprogram/components/approval-detail/approval-detail.wxml` | [MODIFY] | wx:if 改 class 控制 |
| `miniprogram/components/approval-detail/approval-detail.wxss` | [MODIFY] | 添加 transition 动画样式 |
| `miniprogram/components/approval-detail/approval-detail.js` | [MODIFY] | 添加动画控制逻辑 |
| `miniprogram/pages/office/approval/approval.wxml` | [MODIFY] | 传参调整 + 返回拦截 |
| `miniprogram/pages/office/approval/approval.js` | [MODIFY] | 弹窗返回手势处理 |
| `miniprogram/pages/office/trip-report/trip-report.wxml` | [MODIFY] | 添加 catchtouchmove + bindfocus |
| `miniprogram/pages/office/trip-report/trip-report.js` | [MODIFY] | 添加 preventTouchMove + focus 处理 |


### 性能与注意事项

- flex 布局改为 wrap 模式后，隐藏项（`adminOnly`）不应占据布局空间，已有 `wx:if` 条件渲染，不受影响
- CSS transition 方案比 `wx.createAnimation` 更轻量，无需额外创建动画实例
- `catchtouchmove` 不会影响弹窗内部滚动，因为事件在 mask 层被拦截，弹窗容器通过 `catchtap` 已阻止冒泡