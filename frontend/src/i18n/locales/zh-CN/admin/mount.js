export default {
  "mount": {
    "title": "挂载管理",
    "accessibleMounts": "可访问的挂载点",
    "createMount": "新建挂载点",
    "editMount": "编辑挂载点",
    "refresh": "刷新",
    "refreshing": "刷新中...",
    "search": "搜索挂载点...",
    "status": {
      "active": "启用",
      "inactive": "禁用",
      "enabled": "已启用",
      "disabled": "已禁用"
    },
    "info": {
      "name": "挂载点名称",
      "path": "挂载路径",
      "storageType": "存储类型",
      "storageConfig": "存储配置",
      "remark": "备注",
      "sortOrder": "排序",
      "cacheTtl": "缓存时间",
      "createdBy": "创建者",
      "createdAt": "创建时间",
      "updatedAt": "更新时间",
      "lastRefresh": "最后刷新"
    },
    "form": {
      "name": "挂载点名称",
      "namePlaceholder": "请输入挂载点名称",
      "nameHint": "用于标识挂载点的名称",
      "storageType": "存储类型",
      "storageTypeHint": "选择存储后端类型",
      "storageConfig": "存储配置",
      "storageConfigPlaceholder": "请选择存储配置",
      "storageConfigHint": "选择要使用的S3存储配置",
      "mountPath": "挂载路径",
      "mountPathPlaceholder": "例如：/documents 或 /images",
      "mountPathHint": "在存储中的路径，必须以/开头且后面跟具体路径，如：/documents、/images 等",
      "remark": "备注",
      "remarkPlaceholder": "请输入备注信息",
      "remarkHint": "可选的描述信息",
      "sortOrder": "排序",
      "sortOrderHint": "数字越小排序越靠前",
      "cacheTtl": "缓存时间(秒)",
      "cacheTtlHint": "文件列表缓存时间，0表示不缓存",
      "isActive": "启用状态",
      "isActiveHint": "是否启用此挂载点",
      "s3Config": "S3存储配置",
      "selectS3Config": "请选择S3存储配置",
      "noS3Config": "暂无可用的S3存储配置",
      "storageTypes": {
        "s3": "S3存储"
      },
      "cacheTtlPlaceholder": "默认300秒",
      "sortOrderPlaceholder": "0",
      "save": "保存",
      "saving": "保存中...",
      "cancel": "取消",
      "create": "创建",
      "creating": "创建中...",
      "update": "更新",
      "updating": "更新中..."
    },
    "actions": {
      "edit": "编辑",
      "delete": "删除",
      "enable": "启用",
      "disable": "禁用",
      "view": "查看",
      "browse": "浏览"
    },
    "confirmDelete": {
      "title": "确认删除",
      "message": "确定要删除挂载点 \"{name}\" 吗？此操作不可撤销。",
      "confirm": "删除",
      "cancel": "取消"
    },
    "success": {
      "created": "挂载点创建成功",
      "updated": "挂载点更新成功",
      "deleted": "挂载点删除成功",
      "enabled": "挂载点启用成功",
      "disabled": "挂载点禁用成功",
      "refreshed": "数据刷新成功"
    },
    "error": {
      "loadFailed": "加载挂载点列表失败",
      "createFailed": "创建挂载点失败",
      "updateFailed": "更新挂载点失败",
      "deleteFailed": "删除挂载点失败",
      "enableFailed": "启用挂载点失败",
      "disableFailed": "禁用挂载点失败",
      "loadS3ConfigsFailed": "加载S3配置失败",
      "loadApiKeysFailed": "加载API密钥列表失败",
      "noPermission": "没有权限执行此操作",
      "apiKeyNoPermission": "API密钥用户无权限修改挂载点状态",
      "apiKeyCannotDelete": "API密钥用户无权限删除挂载点",
      "apiKeyCannotCreate": "API密钥用户无权限创建挂载点",
      "apiKeyCannotManage": "API密钥用户无权限管理挂载点",
      "saveFailed": "保存失败"
    },
    "validation": {
      "nameRequired": "挂载点名称不能为空",
      "nameLength": "挂载点名称长度必须在1-50个字符之间",
      "storageTypeRequired": "请选择存储类型",
      "s3ConfigRequired": "请选择S3配置",
      "mountPathRequired": "挂载路径不能为空",
      "mountPathFormat": "挂载路径必须以/开头",
      "mountPathInvalid": "挂载路径格式不正确，必须是/xxx格式，只能包含字母、数字、下划线、连字符、中文和斜杠",
      "mountPathSystemReserved": "不能使用系统保留路径",
      "cacheTTLInteger": "缓存时间必须是整数",
      "cacheTTLNonNegative": "缓存时间不能为负数",
      "cacheTTLTooLarge": "缓存时间不能超过86400秒（24小时）",
      "sortOrderInteger": "排序顺序必须是整数"
    },
    "empty": {
      "title": "暂无挂载点",
      "description": "还没有创建任何挂载点",
      "createFirst": "创建第一个挂载点"
    },
    "searchResults": {
      "noResults": "没有找到匹配的挂载点",
      "found": "找到 {count} 个挂载点",
      "clearSearch": "清除搜索",
      "tryDifferentTerms": "尝试使用不同的搜索条件"
    },
    "creators": {
      "system": "系统",
      "admin": "管理员",
      "apiKey": "密钥"
    },
    "currentApiKey": "当前密钥",
    "unknownCreator": "未知创建者",
    "noRemark": "无备注",
    "unlimited": "无限制",
    "seconds": "秒"
  }
};