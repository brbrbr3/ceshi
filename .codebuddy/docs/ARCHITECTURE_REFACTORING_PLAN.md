# 架构重构方案

## 一、问题总结

### 1.1 常量管理问题
- **前端常量**: 从 npm 包 `ceshi-shared` 导入（包不存在或未构建）
- **后端常量**: 分散在各云函数中，存在大量重复定义
- **硬编码**: 前后端代码中大量硬编码的角色、部门、状态等值

### 1.2 兼容性代码问题
- `officeAuth` 中存在旧申请表（`office_registration_requests`）相关代码
- `sourceOrderId`/`sourceRequestId` 字段用于数据迁移
- 多处字段名兼容处理（如 `authorName` vs `userName`）
- 权限检查失败的降级处理

### 1.3 工具函数重复问题
- 前端有两个工具文件：`common/utils.js` 和 `util/util.js`，存在大量重复
- 后端 `commonUtils/utils.js` 和 `officeAuth/utils.js` 完全重复
- 时间处理函数分散，未统一时区管理

---

## 二、重构方案

### 2.1 常量管理重构

#### 2.1.1 数据库结构设计

**集合名称**: `sys_config`

**字段设计**:
```javascript
{
  _id: 'auto_generated',
  type: 'role',           // 常量类型：role, position, department, gender, request_status, workflow, timezone
  key: 'ROLE_OPTIONS',     // 常量键名
  value: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],  // 常量值
  description: '角色选项列表',  // 描述
  sort: 1,                 // 排序权重
  createdAt: 1234567890,
  updatedAt: 1234567890
}
```

#### 2.1.2 需要存储的常量列表

| 常量键名 | 类型 | 值 | 描述 |
|---------|------|-----|------|
| `ROLE_OPTIONS` | role | ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'] | 角色选项 |
| `POSITION_OPTIONS` | position | ['无', '会计主管', '会计', '招待员', '厨师'] | 岗位选项 |
| `DEPARTMENT_OPTIONS` | department | ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办'] | 部门选项 |
| `GENDER_OPTIONS` | gender | ['男', '女'] | 性别选项 |
| `ROLE_POSITION_MAP` | role | {'工勤': ['会计', '招待员', '厨师'], '配偶': ['无']} | 角色-岗位映射 |
| `REQUEST_STATUS` | request_status | {PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', TERMINATED: 'terminated'} | 请求状态 |
| `TASK_STATUS` | workflow | {PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled', RETURNED: 'returned'} | 任务状态 |
| `ORDER_STATUS` | workflow | {PENDING: 'pending', SUPPLEMENT: 'supplement', COMPLETED: 'completed', REJECTED: 'rejected', CANCELLED: 'cancelled', TERMINATED: 'terminated'} | 工单状态 |
| `TIMEZONE_OFFSET` | timezone | -3 | 时区偏移量（小时） |
| `TIMEZONE_NAME` | timezone | 'America/Sao_Paulo' | 时区名称 |
| `DEFAULT_ROLE` | role | '馆员' | 默认角色 |
| `DEFAULT_POSITION` | position | '无' | 默认岗位 |
| `DEFAULT_DEPARTMENT` | department | '' | 默认部门 |

#### 2.1.3 初始化脚本

创建云函数 `initSystemConfig` 用于初始化系统配置：

```javascript
// cloudfunctions/initSystemConfig/index.js
const SYSTEM_CONFIGS = [
  {
    type: 'role',
    key: 'ROLE_OPTIONS',
    value: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    description: '角色选项列表',
    sort: 1
  },
  // ... 其他配置
]
```

---

### 2.2 兼容性代码删除清单

#### 2.2.1 officeAuth 云函数
- [ ] 删除 `requestCollection` 引用（第10行）
- [ ] 删除 `findRequestByOpenId` 函数
- [ ] 删除 `formatRequestRecord` 函数
- [ ] 删除第340-379行的旧申请表查询和迁移代码
- [ ] 删除第250-259行的更新旧申请表代码
- [ ] 删除第470-489行的更新旧申请表代码
- [ ] 删除 `sourceOrderId`、`sourceRequestId` 字段

#### 2.2.2 workflowEngine 云函数
- [ ] 删除第1136行的 `sourceOrderId` 字段
- [ ] 删除第1533-1534行的参数兼容代码（`approveAction` vs `action`）

#### 2.2.3 前端代码
- [ ] `menu-detail.js` 第108-115行：删除字段名兼容
- [ ] `home.js` 第237-243行：保留权限检查失败降级（这是必要的）

#### 2.2.4 其他
- [ ] 删除 `office_registration_requests` 集合引用
- [ ] 清理 `COLLECTION_FIX_SUMMARY.md` 中相关的文档

---

### 2.3 工具函数重构方案

#### 2.3.1 创建共享工具模块

**方案**: 创建 `cloudfunctions/shared` 目录，存放前后端共享代码

```
cloudfunctions/
  shared/
    constants.js       # 常量定义（从数据库加载）
    utils/
      time.js          # 时间处理工具
      common.js        # 通用工具函数
    index.js           # 导出入口
```

#### 2.3.2 时间处理重构

**后端**:
- 所有时间存储为 GMT 时间戳（毫秒）
- 使用 `Date.now()` 获取当前 GMT 时间
- 不进行时区转换

**前端**:
```javascript
// common/utils/time.js

/**
 * 获取用户时区偏移量
 * @returns {number} 时区偏移量（小时）
 */
async function getTimezoneOffset() {
  // 优先从系统配置获取
  const config = await getSystemConfig('timezone')
  if (config && config.value !== undefined) {
    return config.value
  }
  // 备用：从用户系统获取
  return -new Date().getTimezoneOffset() / 60
}

/**
 * 将 GMT 时间戳转换为本地时间
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时）
 * @returns {Date} 本地时间 Date 对象
 */
function toLocalTime(timestamp, offset) {
  const date = new Date(timestamp)
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000)
  return new Date(utcTime + (offset * 3600000))
}

/**
 * 格式化日期时间
 * @param {number} timestamp - GMT 时间戳（毫秒）
 * @param {number} offset - 时区偏移量（小时）
 * @returns {string} 格式化后的日期时间字符串
 */
function formatDateTime(timestamp, offset) {
  if (!timestamp) return ''
  const date = toLocalTime(timestamp, offset)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}
```

#### 2.3.3 合并重复函数

**需要合并的函数**:

| 函数名 | 位置 | 保留位置 |
|-------|------|---------|
| `normalizeBoolean` | commonUtils/utils.js, officeAuth/utils.js, common/utils.js | common/utils.js |
| `generateRequestNo` | commonUtils/utils.js, officeAuth/utils.js | common/utils.js |
| `getAvatarColor` | common/utils.js | common/utils.js |
| `getTodayDate` | common/utils.js, util/util.js | common/utils.js |
| `formatDateTime` | common/utils.js, util/util.js | common/utils.js（统一版本） |
| `formatRelativeTime` | common/utils.js, util/util.js | common/utils.js（统一版本） |

**删除文件**:
- `cloudfunctions/officeAuth/utils.js`（使用 commonUtils）
- `miniprogram/util/util.js` 中的时间处理函数（使用 common/utils.js）

---

### 2.4 硬编码修复清单

#### 2.4.1 前端硬编码

**edit-profile.js**:
- 第63行: `role === '部门负责人' || role === '馆员' || role === '工勤'`
- 第154行: `role === '部门负责人' || role === '馆员' || role === '工勤'`
- 第253行: `form.role === '部门负责人' || form.role === '馆员' || form.role === '工勤'`
- **修复方案**: 从数据库获取 `NEED_DEPARTMENT_ROLES` 常量

**approval.js**:
- 第48行: `['', '部门负责人', '会计主管', '馆领导']`
- 第146行: `stepRoles = ['', '部门负责人', '会计主管', '馆领导']`
- 第165行: `stepRoles = ['', '部门负责人', '会计主管', '馆领导']`
- **修复方案**: 从数据库获取工作流步骤角色配置

**register.js**:
- 第65行: `role === '部门负责人' || role === '馆员' || role === '工勤'`
- 第173行: `role === '部门负责人' || role === '馆员' || role === '工勤'`
- 第276行: `form.role === '部门负责人' || form.role === '馆员' || form.role === '工勤'`
- **修复方案**: 从数据库获取 `NEED_DEPARTMENT_ROLES` 常量

#### 2.4.2 后端硬编码

**officeAuth/index.js**:
- 第15-22行: 内联常量定义
- **修复方案**: 使用缓存机制从数据库获取

**workflowEngine/index.js**:
- 第18-54行: 内联常量定义
- **修复方案**: 使用缓存机制从数据库获取

---

## 三、实施步骤

### 阶段一：常量管理重构（预计 2 小时）

1. 创建 `initSystemConfig` 云函数
2. 执行初始化，将所有常量写入 `sys_config` 集合
3. 创建后端常量获取模块（带缓存）
4. 修改所有云函数使用新的常量获取机制
5. 测试云函数

### 阶段二：删除兼容性代码（预计 1 小时）

1. 备份现有代码
2. 按清单删除所有兼容性代码
3. 测试核心功能

### 阶段三：工具函数重构（预计 1.5 小时）

1. 创建 `shared` 共享模块
2. 整合时间处理函数
3. 删除重复代码
4. 更新所有引用

### 阶段四：修复硬编码（预计 1.5 小时）

1. 前端页面获取常量
2. 替换所有硬编码
3. 测试前端功能

### 阶段五：测试验证（预计 1 小时）

1. 单元测试
2. 集成测试
3. 用户验收测试

---

## 四、风险评估

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 删除兼容性代码导致历史数据丢失 | 高 | 先备份，再迁移，最后删除 |
| 常量获取失败导致功能异常 | 中 | 实现降级方案，使用默认值 |
| 时间处理修改导致显示错误 | 中 | 充分测试，保留旧函数一段时间 |
| 前端缓存导致常量不更新 | 低 | 添加版本号机制 |

---

## 五、后续优化建议

1. **配置管理界面**: 创建管理后台，支持动态修改常量
2. **常量版本控制**: 添加版本号，支持回滚
3. **监控告警**: 监控常量获取失败率
4. **文档完善**: 更新 API 文档和开发指南

---

**创建时间**: 2026-03-17
**预计完成时间**: 2026-03-17
**负责人**: AI Assistant
