export default {
  "settings": {
    "title": "系统设置",
    "description": "管理系统配置和管理员账户信息",
    "uploadSettings": {
      "title": "上传限制设置",
      "description": "配置文件上传的大小限制和WebDAV上传模式",
      "maxUploadSizeLabel": "最大上传文件大小",
      "maxUploadSizePlaceholder": "输入数字",
      "maxUploadSizeHint": "设置单个文件的最大上传大小限制",
      "unitKB": "KB",
      "unitMB": "MB",
      "unitGB": "GB",
      "footerHint": "修改后将立即生效，影响所有用户的文件上传"
    },
    "webdavSettings": {
      "uploadModeLabel": "WebDAV上传模式",
      "uploadModeHint": "选择WebDAV客户端的上传处理方式",
      "modes": {
        "auto": "自动模式（推荐）",
        "proxy": "预签名上传",
        "multipart": "分片上传",
        "direct": "直接上传"
      }
    },
    "adminSettings": {
      "title": "管理员信息修改",
      "description": "修改管理员用户名和密码",
      "newUsernameLabel": "新用户名",
      "newUsernamePlaceholder": "输入新的用户名",
      "newUsernameHint": "留空则不修改用户名",
      "currentPasswordLabel": "当前密码",
      "currentPasswordPlaceholder": "输入当前密码",
      "currentPasswordHint": "验证身份需要输入当前密码",
      "newPasswordLabel": "新密码",
      "newPasswordPlaceholder": "输入新密码",
      "newPasswordHint": "留空则不修改密码",
      "footerHint": "修改后将自动退出登录，需要重新登录"
    },
    "status": {
      "success": "设置更新成功",
      "processing": "处理中...",
      "updateSettings": "更新设置",
      "updateAccount": "更新账户",
      "adminUpdateSuccess": "管理员信息更新成功，即将自动退出登录",
      "errors": {
        "maxUploadSizeError": "最大上传大小必须大于0",
        "updateSettingsError": "更新系统设置失败",
        "currentPasswordRequired": "请输入当前密码",
        "newFieldRequired": "请至少填写新用户名或新密码中的一项",
        "passwordSame": "新密码不能与当前密码相同",
        "updateInfoError": "更新管理员信息失败"
      }
    }
  }
};