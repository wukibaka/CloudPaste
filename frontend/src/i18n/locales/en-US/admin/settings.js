export default {
  "settings": {
    "title": "System Settings",
    "description": "Manage system configuration and administrator account information",
    "uploadSettings": {
      "title": "Upload Limit Settings",
      "description": "Configure file upload size limits and WebDAV upload mode",
      "maxUploadSizeLabel": "Maximum Upload File Size",
      "maxUploadSizePlaceholder": "Enter number",
      "maxUploadSizeHint": "Set the maximum upload size limit for individual files",
      "unitKB": "KB",
      "unitMB": "MB",
      "unitGB": "GB",
      "footerHint": "Changes will take effect immediately and affect all users' file uploads"
    },
    "webdavSettings": {
      "uploadModeLabel": "WebDAV Upload Mode",
      "uploadModeHint": "Select the upload handling method for WebDAV clients",
      "modes": {
        "auto": "Auto Mode (Recommended)",
        "proxy": "Presigned Upload",
        "multipart": "Multipart Upload",
        "direct": "Direct Upload"
      }
    },
    "adminSettings": {
      "title": "Administrator Information Modification",
      "description": "Modify administrator username and password",
      "newUsernameLabel": "New Username",
      "newUsernamePlaceholder": "Enter new username",
      "newUsernameHint": "Leave blank to keep current username",
      "currentPasswordLabel": "Current Password",
      "currentPasswordPlaceholder": "Enter current password",
      "currentPasswordHint": "Current password required for identity verification",
      "newPasswordLabel": "New Password",
      "newPasswordPlaceholder": "Enter new password",
      "newPasswordHint": "Leave blank to keep current password",
      "footerHint": "You will be automatically logged out after modification and need to log in again"
    },
    "status": {
      "success": "Settings updated successfully",
      "processing": "Processing...",
      "updateSettings": "Update Settings",
      "updateAccount": "Update Account",
      "adminUpdateSuccess": "Administrator information updated successfully, logging out automatically",
      "errors": {
        "maxUploadSizeError": "Maximum upload size must be greater than 0",
        "updateSettingsError": "Failed to update system settings",
        "currentPasswordRequired": "Please enter current password",
        "newFieldRequired": "Please fill in at least one of new username or new password",
        "passwordSame": "New password cannot be the same as current password",
        "updateInfoError": "Failed to update administrator information"
      }
    }
  }
};