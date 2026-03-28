---
name: haircut-deadline-logic
overview: 理发预约14:20截止逻辑移至前端，按角色区分普通用户和招待员的行为限制
todos:
  - id: modify-cloud-function
    content: 移除云函数 haircutManager 中 formatDate、isDayFullyDisabled 函数及 createAppointment 的时间检查
    status: completed
  - id: modify-frontend-js
    content: 修改 haircut.js：新增 data 属性、调整 loadDisplayDates/handleDateSelect/handleSlotSelect/handleSlotAction 逻辑
    status: completed
    dependencies:
      - modify-cloud-function
  - id: modify-frontend-wxml
    content: 修改 haircut.wxml：调整时段列表可见性、移除招待员 booked 按钮、为 myBooked 和我的预约按钮添加条件
    status: completed
    dependencies:
      - modify-frontend-js
---

## 用户需求

理发预约功能的时间限制逻辑调整，将判断从前端+后端双重校验改为仅前端判断，后端只负责数据库操作。

### 普通用户行为：

1. 当日14:20后 -> 当日日期显示为禁用（灰显），但仍可点击查看时段，点击任何时段弹出 modal 提示"当日时段已锁定，请联系招待员"
2. 点击"我已预约"的时段 -> 无操作（不弹出取消确认）
3. 当日14:20后，自己预约的时段旁边不再显示"x"按钮
4. "我的预约"列表中，当日14:20后当天预约不显示"取消预约"按钮

### 招待员行为：

1. 不受14:20限制，当日日期正常显示、可预约、可取消
2. 时段列表中保留"已被预约"的x按钮，允许招待员在时段列表中取消他人（或自己）的预约
3. 点击"已被预约"的时段卡片本身不再弹出取消确认（改为无操作），取消操作只能通过x按钮

### 云函数：

- 移除 `createAppointment` 中的14:20时间检查
- 移除 `isDayFullyDisabled` 和 `formatDate` 辅助函数（仅被上述检查使用）

## 技术方案

### 修改文件清单

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| `cloudfunctions/haircutManager/index.js` | MODIFY | 移除时间检查逻辑 |
| `miniprogram/pages/office/haircut/haircut.js` | MODIFY | 前端14:20限制 + 锁定逻辑 |
| `miniprogram/pages/office/haircut/haircut.wxml` | MODIFY | 按钮可见性条件调整 |


### 1. 云函数 `haircutManager/index.js`

**移除内容：**

- 删除 `formatDate` 函数（line 73-78），仅被 `isDayFullyDisabled` 使用
- 删除 `isDayFullyDisabled` 函数（line 82-97）
- 删除 `createAppointment` 中 line 214-217 的时间检查：

```javascript
// 删除以下4行
if (isDayFullyDisabled(date)) {
throw new Error('当前时间已过预约截止时间（当日14:20）')
}
```

### 2. 前端 JS `haircut.js`

#### 2.1 data 新增属性

```javascript
data: {
    // ...现有属性...
    isDayPastDeadline: false,  // 当前是否已过当日14:20
    todayStr: ''               // 今日日期字符串 YYYY-MM-DD
}
```

#### 2.2 onShow 更新

在 `onShow` 中设置时间状态：

```javascript
onShow() {
    this.setData({
        isDayPastDeadline: this.isAfterDeadline(),
        todayStr: this.formatLocalDate(new Date())
    })
    this.loadData()
}
```

#### 2.3 loadDisplayDates 调整（line 149-240）

在 line 181-182 处，将原来的 `isFullyDisabled` 逻辑改为区分 `isDisabled`（灰显）和 `isDayLocked`（可查看但锁定）：

```javascript
// 原代码 line 181-182:
// const isFullyDisabled = calcDate.date === todayStr && this.isAfterDeadline()

// 改为：
const isDayLocked = calcDate.date === todayStr && this.isAfterDeadline() && !this.data.isReceptionist

displayDates.push({
    ...calcDate,
    isHoliday: false,
    isToday: calcDate.date === todayStr,
    isDisabled: isDayLocked,          // 灰显视觉效果
    isDayLocked,                       // 新属性：区分节假日禁用和截止时间锁定
    disableReason: isDayLocked ? '当日时段已锁定，请联系招待员' : '',
    reservationCount: 0
})
```

#### 2.4 handleDateSelect 调整（line 388-395）

节假日仍阻止加载时段，但截止时间锁定的日期允许查看时段：

```javascript
// 原代码 line 388-391:
// if (dateInfo.isDisabled) { return }

// 改为：仅节假日阻止
if (dateInfo.isDisabled && !dateInfo.isDayLocked) {
    return
}
```

#### 2.5 handleSlotSelect 调整（line 468-490）

- 新增：当日锁定时，点击任何时段弹出提示
- 移除：点击"我已预约"时段弹出取消确认的逻辑

```javascript
handleSlotSelect(e) {
    const slot = e.currentTarget.dataset.slot
    if (!slot) return
    
    // 当日时段已锁定（普通用户14:20后）
    if (this.data.selectedDateInfo && this.data.selectedDateInfo.isDayLocked) {
        wx.showModal({
            title: '提示',
            content: '当日时段已锁定，请联系招待员',
            showCancel: false
        })
        return
    }
    
    // 不可预约的时段
    if (slot.status === 'unavailable') return
    // 已被他人预约的时段
    if (slot.status === 'booked') return
    // 我已预约的时段 - 无操作
    if (slot.status === 'myBooked') return
    
    // 可预约时段 - 弹出预约弹窗
    this.setData({ selectedSlot: slot.start, selectedSlotDisplay: slot.display })
    this.showBookingForm()
}
```

#### 2.6 handleSlotAction（line 532-619）

保留 `booked` 分支（line 536-540），招待员仍可通过x按钮取消他人预约，无需修改此函数。

### 3. 前端 WXML `haircut.wxml`

#### 3.1 时段列表区域可见性（line 64）

允许截止时间锁定的日期也显示时段：

```xml
<!-- 原代码 -->
<view class="haircut-slots-section" wx:if="{{selectedDate && !(selectedDateInfo && selectedDateInfo.isDisabled)}}">
<!-- 改为 -->
<view class="haircut-slots-section" wx:if="{{selectedDate && (selectedDateInfo && !selectedDateInfo.isDisabled) || (selectedDateInfo && selectedDateInfo.isDayLocked)}}">
```

#### 3.2 招待员"已被预约"x按钮（line 94-100）

保留不动，招待员仍可通过x按钮取消他人预约。

#### 3.3 用户"我已预约"x按钮加条件（line 101-107）

普通用户14:20后当天不显示x按钮：

```xml
<!-- 原代码 -->
<view wx:if="{{item.status === 'myBooked'}}" ...>
<!-- 改为 -->
<view wx:if="{{item.status === 'myBooked' && (isReceptionist || !selectedDateInfo.isDayLocked)}}" ...>
```

#### 3.4 "我的预约"取消按钮加条件（line 195-197）

普通用户14:20后当天预约不显示取消按钮：

```xml
<!-- 原代码 -->
<view class="haircut-item-actions" wx:if="{{item.status === 'booked'}}">
<!-- 改为 -->
<view class="haircut-item-actions" wx:if="{{item.status === 'booked' && (isReceptionist || !isDayPastDeadline || item.date !== todayStr)}}">
```

### 逻辑验证矩阵

| 场景 | 日期灰显 | 可查看时段 | 点击时段 | x按钮(我的) | 取消按钮(我的预约) |
| --- | --- | --- | --- | --- | --- |
| 普通用户/14:20前/今天 | 否 | 是 | 正常操作 | 显示 | 显示 |
| 普通用户/14:20后/今天 | 是 | 是 | 弹出锁定提示 | 隐藏 | 隐藏(今天) |
| 普通用户/14:20后/非今天 | 否 | 是 | 正常操作 | 显示 | 显示 |
| 招待员/14:20后/今天 | 否 | 是 | 正常操作 | 显示 | 显示 |


### 实现注意事项

- `isDayLocked` 是日期级属性，同一日期下所有时段共享该状态
- "我的预约"Tab 的取消按钮使用 `isDayPastDeadline + todayStr + item.date` 三者组合判断，精确到单条记录
- 不需要 per-item 的 `canCancel` 属性，用 `isReceptionist` + `isDayPastDeadline` + `todayStr` 组合即可