# 架构重构进度报告

## 已完成的工作

### 1. 常量管理重构 ✅

#### 1.1 创建 initSystemConfig 云函数
- 文件：`cloudfunctions/initSystemConfig/index.js`
- 功能：初始化系统配置，将所有常量写入 `sys_config` 集合
- 包含的常量：
  - `ROLE_OPTIONS` - 角色选项
  - `POSITION_OPTIONS` - 岗位选项
  - `DEPARTMENT_OPTIONS` - 部门选项
  - `GENDER_OPTIONS` - 性别选项
  - `ROLE_POSITION_MAP` - 角色-岗位映射
  - `NEED_DEPARTMENT_ROLES` - 需要填写部门的角色
  - `NEED_RELATIVE_ROLES` - 需要填写亲属信息的角色
  - `REQUEST_STATUS` - 请求状态枚举
  - `TASK_STATUS` - 任务状态枚举
  - `ORDER_STATUS` - 工单状态枚举
  - `MEDICAL_APPROVAL_STEPS` - 就医申请审批步骤
  - `TIMEZONE_OFFSET` - 时区偏移量
  - `COLLECTIONS` - 数据库集合名称

#### 1.2 创建后端共享常量模块
- 文件：`cloudfunctions/shared/constants.js`
- 功能：从数据库加载常量，带5分钟缓存
- 提供方法：
  - `getConstant(key)` - 获取单个常量
  - `getConstants(keys)` - 获取多个常量
  - `getAllConstants()` - 获取所有常量
  - `clearCache()` - 清除缓存

#### 1.3 创建前端常量模块
- 文件：`miniprogram/common/constants.js`
- 功能：通过云函数获取系统配置
- 提供方法：
  - `getConstant(key)` - 获取单个常量
  - `getConstants(keys)` - 获取多个常量
  - `getAllConstants()` - 获取所有常量
  - `clearCache()` - 清除缓存

### 2. 时间处理重构 ✅

#### 2.1 时间函数架构设计（重新设计）✅

**核心原则**：
- **后端：只存储和返回 GMT 时间戳，不做任何时间格式化**
- **前端：统一处理所有时间格式化，基于时区偏移常量**
- **订阅消息：云函数可以格式化时间（仅用于微信订阅消息）**

**后端时间处理**：
- 使用 `Date.now()` 获取当前 GMT 时间戳
- 数据库中所有时间字段存储 GMT 时间戳
- 云函数返回数据时直接返回时间戳
- **例外**：`workflowNotify/index.js` 可以格式化时间（用于微信订阅消息）

**前端时间处理**：
- 文件：`miniprogram/common/utils.js`
- 所有函数都是同步的（从缓存读取时区偏移量）
- 提供方法：
  - `getTimezoneOffset()` - 获取时区偏移量（同步，从缓存）
  - `toLocalTime(timestamp, offset)` - 转换为本地时间
  - `formatDateTime(timestamp, offset)` - 格式化日期时间（YYYY-MM-DD HH:mm:ss）
  - `formatDate(timestamp, offset)` - 格式化日期（YYYY-MM-DD）
  - `formatTime(timestamp, offset)` - 格式化时间（HH:mm:ss）
  - `formatRelativeTime(timestamp, offset)` - 格式化相对时间（如"5分钟前"）
  - `formatShortDateTime(timestamp, offset)` - 格式化简短日期时间（MM-DD HH:mm）
  - `getTodayDate(offset)` - 获取今天的日期
  - `now()` - 获取当前 GMT 时间戳

#### 2.2 云函数时间格式化处理 ✅

**workflowNotify/index.js**：
- 创建了 `formatTimeForMessage(timestamp)` 函数
- 专门用于微信订阅消息的时间格式化
- 替换了所有 `toLocaleString('zh-CN')` 的使用
- 其他云函数返回数据时使用时间戳，不进行格式化

#### 2.3 constants 模块更新 ✅

**添加同步获取方法**：
- `getConstantSync(key)` - 从缓存中同步获取常量
- 如果缓存不存在，返回默认值
- 用于时间格式化函数同步获取时区偏移量

### 3. 工具函数重构 ✅

#### 3.1 创建后端通用工具模块
- 文件：`cloudfunctions/shared/common.js`
- 功能：通用工具函数
- 提供方法：
  - `normalizeBoolean(value)` - 规范化布尔值
  - `generateRequestNo(prefix)` - 生成请求编号
  - `getAvatarColor(text)` - 获取头像颜色
  - `formatLocation(longitude, latitude)` - 格式化经纬度
  - `compareVersion(v1, v2)` - 比较版本号
  - `deepClone(obj)` - 深拷贝
  - `debounce(fn, delay)` - 防抖
  - `throttle(fn, interval)` - 节流
  - `isEmpty(value)` - 检查是否为空
  - `sleep(ms)` - 延迟执行

#### 3.2 创建前端通用工具模块
- 文件：`miniprogram/common/utils.js`
- 功能：前端专用工具函数
- 提供方法：
  - 所有后端工具函数
  - `needDepartmentField(role)` - 判断角色是否需要填写部门
  - `needRelativeField(role)` - 判断角色是否需要填写亲属信息
  - `getPositionOptionsByRole(role)` - 获取角色对应的岗位选项
  - `showToast(options)` - 显示提示

### 4. 前端硬编码修复 ✅

#### 4.1 edit-profile.js ✅
- 移除硬编码的常量定义
- 在 `onLoad` 中调用 `loadConstants()` 获取常量
- 使用常量判断角色需求
- 使用 `utils.getTodayDate()` 获取今天日期

#### 4.2 register.js ✅
- 移除硬编码的常量定义
- 添加 `loadConstants()` 方法
- 使用常量判断角色需求
- 使用 `utils.getTodayDate()` 获取今天日期

### 5. 创建架构重构文档 ✅
- 文件：`.codebuddy/docs/ARCHITECTURE_REFACTORING_PLAN.md`
- 内容：详细的重构方案、问题总结、实施步骤

---

## 待完成的工作

### 1. 修复 approval.js 硬编码 ✅
**已修复的问题**：
- ✅ 修复了时间函数调用：从 `formatRelativeTimeToTimezone` 改为 `formatRelativeTime`
- ✅ 修复了时间函数调用：从 `formatDateTimeToTimezone` 改为 `formatDateTime`
- ✅ 修复了常量获取：从 `allConstants.timezoneOffset` 改为 `allConstants.TIMEZONE_OFFSET`
- ✅ 修复了错误处理中的旧函数引用

**待修复的硬编码**：
- 审批步骤名称（stepNames）：`['', '部门负责人审批', '会计主管审批', '馆领导审批']`
- 审批角色数组（stepRoles）：`['', '部门负责人', '会计主管', '馆领导']`
- 角色图标配置（approvalTypes）：需要从数据库动态生成

**修复方案**：
```javascript
// 在 onLoad 中加载常量
async onLoad() {
  const allConstants = await constants.getAllConstants()
  const medicalSteps = allConstants.MEDICAL_APPROVAL_STEPS || []
  const roleOptions = allConstants.ROLE_OPTIONS || []
  
  this.setData({
    medicalApprovalSteps: medicalSteps,
    roleOptions: roleOptions,
    // ...
  })
}

// 在 calculateMedicalProgress 中使用
function calculateMedicalProgress(currentStep, medicalApprovalSteps) {
  if (!currentStep) {
    return { percent: 0, currentText: '等待提交' }
  }
  
  const totalSteps = medicalApprovalSteps.length
  const percent = Math.min(Math.floor((currentStep / totalSteps) * 100), 100)
  
  const currentText = medicalApprovalSteps[currentStep - 1]?.stepName || '进行中'
  
  return { percent, currentText, currentStep, totalSteps }
}
```

### 2. 删除 officeAuth 兼容性代码 ⏳
需要删除的内容：
- `requestCollection` 引用
- `findRequestByOpenId` 函数
- `formatRequestRecord` 函数
- 旧申请表查询和迁移代码（第340-379行）
- 更新旧申请表代码（第250-259行、第470-489行）
- `sourceOrderId`、`sourceRequestId` 字段

### 3. 更新后端云函数使用常量 ✅
已修改的云函数：
- `cloudfunctions/officeAuth/index.js` - 直接从数据库读取常量（移除 shared 模块依赖）
- `cloudfunctions/getSystemConfig/index.js` - 新增云函数，供前端调用获取配置

### 4. 修复云函数模块引用问题 ✅
**问题**：云函数之间无法通过文件系统共享代码
**原因**：每个云函数独立部署，无法访问其他目录的文件
**解决方案**：
1. 删除 `shared` 文件夹（云函数间无法共享文件）
2. 在 `officeAuth` 云函数内部直接实现从数据库读取常量的逻辑
3. 创建 `getSystemConfig` 云函数供前端调用
4. 其他云函数按需实现自己的常量读取逻辑

### 5. 测试验证 ✅
- [x] 部署 `initSystemConfig` 云函数并执行初始化
- [x] 部署 `officeAuth` 云函数
- [x] 部署 `getSystemConfig` 云函数
- [x] 测试前端页面加载
- [x] 测试登录功能
- [x] 验证数据库常量读取
- [x] 修复时间格式化函数缺失问题

### 6. 修复工具函数缺失 ✅
**问题**：`utils.formatRelativeTimeToTimezone is not a function`

**原因**：
- `utils.js` 中只有异步的时间格式化函数
- WXML 模板中需要同步函数
- 函数命名不一致

**解决方案**：
重新设计时间函数架构：
1. 移除所有异步的时间格式化函数
2. 所有时间函数都是同步的（从缓存读取时区偏移量）
3. 统一函数命名：`formatDateTime`, `formatDate`, `formatRelativeTime` 等
4. 添加 `constants.getConstantSync()` 方法支持同步获取常量

**修复文件**：
- `miniprogram/common/utils.js` ✅（完全重写）
- `miniprogram/common/constants.js` ✅（添加同步方法）
- `cloudfunctions/workflowNotify/index.js` ✅（修复订阅消息时间格式化）

### 7. 修复页面时间函数调用 ✅
**问题**：审批中心页报错 `utils.formatRelativeTimeToTimezone is not a function`

**修复的文件**：
- `miniprogram/pages/office/approval/approval.js` ✅
  - 修复了 `formatRelativeTimeToTimezone` → `formatRelativeTime`
  - 修复了 `formatDateTimeToTimezone` → `formatDateTime`
  - 修复了 `allConstants.timezoneOffset` → `allConstants.TIMEZONE_OFFSET`
  - 修复了错误处理中的旧函数引用

- `miniprogram/pages/office/announcement-detail/announcement-detail.js` ✅
  - 修复了 `util.formatDateTimeToGMT3` → `utils.formatDateTime(timestamp, -3)`

### 8. 更新编码规范 ✅
**添加内容**：
- `CODING_STANDARDS.md` 第 11 章：时间处理规范
  - 11.0 工具函数统一入口（新增）
  - 11.1 核心原则
  - 11.2 后端时间处理
  - 11.3 前端时间处理
  - 11.4 时间函数 API
  - 11.5 时区偏移量配置
  - 11.6 常见错误案例

**更新内容**：
- 10.10 时间处理相关检查清单

### 9. 统一工具函数入口 ✅
**问题**：`miniprogram/common/utils.js` 和 `miniprogram/util/util.js` 重复

**解决方案**：
1. ✅ 将 `util/util.js` 中的独有函数合并到 `common/utils.js`：
   - `formatDuration(time)` - 格式化时长（时分秒）
   - `formatLocation(longitude, latitude)` - 格式化经纬度
   - `compareVersion(v1, v2)` - 比较版本号
   - `sleep(ms)` - 延迟执行

2. ✅ 更新编码规范，明确使用 `common/utils.js`

3. ✅ **已修复所有引用 `util/util.js` 的文件**（共 20 个文件）

4. ⏳ 最终删除 `util/util.js`

**修复的文件列表**：
- `miniprogram/pages/office/profile/profile.js` ✅
- `miniprogram/pages/office/profile/edit-profile/edit-profile.js` ✅
- `miniprogram/pages/auth/register/register.js` ✅
- `miniprogram/pages/auth/login/login.js` ✅
- `miniprogram/pages/office/home/home.js` ✅
- `miniprogram/pages/office/notifications/notifications.js` ✅
- `miniprogram/pages/office/menus/menus.js` ✅
- `miniprogram/pages/office/menu-edit/menu-edit.js` ✅
- `miniprogram/pages/office/menu-detail/menu-detail.js` ✅
- `miniprogram/pages/office/medical-application/medical-application.js` ✅
- `miniprogram/pages/office/approval/approval.js` ✅
- `miniprogram/pages/office/announcement-list/announcement-list.js` ✅
- `miniprogram/pages/office/announcement-detail/announcement-detail.js` ✅
- `miniprogram/pages/office/announcement-create/announcement-create.js` ✅
- `miniprogram/packageAPI/pages/worker/worker/worker.js` ✅
- `miniprogram/packageAPI/pages/media/voice/voice.js` ✅
- `miniprogram/packageAPI/pages/media/background-audio/background-audio.js` ✅
- `miniprogram/packageAPI/pages/location/get-location/get-location.js` ✅
- `miniprogram/packageAPI/pages/location/choose-location/choose-location.js` ✅
- `miniprogram/packageCloud/pages/database/server-date/server-date.js` ✅

**修改内容**：
- 替换 `require('../../../util/util.js')` 为 `require('../../../common/utils.js')`
- 替换 `util.showToast` 为 `utils.showToast`
- 替换 `util.formatTime` 为 `utils.formatDuration`
- 替换 `util.formatTimeToGMT3` 为 `utils.formatRelativeTime`
- 替换 `util.toGMT3Date` 为 `utils.toLocalTime`
- 替换 `util.formatLocation` 为 `utils.formatLocation`
- 移除 `util.formatDateTimeToGMT3` 等旧函数调用

**统一后的 `common/utils.js` 包含**：
- 时间处理函数（formatDateTime, formatDate, formatRelativeTime 等）
- 通用工具（showToast, deepClone, generateRequestNo 等）
- 角色判断函数（needDepartmentField, needRelativeField 等）
- 从旧文件迁移的函数（formatDuration, formatLocation, compareVersion, sleep）

---

## 注意事项

### 1. 部署顺序
1. 先部署 `initSystemConfig` 云函数
2. 执行初始化，写入常量到数据库
3. 部署其他云函数
4. 测试前端页面

### 2. 数据库集合
确保 `sys_config` 集合已创建

### 3. 权限配置
`sys_config` 集合需要设置适当的读写权限

---

## 文件清单

### 新增文件
```
cloudfunctions/
  initSystemConfig/
    index.js
    package.json
  getSystemConfig/
    index.js
    package.json

miniprogram/
  common/
    constants.js
    utils.js

.codebuddy/
  docs/
    ARCHITECTURE_REFACTORING_PLAN.md
    REFACTORING_PROGRESS.md
```

### 修改的文件
```
cloudfunctions/
  officeAuth/
    index.js ✅ (移除 shared 模块依赖，直接从数据库读取常量)

miniprogram/
  pages/
    office/
      profile/
        edit-profile/
          edit-profile.js ✅
      approval/
        approval.js ✅ (已修复时间函数调用)
      announcement-detail/
        announcement-detail.js ✅ (已修复时间函数调用)
    auth/
      register/
        register.js ✅
```

### 待删除文件
```
cloudfunctions/
  shared/ - 应该删除（云函数间无法共享文件，且不再需要后端时间处理）
```

**注意**：`shared` 文件夹中的 `time.js` 已不再需要，因为：
1. 后端不需要时间处理函数（只使用 Date.now()）
2. 所有时间格式化都在前端进行
3. 没有任何代码引用 `shared` 模块

---

**更新时间**: 2026-03-17
**状态**: 进行中
