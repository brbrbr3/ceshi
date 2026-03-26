---
name: 缓存架构重构：废弃constants.js+权限缓存迁移
overview: 将常量和权限缓存统一到app.js，废弃constants.js模块，保留降级方案，login页面加载时预加载常量
todos:
  - id: extend-app-js
    content: 在 app.js 添加 getDefaultConstants、getConstant、getConstantSync、getAllConstants 和权限缓存方法
    status: completed
  - id: modify-utils-js
    content: 修改 utils.js 改用 app.getConstantSync
    status: completed
    dependencies:
      - extend-app-js
  - id: modify-login-js
    content: 修改 login.js 在 onShow 时预加载常量
    status: completed
    dependencies:
      - extend-app-js
  - id: modify-home-js
    content: 修改 home.js 权限缓存改用 app.js 方法
    status: completed
    dependencies:
      - extend-app-js
  - id: modify-other-pages
    content: 修改其他 7 个页面的 constants 引用
    status: completed
    dependencies:
      - extend-app-js
  - id: delete-constants-js
    content: 删除 constants.js 文件
    status: completed
    dependencies:
      - modify-utils-js
      - modify-other-pages
---

## 需求概述

重构常量和权限缓存架构，统一使用 app.js 作为唯一入口。

## 核心功能

1. **废弃 constants.js 模块**：将所有常量加载逻辑迁移到 app.js，删除 constants.js
2. **保留降级方案**：将 getDefaultConstants() 迁移到 app.js
3. **权限缓存统一**：将 home.js 中的权限缓存逻辑迁移到 app.js
4. **预加载时机调整**：在 login 页面 onShow 时预加载常量（非 handleWxLogin 成功后）

## 预期效果

- app.js 成为常量和权限缓存的唯一管理入口
- 程序中统一使用 app.getConstant()/app.getAllConstants() 获取常量
- 权限检查统一使用 app.getPermissionCache()/app.loadPermissionCache()
- 登录页面加载时自动预加载常量
- 云函数失败时使用默认常量降级

## 受影响文件

| 文件 | 操作 |
| --- | --- |
| app.js | [MODIFY] 添加 getDefaultConstants、getConstant、getConstantSync、权限缓存方法 |
| constants.js | [DELETE] 废弃整个文件 |
| utils.js | [MODIFY] 改用 app.getConstantSync() |
| login.js | [MODIFY] onShow 时预加载常量 |
| home.js | [MODIFY] 权限缓存改用 app.js 方法 |
| 其他 7 个引用 constants.js 的页面 | [MODIFY] 改用 app.getConstant/app.getAllConstants |


## 技术方案

### 实现策略

1. **app.js 扩展**：

- 添加 `getDefaultConstants()` 函数（从 constants.js 迁移）
- 添加 `getConstant(key)` 异步方法
- 添加 `getConstantSync(key)` 同步方法（优先缓存，降级用默认值）
- 添加 `getAllConstants()` 异步方法
- 添加权限缓存相关常量和方法

2. **降级方案**：

- `getConstantSync()` 在缓存不存在时返回默认值
- `loadConstants()` 云函数失败时返回默认值并缓存

3. **权限缓存迁移**：

- 将 PERMISSION_CACHE_KEY、PERMISSION_CACHE_EXPIRE 移到 app.js
- 添加 `getPermissionCache()` 同步获取
- 添加 `loadPermissionCache(featureKeys)` 批量加载并缓存

### 数据结构

```javascript
// app.js 新增
const PERMISSION_CACHE_KEY = 'app-permission-cache'
const PERMISSION_CACHE_EXPIRE = 30 * 60 * 1000 // 30分钟

globalData: {
  // ... 现有字段
  constantsCache: null,      // 已有
  permissionCache: null      // 新增
}
```

### 目录结构

```
miniprogram/
├── app.js                          # [MODIFY] 添加常量/权限完整方法 + 降级方案
├── common/
│   ├── constants.js                # [DELETE] 废弃
│   └── utils.js                    # [MODIFY] 改用 app.getConstantSync
├── pages/auth/login/
│   └── login.js                    # [MODIFY] onShow 预加载常量
├── pages/office/home/
│   └── home.js                     # [MODIFY] 权限缓存改用 app 方法
├── pages/office/trip-report/
│   └── trip-report.js              # [MODIFY] 改用 app.getAllConstants
├── pages/office/trip-dashboard/
│   └── trip-dashboard.js           # [MODIFY] 改用 app.getAllConstants
├── pages/office/profile/edit-profile/
│   └── edit-profile.js             # [MODIFY] 改用 app.getAllConstants
├── pages/office/approval/
│   └── approval.js                 # [MODIFY] 改用 app.getAllConstants
├── pages/office/notifications/
│   └── notifications.js            # [MODIFY] 改用 app.getAllConstants
├── pages/auth/register/
│   └── register.js                 # [MODIFY] 改用 app.getAllConstants
└── pages/office/medical-application/
    └── medical-application.js      # [MODIFY] 改用 app.getAllConstants
```