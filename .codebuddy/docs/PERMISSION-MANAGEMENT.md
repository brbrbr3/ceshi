# 统一权限管理系统

## 概述

本项目已实现统一的权限管理系统，使用 `permissions` 云数据库集合和 `permissionManager` 云函数来管理各功能的访问权限。

## 核心功能

### 1. 权限检查
- **单个功能权限检查**：检查用户是否有权限访问指定功能
- **批量权限检查**：一次检查多个功能的权限

### 2. 权限配置
- **初始化权限**：创建默认的权限配置
- **更新权限**：修改功能的访问权限规则
- **查看权限**：获取所有权限配置列表

## 数据库集合

### permissions 集合

存储各功能的权限配置，结构如下：

```javascript
{
  _id: string,                    // 权限ID（自动生成）
  featureKey: string,            // 功能标识（唯一），如 'medical_application'
  featureName: string,           // 功能名称，如 '就医申请'
  description: string,           // 功能描述
  enabledRoles: string[],        // 允许访问的角色列表，如 ['馆领导', '部门负责人', '馆员']
  requireAdmin: boolean,         // 是否需要管理员权限
  createdAt: number,             // 创建时间戳
  updatedAt: number              // 更新时间戳
}
```

## 云函数 API

### permissionManager 云函数

#### 1. 初始化权限配置

**功能**：创建默认的权限配置

**权限**：仅管理员可调用

```javascript
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'initPermissions'
  }
})
```

**返回示例**：
```javascript
{
  code: 0,
  message: '权限初始化完成',
  data: {
    results: [
      { action: 'created', featureKey: 'medical_application' },
      { action: 'updated', featureKey: 'weekly_menu' }
    ],
    count: 4
  }
}
```

#### 2. 检查单个功能权限

**功能**：检查当前用户是否有权限访问指定功能

```javascript
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'checkPermission',
    featureKey: 'medical_application'
  }
})
```

**返回示例**：
```javascript
// 有权限
{
  code: 0,
  message: 'ok',
  data: {
    allowed: true,
    user: {
      openid: 'xxx',
      name: '张三',
      role: '馆员',
      isAdmin: false
    },
    feature: {
      featureKey: 'medical_application',
      featureName: '就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤']
    }
  }
}

// 无权限
{
  code: 403,
  message: '只有馆员才能访问就医申请',
  data: {
    allowed: false,
    user: {
      openid: 'xxx',
      name: '李四',
      role: '物业',
      isAdmin: false
    },
    feature: {
      featureKey: 'medical_application',
      featureName: '就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤'],
      message: '只有馆领导、部门负责人、馆员、工勤才能访问就医申请'
    }
  }
}
```

#### 3. 批量检查权限

**功能**：一次检查多个功能的权限

```javascript
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'batchCheckPermissions',
    featureKeys: ['medical_application', 'weekly_menu', 'user_management']
  }
})
```

**返回示例**：
```javascript
{
  code: 0,
  message: 'ok',
  data: {
    user: {
      openid: 'xxx',
      name: '张三',
      role: '馆员',
      isAdmin: false
    },
    permissions: {
      medical_application: {
        allowed: true,
        featureKey: 'medical_application',
        featureName: '就医申请',
        enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤']
      },
      weekly_menu: {
        allowed: true,
        featureKey: 'weekly_menu',
        featureName: '每周菜单',
        enabledRoles: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
      },
      user_management: {
        allowed: false,
        featureKey: 'user_management',
        featureName: '用户管理',
        message: '只有管理员才能访问用户管理'
      }
    }
  }
}
```

#### 4. 获取所有权限配置

**功能**：获取系统中所有权限配置

```javascript
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'listPermissions'
  }
})
```

#### 5. 更新权限配置

**功能**：修改指定功能的权限配置

**权限**：仅管理员可调用

```javascript
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'updatePermission',
    featureKey: 'medical_application',
    config: {
      featureName: '就医申请',
      description: '提交就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员'],
      requireAdmin: false
    }
  }
})
```

## 小程序端使用

### app.js 中的封装方法

在 `app.js` 中已封装了以下方法，可在任意页面中直接调用：

```javascript
const app = getApp()

// 检查单个功能权限
app.checkPermission('medical_application')
  .then(hasPermission => {
    console.log('是否有权限:', hasPermission)
  })

// 获取权限详细信息
app.getPermissionInfo('medical_application')
  .then(permInfo => {
    console.log('权限信息:', permInfo)
  })

// 批量检查权限
app.batchCheckPermissions(['medical_application', 'weekly_menu'])
  .then(result => {
    console.log('批量权限检查结果:', result)
  })

// 初始化权限配置（仅管理员）
app.initPermissions()
  .then(result => {
    console.log('初始化结果:', result)
  })

// 获取所有权限配置（仅管理员）
app.listPermissions()
  .then(result => {
    console.log('权限配置列表:', result)
  })

// 更新权限配置（仅管理员）
app.updatePermission('medical_application', {
  featureName: '就医申请',
  enabledRoles: ['馆领导', '部门负责人', '馆员']
})
  .then(result => {
    console.log('更新结果:', result)
  })
```

### 使用示例：首页就医申请权限检查

在 `miniprogram/pages/office/home/home.js` 中：

```javascript
handleQuickAction(e) {
  const label = e.currentTarget.dataset.label
  if (label === '就医申请') {
    // 使用统一的权限检查
    app.checkPermission('medical_application')
      .then((hasPermission) => {
        if (hasPermission) {
          wx.navigateTo({
            url: '/pages/office/medical-application/medical-application'
          })
        } else {
          // 获取详细的权限信息并提示
          app.getPermissionInfo('medical_application')
            .then((permInfo) => {
              const message = permInfo.feature ? permInfo.feature.message : '您没有权限使用此功能'
              wx.showModal({
                title: '权限提示',
                content: message,
                showCancel: false,
                confirmText: '我知道了'
              })
            })
        }
      })
  }
}
```

## 默认权限配置

系统已预定义以下权限配置：

| 功能标识 | 功能名称 | 允许角色 | 需要管理员 |
|---------|---------|---------|-----------|
| medical_application | 就医申请 | 馆领导、部门负责人、馆员、工勤 | 否 |
| weekly_menu | 每周菜单 | 馆领导、部门负责人、馆员、工勤、物业、配偶、家属 | 否 |
| user_management | 用户管理 | 馆领导、部门负责人 | 是 |
| approval_management | 审批管理 | 馆领导、部门负责人 | 否 |

## 初始化步骤

### 首次使用步骤

1. **部署云函数**：`permissionManager` 云函数已部署完成

2. **初始化权限配置**：需要管理员首次调用

   在控制台或开发者工具中执行：

   ```javascript
   wx.cloud.callFunction({
     name: 'permissionManager',
     data: {
       action: 'initPermissions'
     }
   }).then(res => {
     console.log('权限初始化完成:', res.result.data)
   })
   ```

3. **验证权限配置**：在云开发控制台查看 `permissions` 集合，确认权限配置已创建

## 数据库安全规则

`permissions` 集合的安全规则配置为 **ADMINWRITE**：
- 所有人可读
- 仅管理员可写（通过云函数操作）

这确保了：
- 用户可以查看权限配置（透明化）
- 只有管理员才能修改权限配置
- 所有权限修改都必须通过云函数进行

## 优势

### 1. 集中化管理
- 所有权限配置存储在 `permissions` 集合中
- 统一的管理入口，便于维护

### 2. 灵活的权限规则
- 支持基于角色的权限控制
- 支持管理员权限要求
- 易于扩展新的权限规则

### 3. 安全可靠
- 权限检查在云端进行，无法绕过
- 数据库安全规则保护权限配置
- 详细的审计日志

### 4. 易于使用
- 封装了便捷的 API
- 支持单个和批量权限检查
- 清晰的错误提示

## 注意事项

1. **首次初始化**：必须由管理员调用 `initPermissions` 初始化权限配置
2. **向后兼容**：如果功能未配置权限，默认允许访问（向后兼容已有代码）
3. **权限检查**：建议在页面 `onLoad` 时进行权限检查，无权限时及时提示
4. **权限更新**：权限配置修改后，下次访问时立即生效

## 扩展指南

### 添加新功能的权限

1. 在权限配置中添加新功能：

   ```javascript
   wx.cloud.callFunction({
     name: 'permissionManager',
     data: {
       action: 'updatePermission',
       featureKey: 'new_feature',
       config: {
         featureName: '新功能',
         description: '功能描述',
         enabledRoles: ['馆员'],
         requireAdmin: false
       }
     }
   })
   ```

2. 在页面中使用权限检查：

   ```javascript
   app.checkPermission('new_feature')
     .then(hasPermission => {
       if (hasPermission) {
         // 允许访问
       } else {
         // 提示无权限
       }
     })
   ```

## 故障排查

### 问题：权限检查失败

**可能原因**：
1. 云函数未部署成功
2. 权限配置未初始化
3. 用户未登录

**解决方案**：
1. 检查云函数部署状态
2. 调用 `initPermissions` 初始化权限配置
3. 确保用户已登录

### 问题：权限配置无效

**可能原因**：
1. 数据库安全规则未生效（需要等待 2-5 分钟）
2. 权限配置数据错误

**解决方案**：
1. 等待安全规则生效
2. 在云开发控制台检查 `permissions` 集合数据

## 控制台管理

### 权限配置管理

您可以在云开发控制台中查看和编辑权限配置：

- **控制台地址**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/permissions
- **操作**：查看、编辑权限配置数据

### 安全规则管理

查看和修改数据库安全规则：

- **控制台地址**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/permissions
- **当前规则**：ADMINWRITE（所有人可读，仅管理员可写）

## 总结

统一权限管理系统提供了：
- ✅ 集中化的权限配置管理
- ✅ 灵活的权限规则定义
- ✅ 安全可靠的权限检查
- ✅ 易于使用的 API 封装
- ✅ 完整的错误提示和处理

通过这个系统，您可以轻松管理小程序中各功能的访问权限，确保只有有权限的用户才能访问相应功能。
