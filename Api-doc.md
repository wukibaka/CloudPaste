# CloudPaste 后端服务 API 文档

## API 文档

所有 API 返回格式统一为：

```json
{
  "code": 200, // HTTP状态码
  "message": "success", // 消息
  "data": {}, // 数据内容
  "success": true // 操作是否成功
}
```

### 公共 API

#### 基础 API

- `GET /api`

  - 描述：API 根路径，返回 API 基本信息
  - 参数：无
  - 响应：API 名称、版本和状态

- `GET /api/health`
  - 描述：API 健康检查端点，用于监控服务状态
  - 参数：无
  - 响应：
    ```json
    {
      "status": "ok",
      "timestamp": "2023-05-01T12:00:00Z"
    }
    ```

#### 系统设置 API

- `GET /api/system/max-upload-size`
  - 描述：获取系统允许的最大上传文件大小
  - 参数：无
  - 响应：包含 maxSizeMB 和 maxSizeBytes 的对象

### 文本分享 API

#### 创建和访问文本分享

- `POST /api/paste`

  - 描述：创建新的文本分享
  - 授权：需要管理员令牌或有文本权限的 API 密钥
  - 请求体：
    ```json
    {
      "content": "文本内容", // 必填
      "remark": "备注说明", // 可选
      "slug": "自定义短链接", // 可选，如不提供则自动生成
      "password": "访问密码", // 可选
      "expiresAt": "2023-12-31T23:59:59Z", // 可选，过期时间
      "maxViews": 10 // 可选，最大查看次数
    }
    ```
  - 响应：新创建的文本分享信息

- `GET /api/paste/:slug`

  - 描述：获取文本分享内容（无密码情况）
  - 参数：slug - 文本分享的唯一标识
  - 响应：如需密码则返回 requiresPassword=true，无需密码则返回完整内容

- `POST /api/paste/:slug`

  - 描述：使用密码获取文本分享内容
  - 参数：slug - 文本分享的唯一标识
  - 请求体：
    ```json
    {
      "password": "访问密码"
    }
    ```
  - 响应：验证成功后返回完整内容

- `GET /api/raw/:slug`
  - 描述：以纯文本格式获取文本分享内容
  - 参数：slug - 文本分享的唯一标识
  - 查询参数：
    - `password` - 访问密码（如需）
  - 响应：直接返回原始文本内容，Content-Type 为 text/plain
  - 注意：如果文本需要密码保护，必须通过查询参数提供正确密码

#### API 密钥用户文本管理

- `GET /api/user/pastes`

  - 描述：API 密钥用户获取自己的文本分享列表
  - 授权：需要有文本权限的 API 密钥
  - 参数：limit(默认 30), offset(默认 0)
  - 响应：文本分享列表和分页信息

- `GET /api/user/pastes/:id`

  - 描述：API 密钥用户获取单个文本详情
  - 授权：需要有文本权限的 API 密钥
  - 参数：id - 文本 ID
  - 响应：文本分享详细信息

- `DELETE /api/user/pastes/:id`

  - 描述：API 密钥用户删除单个文本
  - 授权：需要有文本权限的 API 密钥
  - 参数：id - 文本 ID
  - 响应：删除结果

- `DELETE /api/user/pastes`

  - 描述：API 密钥用户删除所有文本
  - 授权：需要有文本权限的 API 密钥
  - 响应：删除结果

- `PUT /api/user/pastes/:slug`
  - 描述：API 密钥用户更新文本信息
  - 授权：需要有文本权限的 API 密钥
  - 参数：slug - 文本短链接
  - 请求体：可包含 remark, expiresAt, maxViews, password 等字段
  - 响应：更新后的文本信息

#### 管理员文本管理

- `GET /api/admin/pastes`

  - 描述：管理员获取所有文本分享列表
  - 授权：需要管理员令牌
  - 参数：limit(默认 30), offset(默认 0)
  - 响应：文本分享列表和分页信息

- `GET /api/admin/pastes/:id`

  - 描述：管理员获取单个文本详情
  - 授权：需要管理员令牌
  - 参数：id - 文本 ID
  - 响应：文本分享详细信息

- `DELETE /api/admin/pastes/:id`

  - 描述：管理员删除单个文本
  - 授权：需要管理员令牌
  - 参数：id - 文本 ID
  - 响应：删除结果

- `DELETE /api/admin/pastes`

  - 描述：管理员删除所有文本
  - 授权：需要管理员令牌
  - 响应：删除结果

- `PUT /api/admin/pastes/:slug`
  - 描述：管理员更新文本信息
  - 授权：需要管理员令牌
  - 参数：slug - 文本短链接
  - 请求体：可包含 remark, expiresAt, maxViews, password 等字段
  - 响应：更新后的文本信息

### 文件分享 API

#### 文件上传和下载

- `POST /api/s3/presign`

  - 描述：获取 S3 预签名上传 URL
  - 授权：需要管理员令牌或有文件权限的 API 密钥
  - 请求体：
    ```json
    {
      "s3_config_id": "S3配置ID", // 必填
      "filename": "文件名.jpg", // 必填
      "size": 1024, // 可选，文件大小（字节）
      "mimetype": "image/jpeg", // 可选，MIME类型
      "path": "custom/path/", // 可选，自定义路径
      "slug": "custom-slug" // 可选，自定义短链接
    }
    ```
  - 响应：包含上传 URL 和文件信息

- `POST /api/s3/commit`

  - 描述：文件上传完成后的提交确认
  - 授权：需要管理员令牌或有文件权限的 API 密钥
  - 请求体：
    ```json
    {
      "file_id": "文件ID", // 必填
      "etag": "文件ETag", // 必填，S3返回的ETag
      "size": 1024, // 必填，文件实际大小（字节）
      "remark": "文件说明", // 可选
      "password": "文件密码", // 可选
      "expiresAt": "2023-12-31T23:59:59Z", // 可选，过期时间
      "maxDownloads": 10 // 可选，最大下载次数
    }
    ```
  - 响应：文件提交结果

- `GET /api/file-download/:slug`

  - 描述：直接下载文件（强制下载）
  - 参数：slug - 文件短链接
  - 查询参数：
    - `password` - 如果文件受密码保护，需提供密码
  - 响应：文件内容（下载），包含 Content-Disposition: attachment 头

- `GET /api/file-view/:slug`
  - 描述：预览文件（浏览器内查看）
  - 参数：slug - 文件短链接
  - 查询参数：
    - `password` - 如果文件受密码保护，需提供密码
  - 响应：文件内容（预览），包含 Content-Disposition: inline 头

#### 公共文件查询和验证

- `GET /api/public/files/:slug`

  - 描述：获取文件公开信息
  - 参数：slug - 文件短链接
  - 响应：包含文件基本信息（不含下载链接）

- `POST /api/public/files/:slug/verify`
  - 描述：验证文件访问密码
  - 参数：slug - 文件短链接
  - 请求体：
    ```json
    {
      "password": "文件密码"
    }
    ```
  - 响应：验证成功后返回带下载链接的文件信息

#### API 密钥用户文件管理

- `GET /api/user/files`

  - 描述：API 密钥用户获取自己上传的文件列表
  - 授权：需要有文件权限的 API 密钥
  - 参数：limit(默认 30), offset(默认 0)
  - 响应：文件列表和分页信息

- `GET /api/user/files/:id`

  - 描述：API 密钥用户获取单个文件详情
  - 授权：需要有文件权限的 API 密钥
  - 参数：id - 文件 ID
  - 响应：文件详细信息和下载链接

- `DELETE /api/user/files/:id`

  - 描述：API 密钥用户删除单个文件
  - 授权：需要有文件权限的 API 密钥
  - 参数：id - 文件 ID
  - 响应：删除结果

- `PUT /api/user/files/:id`
  - 描述：API 密钥用户更新文件信息
  - 授权：需要有文件权限的 API 密钥
  - 参数：id - 文件 ID
  - 请求体：可包含 remark, expiresAt, maxDownloads, password 等字段
  - 响应：更新后的文件信息

#### 管理员文件管理

- `GET /api/admin/files`

  - 描述：管理员获取所有文件列表
  - 授权：需要管理员令牌
  - 参数：limit(默认 30), offset(默认 0)
  - 响应：文件列表和分页信息

- `GET /api/admin/files/:id`

  - 描述：管理员获取单个文件详情
  - 授权：需要管理员令牌
  - 参数：id - 文件 ID
  - 响应：文件详细信息和下载链接

- `DELETE /api/admin/files/:id`

  - 描述：管理员删除单个文件
  - 授权：需要管理员令牌
  - 参数：id - 文件 ID
  - 响应：删除结果

- `PUT /api/admin/files/:id`
  - 描述：管理员更新文件信息
  - 授权：需要管理员令牌
  - 参数：id - 文件 ID
  - 请求体：可包含 remark, expiresAt, maxDownloads, password 等字段
  - 响应：更新后的文件信息

### S3 存储配置 API

- `GET /api/s3-configs`

  - 描述：获取所有公开的 S3 配置列表
  - 参数：无
  - 响应：S3 配置列表

- `GET /api/s3-configs/:id`

  - 描述：获取单个 S3 配置详情（公开配置）
  - 参数：id - 配置 ID
  - 响应：S3 配置详情

- `POST /api/s3-configs`

  - 描述：创建新的 S3 配置
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "name": "配置名称", // 必填
      "provider_type": "Cloudflare R2", // 必填，提供商类型
      "endpoint_url": "https://xxxx.r2.cloudflarestorage.com", // 必填，端点URL
      "bucket_name": "my-bucket", // 必填，存储桶名称
      "access_key_id": "ACCESS_KEY", // 必填
      "secret_access_key": "SECRET_KEY", // 必填
      "region": "auto", // 可选，区域
      "path_style": false, // 可选，路径样式寻址，默认false
      "default_folder": "uploads/", // 可选，默认上传文件夹
      "is_public": true, // 可选，是否公开，默认false
      "total_storage_bytes": 10737418240 // 可选，存储容量限制（字节）
    }
    ```
  - 响应：新创建的 S3 配置（不包含敏感字段）

- `PUT /api/s3-configs/:id`

  - 描述：更新 S3 配置
  - 授权：需要管理员令牌
  - 参数：id - 配置 ID
  - 请求体：与 POST 请求类似，所有字段均为可选
  - 响应：更新后的 S3 配置

- `DELETE /api/s3-configs/:id`

  - 描述：删除 S3 配置
  - 授权：需要管理员令牌
  - 参数：id - 配置 ID
  - 响应：删除结果

- `PUT /api/s3-configs/:id/set-default`

  - 描述：设置默认 S3 配置
  - 授权：需要管理员令牌
  - 参数：id - 配置 ID
  - 响应：设置结果

- `POST /api/s3-configs/:id/test`
  - 描述：测试 S3 配置连接有效性
  - 授权：需要管理员令牌
  - 参数：id - 配置 ID
  - 响应：测试结果，包含连接状态和详细信息

### 管理员 API

- `POST /api/admin/login`

  - 描述：管理员登录
  - 请求体：
    ```json
    {
      "username": "管理员用户名",
      "password": "管理员密码"
    }
    ```
  - 响应：登录令牌和管理员信息

- `POST /api/admin/logout`

  - 描述：管理员登出
  - 授权：需要管理员令牌
  - 响应：登出结果

- `POST /api/admin/change-password`

  - 描述：管理员修改密码
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "currentPassword": "当前密码",
      "newPassword": "新密码",
      "newUsername": "新用户名" // 可选
    }
    ```
  - 响应：修改结果

- `GET /api/test/admin-token`

  - 描述：测试管理员令牌有效性
  - 授权：需要管理员令牌
  - 响应：令牌有效状态

- `GET /api/admin/dashboard/stats`
  - 描述：获取管理员仪表盘统计数据
  - 授权：需要管理员令牌
  - 响应：系统统计数据，包含文本和文件使用情况、用户活跃度和系统性能指标

### API 密钥管理 API

- `GET /api/admin/api-keys`

  - 描述：获取所有 API 密钥列表
  - 授权：需要管理员令牌
  - 响应：API 密钥列表，包含每个密钥的权限和使用情况

- `POST /api/admin/api-keys`

  - 描述：创建新的 API 密钥
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "name": "密钥名称", // 必填
      "text_permission": true, // 是否有文本权限，默认false
      "file_permission": true, // 是否有文件权限，默认false
      "mount_permission": true, // 是否有挂载权限，默认false
      "expires_at": "2023-12-31T23:59:59Z" // 可选，过期时间
    }
    ```
  - 响应：新创建的 API 密钥信息，包含完整的密钥值（仅在创建时返回）

- `PUT /api/admin/api-keys/:id`

  - 描述：更新 API 密钥
  - 授权：需要管理员令牌
  - 参数：id - 密钥 ID
  - 请求体：
    ```json
    {
      "name": "新密钥名称", // 可选
      "text_permission": true, // 可选
      "file_permission": false, // 可选
      "mount_permission": true, // 可选
      "expires_at": "2023-12-31T23:59:59Z" // 可选
    }
    ```
  - 响应：更新后的密钥信息

- `DELETE /api/admin/api-keys/:id`

  - 描述：删除 API 密钥
  - 授权：需要管理员令牌
  - 参数：id - 密钥 ID
  - 响应：删除结果

- `GET /api/test/api-key`
  - 描述：测试 API 密钥有效性
  - 授权：需要有效的 API 密钥
  - 响应：密钥有效状态和权限信息，包含文本和文件权限状态
    - 返回字段包括：`id`、`name`、`text`（文本权限）、`file`（文件权限）、`mount`（挂载权限）

### 系统设置 API

- `GET /api/admin/system-settings`

  - 描述：获取系统设置
  - 授权：需要管理员令牌
  - 响应：系统设置信息，包含最大上传大小等系统参数

- `PUT /api/admin/system-settings`
  - 描述：更新系统设置
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "max_upload_size": 100, // 最大上传大小（MB）
      "default_paste_expiry": 7, // 默认文本过期天数
      "default_file_expiry": 7 // 默认文件过期天数
    }
    ```
  - 响应：更新后的系统设置

### 挂载管理 API

#### 管理员挂载点管理

- `GET /api/admin/mounts`

  - 描述：管理员获取所有挂载点列表
  - 授权：需要管理员令牌
  - 参数：无
  - 响应：挂载点列表和详细信息

- `GET /api/admin/mounts/:id`

  - 描述：管理员获取单个挂载点详情
  - 授权：需要管理员令牌
  - 参数：id - 挂载点 ID
  - 响应：挂载点详细信息

- `POST /api/admin/mounts`

  - 描述：管理员创建新的挂载点
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "name": "挂载点名称", // 必填
      "type": "s3", // 必填，挂载类型，如s3,webdav等
      "s3_config_id": "S3配置ID", // 当type=s3时必填
      "config": {
        // 其他配置信息，根据挂载类型不同而变化
        "path": "基础路径",
        "read_only": false
      }
    }
    ```
  - 响应：新创建的挂载点信息

- `PUT /api/admin/mounts/:id`

  - 描述：管理员更新挂载点信息
  - 授权：需要管理员令牌
  - 参数：id - 挂载点 ID
  - 请求体：包含需要更新的字段，格式同创建
  - 响应：更新结果

- `DELETE /api/admin/mounts/:id`
  - 描述：管理员删除挂载点
  - 授权：需要管理员令牌
  - 参数：id - 挂载点 ID
  - 响应：删除结果

#### API 密钥用户挂载点管理

- `GET /api/user/mounts`

  - 描述：API 密钥用户获取自己的挂载点列表
  - 授权：需要有挂载权限的 API 密钥
  - 参数：无
  - 响应：挂载点列表和详细信息

- `GET /api/user/mounts/:id`

  - 描述：API 密钥用户获取单个挂载点详情
  - 授权：需要有挂载权限的 API 密钥
  - 参数：id - 挂载点 ID
  - 响应：挂载点详细信息

- `POST /api/user/mounts`

  - 描述：API 密钥用户创建新的挂载点
  - 授权：需要有挂载权限的 API 密钥
  - 请求体：格式同管理员创建挂载点
  - 响应：新创建的挂载点信息

- `PUT /api/user/mounts/:id`

  - 描述：API 密钥用户更新挂载点信息
  - 授权：需要有挂载权限的 API 密钥
  - 参数：id - 挂载点 ID
  - 请求体：包含需要更新的字段
  - 响应：更新结果

- `DELETE /api/user/mounts/:id`
  - 描述：API 密钥用户删除挂载点
  - 授权：需要有挂载权限的 API 密钥
  - 参数：id - 挂载点 ID
  - 响应：删除结果

### 文件系统 API

#### 文件夹和文件操作 - 管理员版本

- `GET /api/admin/fs/list`

  - 描述：列出目录内容
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 要列出内容的目录路径，默认为根目录("/")
  - 响应：目录内容列表，包含文件和子目录信息

- `GET /api/admin/fs/get`

  - 描述：获取文件信息
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件详细信息

- `GET /api/admin/fs/download`

  - 描述：下载文件（强制下载）
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件内容（下载），包含 Content-Disposition: attachment 头

- `GET /api/admin/fs/preview`

  - 描述：预览文件（浏览器内查看）
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件内容（预览），包含 Content-Disposition: inline 头

- `POST /api/admin/fs/mkdir`

  - 描述：创建目录
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "要创建的目录路径" // 必填
    }
    ```
  - 响应：创建结果

- `POST /api/admin/fs/upload`

  - 描述：上传文件
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 上传目标路径（包含文件名）
  - 请求体：文件内容（二进制）
  - 响应：上传结果

- `DELETE /api/admin/fs/remove`

  - 描述：删除文件或目录
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 要删除的文件或目录路径
  - 响应：删除结果

- `POST /api/admin/fs/rename`

  - 描述：重命名文件或目录
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "oldPath": "原路径", // 必填
      "newPath": "新路径" // 必填
    }
    ```
  - 响应：重命名结果

- `POST /api/admin/fs/batch-remove`

  - 描述：批量删除文件或目录
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "paths": ["路径1", "路径2", "..."] // 必填，要删除项目的路径数组
    }
    ```
  - 响应：批量删除结果

- `POST /api/admin/fs/presign`

  - 描述：获取管理员预签名上传 URL，用于直接上传文件到存储系统
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "上传目标路径", // 必填，包含文件名
      "contentType": "文件MIME类型", // 可选，默认为application/octet-stream
      "fileSize": 1024000, // 可选，文件大小（字节）
      "mountId": "挂载点ID" // 可选，不指定则使用默认挂载点
    }
    ```
  - 响应：包含预签名 URL 和上传配置的对象

- `POST /api/admin/fs/presign/commit`

  - 描述：提交预签名上传，确认文件上传完成并更新元数据
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "上传目标路径", // 必填
      "uploadId": "上传ID", // 可选，分片上传时需要
      "etag": "文件ETag", // 可选，服务器返回的ETag
      "size": 1024000, // 可选，文件大小（字节）
      "mountId": "挂载点ID" // 可选，不指定则使用默认挂载点
    }
    ```
  - 响应：文件上传完成状态和文件信息

#### 文件夹和文件操作 - API 密钥用户版本

- `GET /api/user/fs/list`

  - 描述：列出目录内容
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 要列出内容的目录路径，默认为根目录("/")
  - 响应：目录内容列表，包含文件和子目录信息

- `GET /api/user/fs/get`

  - 描述：获取文件信息
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件详细信息

- `GET /api/user/fs/download`

  - 描述：下载文件（强制下载）
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件内容（下载），包含 Content-Disposition: attachment 头

- `GET /api/user/fs/preview`

  - 描述：预览文件（浏览器内查看）
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 文件路径
  - 响应：文件内容（预览），包含 Content-Disposition: inline 头

- `POST /api/user/fs/mkdir`

  - 描述：创建目录
  - 授权：需要有文件权限的 API 密钥
  - 请求体：
    ```json
    {
      "path": "要创建的目录路径" // 必填
    }
    ```
  - 响应：创建结果

- `POST /api/user/fs/upload`

  - 描述：上传文件
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 上传目标路径（包含文件名）
  - 请求体：文件内容（二进制）
  - 响应：上传结果

- `DELETE /api/user/fs/remove`

  - 描述：删除文件或目录
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：
    - `path` - 要删除的文件或目录路径
  - 响应：删除结果

- `POST /api/user/fs/rename`

  - 描述：重命名文件或目录
  - 授权：需要有文件权限的 API 密钥
  - 请求体：
    ```json
    {
      "oldPath": "原路径", // 必填
      "newPath": "新路径" // 必填
    }
    ```
  - 响应：重命名结果

- `POST /api/user/fs/batch-remove`

  - 描述：批量删除文件或目录
  - 授权：需要有文件权限的 API 密钥
  - 请求体：
    ```json
    {
      "paths": ["路径1", "路径2", "..."] // 必填，要删除项目的路径数组
    }
    ```
  - 响应：批量删除结果

- `POST /api/user/fs/presign`

  - 描述：获取用户预签名上传 URL，用于直接上传文件到存储系统
  - 授权：需要有文件权限的 API 密钥
  - 请求体：格式同管理员版本
  - 响应：包含预签名 URL 和上传配置的对象

- `POST /api/user/fs/presign/commit`

  - 描述：提交预签名上传，确认文件上传完成并更新元数据
  - 授权：需要有文件权限的 API 密钥
  - 请求体：格式同管理员版本
  - 响应：文件上传完成状态和文件信息

#### 分片上传 API - 管理员版本

- `POST /api/admin/fs/multipart/init`

  - 描述：初始化分片上传
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "上传目标路径", // 必填，包含文件名
      "contentType": "文件MIME类型", // 可选，默认为application/octet-stream
      "fileSize": 1024000, // 可选，文件大小（字节）
      "filename": "文件名.jpg" // 可选，如果path中未包含
    }
    ```
  - 响应：初始化信息，包含 uploadId 和其他元数据

- `POST /api/admin/fs/multipart/part`

  - 描述：上传文件分片
  - 授权：需要管理员令牌
  - 查询参数：
    - `path` - 上传目标路径（必填）
    - `uploadId` - 分片上传 ID（必填，来自 init 响应）
    - `partNumber` - 分片编号（必填，从 1 开始）
    - `isLastPart` - 是否为最后一个分片（可选，布尔值）
    - `key` - S3 存储键值（可选，来自 init 响应）
  - 请求体：分片内容（二进制）
  - 响应：分片上传结果，包含 ETag 等信息

- `POST /api/admin/fs/multipart/complete`

  - 描述：完成分片上传
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "上传目标路径", // 必填
      "uploadId": "分片上传ID", // 必填，来自init响应
      "parts": [
        // 必填，分片信息数组
        {
          "PartNumber": 1,
          "ETag": "分片1的ETag"
        },
        {
          "PartNumber": 2,
          "ETag": "分片2的ETag"
        }
      ],
      "key": "S3存储键值" // 可选，来自init响应
    }
    ```
  - 响应：上传完成结果

- `POST /api/admin/fs/multipart/abort`
  - 描述：中止分片上传
  - 授权：需要管理员令牌
  - 请求体：
    ```json
    {
      "path": "上传目标路径", // 必填
      "uploadId": "分片上传ID", // 必填，来自init响应
      "key": "S3存储键值" // 可选，来自init响应
    }
    ```
  - 响应：中止结果

#### 分片上传 API - API 密钥用户版本

- `POST /api/user/fs/multipart/init`

  - 描述：初始化分片上传
  - 授权：需要有文件权限的 API 密钥
  - 请求体：格式同管理员版本
  - 响应：初始化信息，包含 uploadId 和其他元数据

- `POST /api/user/fs/multipart/part`

  - 描述：上传文件分片
  - 授权：需要有文件权限的 API 密钥
  - 查询参数：格式同管理员版本
  - 请求体：分片内容（二进制）
  - 响应：分片上传结果，包含 ETag 等信息

- `POST /api/user/fs/multipart/complete`

  - 描述：完成分片上传
  - 授权：需要有文件权限的 API 密钥
  - 请求体：格式同管理员版本
  - 响应：上传完成结果

- `POST /api/user/fs/multipart/abort`
  - 描述：中止分片上传
  - 授权：需要有文件权限的 API 密钥
  - 请求体：格式同管理员版本
  - 响应：中止结果

### WebDAV 接口

#### WebDAV 访问

- `WebDAV端点: /dav`

  - 描述：WebDAV 协议接入点，提供标准 WebDAV 协议访问
  - 支持的 WebDAV 方法：
    - `GET` - 获取文件内容
    - `PUT` - 上传文件
    - `DELETE` - 删除文件
    - `PROPFIND` - 获取文件/目录属性
    - `PROPPATCH` - 修改属性
    - `MKCOL` - 创建目录
    - `COPY` - 复制文件/目录
    - `MOVE` - 移动文件/目录
    - `LOCK` - 锁定资源，防止其他客户端修改
    - `UNLOCK` - 解锁之前锁定的资源
  - 授权：基本 HTTP 认证（Basic Auth）或 Bearer 令牌认证
    - Basic Auth: 使用 API 密钥（用户名和密码相同设置为 API 密钥值）或管理员凭据
    - Bearer Auth: 使用 API 密钥值或管理员令牌
  - 权限要求：
    - 管理员账户：自动拥有所有操作权限
    - API 密钥：需要具有挂载权限（mount_permission）
