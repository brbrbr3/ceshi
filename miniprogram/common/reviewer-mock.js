/**
 * 审核员 Mock 数据模块
 *
 * 审核模式下拦截所有云函数调用，返回 mock 空数据。
 * 审核员可以浏览所有页面但看不到真实数据。
 *
 * 导出：
 *   - mockReviewerProfile: mock 用户信息
 *   - getMockResponse(name, data): 根据云函数名和参数返回 mock 数据
 */

// 审核员 mock 用户信息
const mockReviewerProfile = {
  _id: 'reviewer_mock',
  openid: '__reviewer__',
  name: '888',
  role: '职工',
  position: '',
  isAdmin: true,
  isReviewer: true,
  status: 'approved',
  department: '',
  phone: '',
  avatar: '',
  userStatus: 'online',
  createdAt: Date.now(),
  updatedAt: Date.now()
}

// 列表类 action（返回空列表）
var LIST_ACTIONS = [
  'list', 'getPosts', 'getMyList', 'getAllList', 'getMyTasks',
  'getNotifications', 'getContacts', 'getAnnouncements', 'getArticles',
  'getSchedules', 'getMenuList', 'getApplications', 'getApprovals'
]

// 列表类云函数（无 action 或 action 为列表查询时返回空列表）
var LIST_FUNCTIONS = [
  'activityManager', 'articleManager', 'announcementManager',
  'carPurchase', 'feedbackManager', 'workflowEngine',
  'notificationManager', 'contactsManager', 'scheduleManager',
  'menuManager', 'mealManagement'
]

// 详情类 action（返回空对象）
var DETAIL_ACTIONS = ['get', 'getDetail', 'getOrderDetail', 'getActivity']

// 写入类 action（返回空对象表示成功）
var WRITE_ACTIONS = [
  'create', 'update', 'delete', 'submit', 'approve', 'reject',
  'cancel', 'revoke', 'pin', 'register', 'cancelRegistration',
  'createPost', 'createReply', 'toggleStep', 'updateStepRemark',
  'uploadAttachments', 'deleteRecord', 'terminateRecord',
  'createPurchaseApplication', 'createPurchaseLoan',
  'submitRegistration', 'submitProfileUpdate', 'submitDetailInfo',
  'updateUserStatus', 'markAsRead', 'clearAll', 'broadcast',
  'createAnnouncement', 'createArticle', 'createActivity',
  'edit', 'end'
]

/**
 * 判断是否为列表查询
 */
function isListQuery(name, action) {
  if (!action && LIST_FUNCTIONS.indexOf(name) >= 0) {
    return true
  }
  if (action && LIST_ACTIONS.indexOf(action) >= 0) {
    return true
  }
  return false
}

/**
 * 根据云函数名和参数生成 mock 响应数据
 * @param {string} name - 云函数名
 * @param {Object} data - 调用参数（包含 action 等）
 * @returns {Object} mock 数据（对应云函数返回的 result.data）
 */
function getMockResponse(name, data) {
  data = data || {}
  var action = data.action

  // ===== officeAuth =====
  if (name === 'officeAuth') {
    switch (action) {
      case 'checkRegistration':
        return {
          registered: true,
          openid: '__reviewer__',
          user: mockReviewerProfile,
          profileNotModified: false,
          updatedAt: Date.now(),
          request: null
        }
      case 'getUserProfile':
        return mockReviewerProfile
      case 'getContacts':
      case 'getContactList':
        return { list: [], total: 0 }
      case 'getAnnouncements':
        return { list: [], total: 0, hasMore: false }
      case 'getSchedules':
        return { list: [], total: 0 }
      case 'getArticles':
        return { list: [], total: 0, hasMore: false }
      case 'getMenuList':
      case 'getMeals':
        return { list: [], total: 0, hasMore: false }
      case 'getMealBookings':
      case 'getSideDishBookings':
        return { list: [], total: 0, hasMore: false }
      case 'getTripReports':
        return { list: [], total: 0, hasMore: false }
      case 'getApprovalData':
      case 'getApprovals':
        return { list: [], total: 0, hasMore: false }
      case 'getApplications':
        return { list: [], total: 0, hasMore: false }
      case 'getNotifications':
        return { list: [], total: 0, hasMore: false }
      case 'getStatistics':
      case 'getDashboard':
        return { total: 0, pending: 0, approved: 0, rejected: 0 }
      default:
        // 其他 officeAuth action（写入类等）
        return {}
    }
  }

  // ===== permissionManager =====
  if (name === 'permissionManager') {
    switch (action) {
      case 'checkPermission':
        return { allowed: true }
      case 'batchCheckPermissions': {
        var keys = data.featureKeys || []
        var permissions = {}
        keys.forEach(function(key) {
          permissions[key] = { allowed: true }
        })
        return { permissions: permissions }
      }
      case 'listPermissions':
        return { permissions: [] }
      case 'updatePermission':
        return {}
      default:
        return {}
    }
  }

  // ===== getSystemConfig / initSystemConfig =====
  if (name === 'getSystemConfig') {
    // 审核员 mock：返回空 form 常量（按 type 分组，与真实 getSystemConfig 返回结构一致）
    return {
      form: {
        FORM_TAG_LIST: [],
        FORM_BLOCK_TYPE_LIST: [],
        FORM_TAG_BLOCKS: {},
        FORM_FILLABLE_TYPES: []
      }
    }
  }
  if (name === 'initSystemConfig') {
    return { initialized: true }
  }

  // ===== notificationManager =====
  if (name === 'notificationManager') {
    switch (action) {
      case 'markAsRead':
      case 'clearAll':
        return { success: true }
      default:
        return {}
    }
  }

  // ===== bootstrapAdmin =====
  if (name === 'bootstrapAdmin') {
    if (action === 'getStatus') {
      return {
        bootstrapKeyConfigured: false,
        hasApprovedAdmin: true,
        canBootstrap: false,
        currentUser: null
      }
    }
    return {}
  }

  // ===== wxContext =====
  if (name === 'wxContext') {
    return { openid: '__reviewer__' }
  }

  // ===== generateOrderPdf =====
  if (name === 'generateOrderPdf') {
    return { fileUrl: '', fileName: '' }
  }

  // ===== contentFormManager（信息发布系统）=====
  if (name === 'contentFormManager') {
    switch (action) {
      case 'list':
        return { list: [], total: 0, hasMore: false }
      case 'get':
        return { form: null, mySubmission: null, quizResult: null, isCreator: false, canPublish: false, canSubmit: false }
      case 'getQuizCompare':
        return { form: null, blocks: [], lastSubmission: null, score: { totalScore: 0, details: [] } }
      case 'listSubmissions':
        return { form: null, list: [], total: 0 }
      case 'getStats':
        return { title: '', tag: '', total: 0, blocks: [], submissions: [] }
      default:
        return {}
    }
  }

  // ===== haircutManager（理发预约）=====
  if (name === 'haircutManager') {
    switch (action) {
      case 'getReservationSlots':
        return { slotsByDate: {} }
      case 'getAppointments':
      case 'getMyAppointments':
        return { list: [], total: 0, hasMore: false }
      default:
        return {}
    }
  }

  // ===== dbManager（审核员不应操作）=====
  if (name === 'dbManager') {
    if (action === 'listCollections') {
      return { collections: [], total: 0 }
    }
    return {}
  }

  // ===== 通用列表查询 =====
  if (isListQuery(name, action)) {
    return { list: [], total: 0, hasMore: false }
  }

  // ===== 通用详情查询 =====
  if (action && DETAIL_ACTIONS.indexOf(action) >= 0) {
    return {}
  }

  // ===== 通用写入操作 =====
  if (action && WRITE_ACTIONS.indexOf(action) >= 0) {
    return {}
  }

  // ===== 通用兜底 =====
  return {}
}

module.exports = {
  mockReviewerProfile: mockReviewerProfile,
  getMockResponse: getMockResponse
}
