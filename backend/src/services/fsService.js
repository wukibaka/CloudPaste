/**
 * 文件系统服务
 * 提供文件系统操作的核心服务逻辑，复用WebDAV已有实现
 */
import { HTTPException } from "hono/http-exception";
import { ApiStatus } from "../constants/index.js";
import { findMountPointByPath, normalizeS3SubPath, updateMountLastUsed, checkDirectoryExists } from "../webdav/utils/webdavUtils.js";
import { getMountsByAdmin, getMountsByApiKey } from "./storageMountService.js";
import { createS3Client, buildS3Url } from "../utils/s3Utils.js";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { initializeMultipartUpload } from "./multipartUploadService.js";
import { S3ProviderTypes } from "../constants/index.js";
import { directoryCacheManager } from "../utils/DirectoryCache.js";
import { deleteFileRecordByStoragePath } from "./fileService.js";
import { generateFileId, getLocalTimeString } from "../utils/common.js";
import { getMimeTypeFromFilename, getMimeTypeAndGroupFromFile, getContentTypeAndDisposition, MIME_GROUPS } from "../utils/fileUtils.js";

/**
 * 规范化路径格式
 * @param {string} path - 输入路径
 * @param {boolean} isDirectory - 是否为目录路径
 * @returns {string} 规范化的路径
 */
function normalizePath(path, isDirectory = false) {
  // 确保路径以斜杠开始
  path = path.startsWith("/") ? path : "/" + path;
  // 如果是目录，确保路径以斜杠结束
  if (isDirectory) {
    path = path.endsWith("/") ? path : path + "/";
  }
  return path;
}

/**
 * 通用错误处理包装函数
 * 用于统一处理文件系统操作中的错误，简化代码重复
 * @param {Function} fn - 要执行的异步函数
 * @param {string} operationName - 操作名称，用于错误日志
 * @param {string} defaultErrorMessage - 默认错误消息
 * @returns {Promise<any>} - 函数执行结果
 * @throws {HTTPException} - 统一处理后的HTTP异常
 */
async function handleFsError(fn, operationName, defaultErrorMessage) {
  try {
    return await fn();
  } catch (error) {
    console.error(`${operationName}错误:`, error);
    // 如果已经是HTTPException，直接抛出
    if (error instanceof HTTPException) {
      throw error;
    }
    // 其他错误转换为内部服务器错误
    throw new HTTPException(ApiStatus.INTERNAL_ERROR, { message: error.message || defaultErrorMessage });
  }
}

/**
 * 列出目录内容
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 请求路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Object>} 目录内容对象
 */
export async function listDirectory(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 规范化路径
        path = normalizePath(path, true); // 使用统一的路径规范化函数

        // 根据用户类型获取挂载点列表
        let mounts;
        if (userType === "admin") {
          mounts = await getMountsByAdmin(db, userId);
        } else if (userType === "apiKey") {
          mounts = await getMountsByApiKey(db, userId);
        } else {
          throw new HTTPException(ApiStatus.UNAUTHORIZED, { message: "未授权访问" });
        }

        // 按照路径长度降序排序，以便优先匹配最长的路径
        mounts.sort((a, b) => b.mount_path.length - a.mount_path.length);

        // 检查是否匹配到实际的挂载点
        let isVirtualPath = true;
        let matchingMount = null;
        let subPath = "";

        for (const mount of mounts) {
          const mountPath = mount.mount_path.startsWith("/") ? mount.mount_path : "/" + mount.mount_path;

          // 如果请求路径完全匹配挂载点或者是挂载点的子路径
          if (path === mountPath + "/" || path.startsWith(mountPath + "/")) {
            matchingMount = mount;
            subPath = path.substring(mountPath.length);
            if (!subPath.startsWith("/")) {
              subPath = "/" + subPath;
            }
            isVirtualPath = false;
            break;
          }
        }

        // 处理虚拟目录路径（根目录或中间目录）
        if (isVirtualPath) {
          return await getVirtualDirectoryListing(mounts, path);
        }

        // 处理实际挂载点目录，查询S3
        return await getS3DirectoryListing(db, matchingMount, subPath, encryptionSecret);
      },
      "列出目录",
      "列出目录失败"
  );
}

/**
 * 获取虚拟目录列表
 * @param {Array} mounts - 挂载点列表
 * @param {string} path - 当前路径
 * @returns {Promise<Object>} 虚拟目录内容
 */
async function getVirtualDirectoryListing(mounts, path) {
  // 确保路径格式正确
  path = normalizePath(path, true); // 使用统一的路径规范化函数

  // 构造返回结果结构
  const result = {
    path: path,
    type: "directory",
    isRoot: path === "/",
    isVirtual: true,
    items: [],
  };

  // 目录结构记录
  const directories = new Set();
  const mountEntries = [];

  // 遍历所有挂载点
  for (const mount of mounts) {
    let mountPath = mount.mount_path;
    mountPath = mountPath.startsWith("/") ? mountPath : "/" + mountPath;

    // 如果挂载路径正好等于当前路径
    if (mountPath + "/" === path || mountPath === path) {
      mountEntries.push({
        name: mount.name || mountPath.split("/").filter(Boolean).pop() || mount.id,
        path: mountPath,
        isDirectory: true,
        isMount: true,
        mount_id: mount.id,
        modified: mount.updated_at || mount.created_at || new Date().toISOString(),
        storage_type: mount.storage_type,
      });
      continue;
    }

    // 检查挂载路径是否在当前路径下
    if (mountPath.startsWith(path)) {
      // 提取相对路径
      const relativePath = mountPath.substring(path.length);
      // 获取第一级目录
      const firstDir = relativePath.split("/")[0];
      if (firstDir) {
        directories.add(firstDir);
      }
    }
  }

  // 将目录添加到结果中
  for (const dir of directories) {
    result.items.push({
      name: dir,
      path: path + dir + "/",
      isDirectory: true,
      isVirtual: true,
      modified: new Date().toISOString(),
    });
  }

  // 将挂载点添加到结果中
  for (const mountEntry of mountEntries) {
    result.items.push(mountEntry);
  }

  return result;
}

/**
 * 获取S3目录内容
 * @param {D1Database} db - D1数据库实例
 * @param {Object} mount - 挂载点对象
 * @param {string} subPath - 相对于挂载点的子路径
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Object>} S3目录内容
 */
async function getS3DirectoryListing(db, mount, subPath, encryptionSecret) {
  // 如果启用了缓存（cache_ttl > 0），则尝试从缓存获取结果
  if (mount.cache_ttl > 0) {
    const cachedResult = directoryCacheManager.get(mount.id, subPath);
    if (cachedResult) {
      // 缓存命中，记录日志并返回缓存结果
      console.log(`目录缓存命中 - 挂载点:${mount.id}, 路径:${subPath}`);
      return cachedResult;
    }
  }

  // 获取S3配置
  const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();

  if (!s3Config) {
    throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
  }

  // 创建S3客户端
  const s3Client = await createS3Client(s3Config, encryptionSecret);

  // 规范化S3子路径
  const s3SubPath = normalizeS3SubPath(subPath, s3Config, true);

  // 更新挂载点的最后使用时间
  await updateMountLastUsed(db, mount.id);

  // 构造返回结果结构
  const result = {
    path: mount.mount_path + subPath,
    type: "directory",
    isRoot: false,
    isVirtual: false,
    mount_id: mount.id,
    storage_type: mount.storage_type,
    items: [],
  };

  // 计算完整前缀，组合root_prefix和default_folder
  let fullPrefix = s3SubPath;

  // 处理root_prefix
  const rootPrefix = s3Config.root_prefix ? (s3Config.root_prefix.endsWith("/") ? s3Config.root_prefix : s3Config.root_prefix + "/") : "";

  // 处理default_folder
  const defaultFolder = s3Config.default_folder ? (s3Config.default_folder.endsWith("/") ? s3Config.default_folder : s3Config.default_folder + "/") : "";

  // 构建完整前缀，顺序：rootPrefix + defaultFolder + s3SubPath
  fullPrefix = rootPrefix;

  // 添加defaultFolder (如果有且不是'/')
  if (defaultFolder && defaultFolder !== "/") {
    fullPrefix += defaultFolder;
  }

  // 添加s3SubPath (如果不是'/')
  if (s3SubPath && s3SubPath !== "/") {
    fullPrefix += s3SubPath;
  }

  // 确保前缀总是以斜杠结尾 (如果不为空)
  if (fullPrefix && !fullPrefix.endsWith("/")) {
    fullPrefix += "/";
  }

  console.log("完整S3前缀:", fullPrefix);

  // 列出S3对象
  const command = new ListObjectsV2Command({
    Bucket: s3Config.bucket_name,
    Prefix: fullPrefix,
    Delimiter: "/",
  });

  try {
    const response = await s3Client.send(command);

    console.log("S3 API响应统计:", {
      prefixesCount: response.CommonPrefixes ? response.CommonPrefixes.length : 0,
      contentsCount: response.Contents ? response.Contents.length : 0,
      prefix: fullPrefix,
    });

    // 处理前缀（文件夹）
    if (response.CommonPrefixes) {
      for (const prefix of response.CommonPrefixes) {
        if (prefix.Prefix) {
          // 从S3 key中提取相对路径和名称
          const fullPrefix = prefix.Prefix;
          const relativePath = fullPrefix.substring(s3SubPath.length);
          let dirName = relativePath;

          // 移除末尾的斜杠
          if (dirName.endsWith("/")) {
            dirName = dirName.slice(0, -1);
          }

          // 跳过空目录名
          if (!dirName) {
            continue;
          }

          result.items.push({
            name: dirName,
            path: mount.mount_path + subPath + dirName + "/",
            isDirectory: true,
            isVirtual: false,
            modified: new Date().toISOString(), // S3前缀没有修改时间，使用当前时间
          });
        }
      }
    }

    // 处理内容（文件）
    if (response.Contents) {
      // 计算用于截取相对路径的前缀长度
      const prefixLength = fullPrefix.length;

      for (const content of response.Contents) {
        const key = content.Key;

        // 跳过作为目录标记的对象（与前缀完全相同或只是添加了斜杠的对象）
        if (key === fullPrefix || key === fullPrefix + "/") {
          console.log("跳过目录标记:", key);
          continue;
        }

        // 从S3 key中提取相对路径和名称（从正确的前缀位置开始）
        const relativePath = key.substring(prefixLength);

        // 跳过嵌套在子目录中的文件（这些应在子目录中列出）
        if (relativePath.includes("/")) {
          continue;
        }

        // 跳过空文件名
        if (!relativePath) {
          continue;
        }

        result.items.push({
          name: relativePath,
          path: mount.mount_path + subPath + relativePath,
          isDirectory: false,
          size: content.Size,
          modified: content.LastModified ? content.LastModified.toISOString() : new Date().toISOString(),
          etag: content.ETag ? content.ETag.replace(/"/g, "") : undefined,
        });
      }
    }

    // 如果启用了缓存，将结果添加到缓存
    if (mount.cache_ttl > 0) {
      directoryCacheManager.set(mount.id, subPath, result, mount.cache_ttl);
      console.log(`目录已缓存 - 挂载点:${mount.id}, 路径:${subPath}, TTL:${mount.cache_ttl}秒`);
    }

    return result;
  } catch (error) {
    console.error("S3列目录错误:", error);
    throw error;
  }
}

/**
 * 获取文件信息
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Object>} 文件信息
 */
export async function getFileInfo(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 创建S3客户端
        const s3Client = await createS3Client(s3Config, encryptionSecret);

        // 规范化S3子路径 (不添加斜杠，因为可能是文件)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 获取对象信息
        try {
          // 首先尝试使用HeadObjectCommand获取元数据
          try {
            const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
            const headParams = {
              Bucket: s3Config.bucket_name,
              Key: s3SubPath,
            };

            const headCommand = new HeadObjectCommand(headParams);
            const headResponse = await s3Client.send(headCommand);

            // 判断是文件还是目录
            const isDirectory = s3SubPath.endsWith("/") || headResponse.ContentType === "application/x-directory";

            // 构建文件/目录信息
            const result = {
              path: path,
              name: path.split("/").filter(Boolean).pop() || "/",
              isDirectory: isDirectory,
              size: headResponse.ContentLength,
              modified: headResponse.LastModified ? headResponse.LastModified.toISOString() : new Date().toISOString(),
              contentType: headResponse.ContentType || "application/octet-stream",
              etag: headResponse.ETag ? headResponse.ETag.replace(/"/g, "") : undefined,
              mount_id: mount.id,
              storage_type: mount.storage_type,
            };

            return result;
          } catch (headError) {
            // 如果HEAD请求失败（可能是403 Forbidden或UnknownError），继续尝试GET请求
            if (headError.$metadata?.httpStatusCode === 403 || headError.name === "UnknownError" || (headError.message && headError.message.includes("UnknownError"))) {
              // 使用GetObjectCommand但不使用Range参数
              const { GetObjectCommand } = await import("@aws-sdk/client-s3");
              const getParams = {
                Bucket: s3Config.bucket_name,
                Key: s3SubPath,
                // 不使用Range头部，避免签名问题
              };

              const getCommand = new GetObjectCommand(getParams);
              const getResponse = await s3Client.send(getCommand);

              // 安全地关闭响应流，不同环境下Body的实现可能不同
              try {
                if (getResponse.Body) {
                  // 根据响应体类型使用适当的方法关闭
                  if (typeof getResponse.Body.destroy === "function") {
                    // Node.js环境
                    getResponse.Body.destroy();
                  } else if (typeof getResponse.Body.cancel === "function") {
                    // 某些浏览器环境
                    getResponse.Body.cancel();
                  } else if (typeof getResponse.Body.close === "function") {
                    // 某些流实现
                    getResponse.Body.close();
                  } else if (typeof getResponse.Body.abort === "function") {
                    // 某些请求实现
                    getResponse.Body.abort();
                  }
                  // 如果以上方法都不存在，让GC处理
                }
              } catch (closeError) {
                // 忽略关闭流时的错误，不影响主流程
                console.log("关闭响应流时出现错误，已忽略:", closeError);
              }

              // 判断是文件还是目录
              const isDirectory = s3SubPath.endsWith("/") || getResponse.ContentType === "application/x-directory";

              // 构建文件/目录信息
              const result = {
                path: path,
                name: path.split("/").filter(Boolean).pop() || "/",
                isDirectory: isDirectory,
                size: getResponse.ContentLength,
                modified: getResponse.LastModified ? getResponse.LastModified.toISOString() : new Date().toISOString(),
                contentType: getResponse.ContentType || "application/octet-stream",
                etag: getResponse.ETag ? getResponse.ETag.replace(/"/g, "") : undefined,
                mount_id: mount.id,
                storage_type: mount.storage_type,
              };

              return result;
            } else if (headError.$metadata?.httpStatusCode === 404) {
              // 如果是404错误，可能是目录，继续下面的目录处理逻辑
              throw headError;
            } else {
              // 其他类型的错误直接抛出
              throw headError;
            }
          }
        } catch (error) {
          // 如果是404错误，可能是目录，尝试列出前缀内容来确认
          if (error.$metadata && error.$metadata.httpStatusCode === 404) {
            // 尝试作为目录处理
            const dirPath = s3SubPath.endsWith("/") ? s3SubPath : s3SubPath + "/";

            const listParams = {
              Bucket: s3Config.bucket_name,
              Prefix: dirPath,
              MaxKeys: 1,
            };

            const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
            const listCommand = new ListObjectsV2Command(listParams);
            const listResponse = await s3Client.send(listCommand);

            // 如果有内容，说明是目录
            if (listResponse.Contents && listResponse.Contents.length > 0) {
              const result = {
                path: path,
                name: path.split("/").filter(Boolean).pop() || "/",
                isDirectory: true,
                size: 0,
                modified: new Date().toISOString(),
                contentType: "application/x-directory",
                mount_id: mount.id,
                storage_type: mount.storage_type,
              };
              return result;
            }

            // 如果没有内容，可能是文件不存在
            throw new HTTPException(ApiStatus.NOT_FOUND, { message: "文件或目录不存在" });
          } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
            throw new HTTPException(ApiStatus.FORBIDDEN, { message: "没有权限访问该文件或目录" });
          } else if (error instanceof HTTPException) {
            throw error;
          }

          throw new HTTPException(ApiStatus.INTERNAL_ERROR, { message: `获取文件信息失败: ${error.name || "未知错误"} - ${error.message || ""}` });
        }
      },
      "获取文件信息",
      "获取文件信息失败"
  );
}

/**
 * 预览文件
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Response>} 文件内容响应，用于预览
 */
export async function previewFile(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 规范化S3子路径 (不添加斜杠，因为是文件)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 提取文件名
        const fileName = path.split("/").filter(Boolean).pop() || "file";

        // 使用getFileFromS3函数直接获取内容并返回
        // 设置isPreview为true表示预览模式
        return await getFileFromS3(s3Config, s3SubPath, fileName, true, encryptionSecret);
      },
      "预览文件",
      "预览文件失败"
  );
}

/**
 * 下载文件
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Response>} 文件内容响应
 */
export async function downloadFile(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 规范化S3子路径 (不添加斜杠，因为是文件)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 提取文件名
        const fileName = path.split("/").filter(Boolean).pop() || "file";

        // 使用getFileFromS3函数直接获取内容并返回
        // 设置isPreview为true表示预览模式
        return await getFileFromS3(s3Config, s3SubPath, fileName, false, encryptionSecret);
      },
      "下载文件",
      "下载文件失败"
  );
}

/**
 * 创建目录
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 目录路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<void>}
 */
export async function createDirectory(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 确保路径以斜杠结尾
        path = normalizePath(path, true); // 使用统一的路径规范化函数

        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 创建S3客户端
        const s3Client = await createS3Client(s3Config, encryptionSecret);

        // 规范化S3子路径 (添加斜杠，因为是目录)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, true);

        // 检查父目录是否存在
        if (s3SubPath.split("/").filter(Boolean).length > 1) {
          const parentPath = s3SubPath.substring(0, s3SubPath.lastIndexOf("/", s3SubPath.length - 2) + 1);
          const parentExists = await checkDirectoryExists(s3Client, s3Config.bucket_name, parentPath);

          if (!parentExists) {
            throw new HTTPException(ApiStatus.CONFLICT, { message: "父目录不存在" });
          }
        }

        // 检查目录是否已存在
        try {
          const headParams = {
            Bucket: s3Config.bucket_name,
            Key: s3SubPath,
          };

          const headCommand = new HeadObjectCommand(headParams);
          await s3Client.send(headCommand);

          // 如果到这里，说明目录已存在
          throw new HTTPException(ApiStatus.CONFLICT, { message: "目录已存在" });
        } catch (error) {
          // 如果是404错误，说明目录不存在，可以创建
          if (error.$metadata && error.$metadata.httpStatusCode === 404) {
            // 创建空目录对象
            const putParams = {
              Bucket: s3Config.bucket_name,
              Key: s3SubPath,
              Body: "",
              ContentType: "application/x-directory",
            };

            const putCommand = new PutObjectCommand(putParams);
            await s3Client.send(putCommand);

            // 更新最后使用时间
            await updateMountLastUsed(db, mount.id);

            // 清除父目录的缓存，因为目录内容已变更
            if (subPath !== "/") {
              const parentSubPath = subPath.substring(0, subPath.lastIndexOf("/", subPath.length - 2) + 1);
              // 修改：使用invalidatePathAndAncestors清理父路径及所有祖先路径的缓存
              const invalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, parentSubPath);
              console.log(`创建目录后缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${parentSubPath}, 清理了${invalidatedCount}个缓存条目`);
            }

            return;
          }

          // 其他错误则抛出
          throw error;
        }
      },
      "创建目录",
      "创建目录失败"
  );
}

/**
 * 上传文件
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 目标路径
 * @param {FormData File} file - 文件对象
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @param {boolean} useMultipart - 是否使用分片上传，默认为true
 * @returns {Promise<Object>} 上传结果信息
 */
export async function uploadFile(db, path, file, userId, userType, encryptionSecret, useMultipart = true) {
  return handleFsError(
      async () => {
        // 根据useMultipart参数决定使用哪种上传方式
        if (useMultipart) {
          // 使用分片上传
          const multipartInfo = await initializeMultipartUpload(db, path, file.type || "application/octet-stream", file.size, userId, userType, encryptionSecret);

          // 返回包含必要信息的对象，前端将使用这些信息进行分片上传
          return {
            useMultipart: true,
            uploadId: multipartInfo.uploadId,
            path: multipartInfo.path,
            recommendedPartSize: multipartInfo.recommendedPartSize,
            bucket: multipartInfo.bucket,
            key: multipartInfo.key,
            mount_id: multipartInfo.mount_id,
            storage_type: multipartInfo.storage_type,
            message: "请使用分片上传API上传此文件",
          };
        } else {
          // 使用直接上传
          console.log(`使用直接上传模式，文件: ${file.name}, 大小: ${file.size} 字节`);

          // 查找挂载点
          const mountResult = await findMountPointByPath(db, path, userId, userType);

          // 处理错误情况
          if (mountResult.error) {
            throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
          }

          const { mount, subPath } = mountResult;

          // 获取S3配置
          const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
          if (!s3Config) {
            throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
          }

          // 创建S3客户端
          const s3Client = await createS3Client(s3Config, encryptionSecret);

          // 规范化S3子路径
          let s3SubPath = normalizeS3SubPath(subPath, s3Config, true); // 设置为true确保以斜杠结尾
          // 获取文件名
          const fileName = file.name || "unnamed_file";

          // 构建最终的S3路径：确保子路径以斜杠结尾，然后附加文件名
          let finalS3Path;
          if (s3SubPath && s3SubPath.trim() !== "") {
            // 确保子路径以斜杠结尾
            if (!s3SubPath.endsWith("/")) {
              s3SubPath += "/";
            }
            finalS3Path = s3SubPath + fileName;
          } else {
            // 处理根路径的情况
            finalS3Path = (s3Config.root_prefix || "") + (s3Config.default_folder || "") + fileName;
          }

          // 检查父目录是否存在
          if (finalS3Path.includes("/")) {
            const parentPath = finalS3Path.substring(0, finalS3Path.lastIndexOf("/") + 1);
            const parentExists = await checkDirectoryExists(s3Client, s3Config.bucket_name, parentPath);

            if (!parentExists) {
              throw new HTTPException(ApiStatus.CONFLICT, { message: "父目录不存在" });
            }
          }

          try {
            // 读取文件内容
            const fileContent = await file.arrayBuffer();

            // 直接上传到S3
            const putParams = {
              Bucket: s3Config.bucket_name,
              Key: finalS3Path,
              Body: fileContent,
              ContentType: file.type || "application/octet-stream",
            };

            console.log(`开始直接上传 ${file.size} 字节到 S3，路径: ${finalS3Path}`);

            // 直接上传文件
            const putCommand = new PutObjectCommand(putParams);
            const result = await s3Client.send(putCommand);

            // 更新最后使用时间
            await updateMountLastUsed(db, mount.id);

            // 构建S3直接访问URL
            const s3Url = buildS3Url(s3Config, finalS3Path);

            // 生成文件ID
            const fileId = generateFileId();

            // 生成slug（使用文件ID的前5位作为slug）
            const fileSlug = "M-" + fileId.substring(0, 5);

            // 获取当前时间
            const now = getLocalTimeString();

            // 记录文件信息到数据库
            await db
                .prepare(
                    `
              INSERT INTO files (
                id, filename, storage_path, s3_url, mimetype, size, s3_config_id, slug, etag, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
                )
                .bind(
                    fileId,
                    fileName,
                    finalS3Path,
                    s3Url,
                    file.type || "application/octet-stream",
                    file.size,
                    s3Config.id,
                    fileSlug,
                    result.ETag ? result.ETag.replace(/"/g, "") : null,
                    `${userType}:${userId}`,
                    now,
                    now
                )
                .run();

            console.log(`文件信息已保存到数据库，fileId: ${fileId}, slug: ${fileSlug}`);

            // 清除父目录缓存
            if (subPath !== "/" && subPath.includes("/")) {
              const parentSubPath = subPath.substring(0, subPath.lastIndexOf("/") + 1);
              const invalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, parentSubPath);
              console.log(`上传文件后缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${parentSubPath}, 清理了${invalidatedCount}个缓存条目`);
            } else {
              // 如果是根目录下的文件，清除根目录缓存
              directoryCacheManager.invalidate(mount.id, "/");
            }

            // 构建返回结果
            return {
              useMultipart: false,
              success: true,
              path: path,
              name: path.split("/").filter(Boolean).pop() || file.name,
              size: file.size,
              mimetype: file.type || "application/octet-stream",
              etag: result.ETag ? result.ETag.replace(/"/g, "") : undefined,
              fileId: fileId, // 添加fileId到返回值
              slug: fileSlug, // 添加slug到返回值
              message: "文件上传成功",
            };
          } catch (error) {
            console.error("直接上传失败:", error);
            throw error;
          }
        }
      },
      "上传文件",
      "上传文件失败"
  );
}

/**
 * 删除文件或目录
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件或目录路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<void>}
 */
export async function removeItem(db, path, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 创建S3客户端
        const s3Client = await createS3Client(s3Config, encryptionSecret);

        // 判断是目录还是文件
        const isDirectory = path.endsWith("/");

        // 规范化S3子路径
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, isDirectory);

        if (isDirectory) {
          // 对于目录，需要递归删除所有内容
          await deleteDirectory(s3Client, s3Config.bucket_name, s3SubPath, db, mount.storage_config_id);

          // 清除该目录的缓存
          directoryCacheManager.invalidate(mount.id, subPath);
        } else {
          // 对于文件，直接删除
          const deleteParams = {
            Bucket: s3Config.bucket_name,
            Key: s3SubPath,
          };

          try {
            const deleteCommand = new DeleteObjectCommand(deleteParams);
            await s3Client.send(deleteCommand);
          } catch (error) {
            if (error.$metadata && error.$metadata.httpStatusCode === 404) {
              throw new HTTPException(ApiStatus.NOT_FOUND, { message: "文件不存在" });
            }
            throw error;
          }
        }

        // 尝试删除文件记录表中的对应记录
        try {
          const fileDeleteResult = await deleteFileRecordByStoragePath(db, mount.storage_config_id, s3SubPath);
          if (fileDeleteResult.deletedCount > 0) {
            console.log(`从文件记录中删除了${fileDeleteResult.deletedCount}条数据：挂载点=${mount.id}, 路径=${s3SubPath}`);
          }
        } catch (fileDeleteError) {
          // 文件记录删除失败不影响主流程
          console.error(`删除文件记录失败: ${fileDeleteError.message}`);
        }

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 清除父目录缓存
        if (subPath !== "/" && subPath.includes("/")) {
          const parentSubPath = subPath.substring(0, subPath.lastIndexOf("/", isDirectory ? subPath.length - 2 : subPath.length - 1) + 1);
          // 修改：使用invalidatePathAndAncestors清理父路径及所有祖先路径的缓存
          const invalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, parentSubPath);
          console.log(`删除文件后缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${parentSubPath}, 清理了${invalidatedCount}个缓存条目`);
        } else if (!isDirectory) {
          // 如果删除的是根目录下的文件，清除根目录缓存
          directoryCacheManager.invalidate(mount.id, "/");
        }
      },
      "删除文件或目录",
      "删除失败"
  );
}

/**
 * 递归删除目录
 * @param {S3Client} s3Client - S3客户端
 * @param {string} bucketName - 存储桶名称
 * @param {string} dirPath - 目录路径
 * @param {D1Database} db - 数据库实例，用于删除文件记录
 * @param {string} s3ConfigId - S3配置ID，用于删除文件记录
 */
async function deleteDirectory(s3Client, bucketName, dirPath, db = null, s3ConfigId = null) {
  // 确保目录路径以斜杠结尾
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/";

  try {
    let continuationToken = undefined;
    let isEmpty = true;
    let deletedFiles = [];

    // 使用循环而非递归处理可能的多页结果
    do {
      // 列出目录内容
      const listParams = {
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      };

      const listCommand = new ListObjectsV2Command(listParams);
      const listResponse = await s3Client.send(listCommand);

      // 检查是否有内容
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        isEmpty = false;

        // 删除所有对象
        for (const object of listResponse.Contents) {
          const deleteParams = {
            Bucket: bucketName,
            Key: object.Key,
          };

          const deleteCommand = new DeleteObjectCommand(deleteParams);
          await s3Client.send(deleteCommand);

          // 记录已删除的文件路径，用于后续批量删除文件记录
          deletedFiles.push(object.Key);
        }
      }

      // 更新令牌用于下一次循环
      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    // 如果整个过程中没有找到任何对象，则认为目录不存在
    if (isEmpty) {
      throw new HTTPException(ApiStatus.NOT_FOUND, { message: "目录不存在或为空" });
    }

    // 如果提供了数据库和配置ID，尝试批量删除文件记录
    if (db && s3ConfigId && deletedFiles.length > 0) {
      try {
        // 对于每个删除的文件，尝试删除对应的文件记录
        for (const filePath of deletedFiles) {
          await deleteFileRecordByStoragePath(db, s3ConfigId, filePath);
        }
        console.log(`已尝试删除${deletedFiles.length}个文件的记录`);
      } catch (fileDeleteError) {
        // 文件记录删除失败不影响主流程
        console.error(`批量删除文件记录失败: ${fileDeleteError.message}`);
      }
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(ApiStatus.INTERNAL_ERROR, { message: "删除目录失败: " + error.message });
  }
}

/**
 * 重命名文件或目录
 * @param {D1Database} db - D1数据库实例
 * @param {string} oldPath - 旧路径
 * @param {string} newPath - 新路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<void>}
 */
export async function renameItem(db, oldPath, newPath, userId, userType, encryptionSecret) {
  return handleFsError(
      async () => {
        // 检查路径类型必须匹配 (都是文件或都是目录)
        const oldIsDirectory = oldPath.endsWith("/");
        const newIsDirectory = newPath.endsWith("/");

        if (oldIsDirectory !== newIsDirectory) {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "源路径和目标路径类型必须一致（文件或目录）" });
        }

        // 查找源路径的挂载点
        const oldMountResult = await findMountPointByPath(db, oldPath, userId, userType);

        // 处理错误情况
        if (oldMountResult.error) {
          throw new HTTPException(oldMountResult.error.status, { message: oldMountResult.error.message });
        }

        // 查找目标路径的挂载点
        const newMountResult = await findMountPointByPath(db, newPath, userId, userType);

        // 处理错误情况
        if (newMountResult.error) {
          throw new HTTPException(newMountResult.error.status, { message: newMountResult.error.message });
        }

        // 只支持同一个挂载点内的重命名
        if (oldMountResult.mount.id !== newMountResult.mount.id) {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "不支持跨挂载点重命名，请使用复制和删除操作" });
        }

        const mount = oldMountResult.mount;
        const oldSubPath = oldMountResult.subPath;
        const newSubPath = newMountResult.subPath;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 创建S3客户端
        const s3Client = await createS3Client(s3Config, encryptionSecret);

        // 规范化S3子路径
        const s3OldPath = normalizeS3SubPath(oldSubPath, s3Config, oldIsDirectory);
        const s3NewPath = normalizeS3SubPath(newSubPath, s3Config, newIsDirectory);

        // 检查新路径父目录是否存在
        if (s3NewPath.includes("/")) {
          const parentPath = s3NewPath.substring(0, s3NewPath.lastIndexOf("/") + 1);
          const parentExists = await checkDirectoryExists(s3Client, s3Config.bucket_name, parentPath);

          if (!parentExists) {
            throw new HTTPException(ApiStatus.CONFLICT, { message: "目标父目录不存在" });
          }
        }

        // 检查目标路径是否已存在
        try {
          const headParams = {
            Bucket: s3Config.bucket_name,
            Key: s3NewPath,
          };

          const headCommand = new HeadObjectCommand(headParams);
          await s3Client.send(headCommand);

          // 如果到这里，说明目标已存在
          throw new HTTPException(ApiStatus.CONFLICT, { message: "目标路径已存在" });
        } catch (error) {
          // 如果是404错误，说明目标不存在，可以继续
          if (error.$metadata && error.$metadata.httpStatusCode !== 404) {
            throw error;
          }
        }

        if (oldIsDirectory) {
          // 对于目录，需要复制所有内容
          await renameDirectory(s3Client, s3Config.bucket_name, s3OldPath, s3NewPath);

          // 清除重命名的目录的缓存
          directoryCacheManager.invalidate(mount.id, oldSubPath);
          // 清除目标目录可能存在的缓存
          directoryCacheManager.invalidate(mount.id, newSubPath);
        } else {
          // 对于文件，使用复制然后删除
          // 复制对象
          const copyParams = {
            Bucket: s3Config.bucket_name,
            CopySource: encodeURIComponent(s3Config.bucket_name + "/" + s3OldPath),
            Key: s3NewPath,
          };

          const copyCommand = new CopyObjectCommand(copyParams);
          await s3Client.send(copyCommand);

          // 删除原对象
          const deleteParams = {
            Bucket: s3Config.bucket_name,
            Key: s3OldPath,
          };

          const deleteCommand = new DeleteObjectCommand(deleteParams);
          await s3Client.send(deleteCommand);
        }

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 清除源文件/目录所在目录的缓存
        if (oldSubPath !== "/" && oldSubPath.includes("/")) {
          const oldParentSubPath = oldSubPath.substring(0, oldSubPath.lastIndexOf("/", oldIsDirectory ? oldSubPath.length - 2 : oldSubPath.length - 1) + 1);
          // 修改：使用invalidatePathAndAncestors清理父路径及所有祖先路径的缓存
          const oldInvalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, oldParentSubPath);
          console.log(`重命名文件/目录后源路径缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${oldParentSubPath}, 清理了${oldInvalidatedCount}个缓存条目`);
        } else if (!oldIsDirectory) {
          // 如果是根目录下的文件，清除根目录缓存
          directoryCacheManager.invalidate(mount.id, "/");
        }

        // 清除目标文件/目录所在目录的缓存
        if (newSubPath !== "/" && newSubPath.includes("/")) {
          const newParentSubPath = newSubPath.substring(0, newSubPath.lastIndexOf("/", newIsDirectory ? newSubPath.length - 2 : newSubPath.length - 1) + 1);
          // 修改：使用invalidatePathAndAncestors清理父路径及所有祖先路径的缓存
          const newInvalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, newParentSubPath);
          console.log(`重命名文件/目录后目标路径缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${newParentSubPath}, 清理了${newInvalidatedCount}个缓存条目`);
        } else if (!newIsDirectory) {
          // 如果是根目录下的文件，清除根目录缓存
          directoryCacheManager.invalidate(mount.id, "/");
        }
      },
      "重命名文件或目录",
      "重命名失败"
  );
}

/**
 * 重命名目录
 * @param {S3Client} s3Client - S3客户端
 * @param {string} bucketName - 存储桶名称
 * @param {string} oldPath - 旧目录路径
 * @param {string} newPath - 新目录路径
 */
async function renameDirectory(s3Client, bucketName, oldPath, newPath) {
  // 确保路径以斜杠结尾
  const oldPrefix = oldPath.endsWith("/") ? oldPath : oldPath + "/";
  const newPrefix = newPath.endsWith("/") ? newPath : newPath + "/";

  try {
    let continuationToken = undefined;
    let isEmpty = true;

    // 使用循环而非递归处理可能的多页结果
    do {
      // 列出源目录内容
      const listParams = {
        Bucket: bucketName,
        Prefix: oldPrefix,
        ContinuationToken: continuationToken,
      };

      const listCommand = new ListObjectsV2Command(listParams);
      const listResponse = await s3Client.send(listCommand);

      // 检查是否有内容
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        isEmpty = false;

        // 复制所有对象到新位置
        for (const object of listResponse.Contents) {
          const sourceKey = object.Key;
          const targetKey = sourceKey.replace(oldPrefix, newPrefix);

          const copyParams = {
            Bucket: bucketName,
            CopySource: encodeURIComponent(bucketName + "/" + sourceKey),
            Key: targetKey,
          };

          const copyCommand = new CopyObjectCommand(copyParams);
          await s3Client.send(copyCommand);

          // 删除原对象
          const deleteParams = {
            Bucket: bucketName,
            Key: sourceKey,
          };

          const deleteCommand = new DeleteObjectCommand(deleteParams);
          await s3Client.send(deleteCommand);
        }
      }

      // 更新令牌用于下一次循环
      continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    // 如果整个过程中没有找到任何对象，则认为目录不存在
    if (isEmpty) {
      throw new HTTPException(ApiStatus.NOT_FOUND, { message: "源目录不存在或为空" });
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(ApiStatus.INTERNAL_ERROR, { message: "重命名目录失败: " + error.message });
  }
}

/**
 * 批量删除文件或目录
 * @param {D1Database} db - D1数据库实例
 * @param {Array<string>} paths - 需要删除的路径数组
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<{success: number, failed: Array<{path: string, error: string}>}>} 删除结果
 */
export async function batchRemoveItems(db, paths, userId, userType, encryptionSecret) {
  // 结果统计
  const result = {
    success: 0,
    failed: [],
  };

  // 逐个处理每个路径
  for (const path of paths) {
    try {
      await removeItem(db, path, userId, userType, encryptionSecret);
      result.success++;
    } catch (error) {
      // 记录失败信息
      result.failed.push({
        path,
        error: error instanceof HTTPException ? error.message : error.message || "未知错误",
      });
    }
  }

  return result;
}

/**
 * 从S3获取文件并创建响应
 * 改进版函数，用于从S3获取文件内容并设置适当的头部
 * @param {Object} s3Config - S3配置
 * @param {string} s3SubPath - S3子路径
 * @param {string} fileName - 文件名
 * @param {boolean} isPreview - 是否为预览模式
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Response>} 文件内容响应
 */
async function getFileFromS3(s3Config, s3SubPath, fileName, isPreview, encryptionSecret) {
  // 设置内联或附件模式
  const contentDisposition = `${isPreview ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"`;

  try {
    // 创建S3客户端
    const { createS3Client } = await import("../utils/s3Utils.js");
    const s3Client = await createS3Client(s3Config, encryptionSecret);

    // 获取对象内容
    const getParams = {
      Bucket: s3Config.bucket_name,
      Key: s3SubPath,
    };

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand(getParams);
    const response = await s3Client.send(command);

    // 构建响应头
    const headers = {
      "Content-Type": response.ContentType || "application/octet-stream",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, max-age=0",
      // 添加必要的CORS头部
      "Access-Control-Allow-Origin": "*", // 在路由层会被替换为实际的Origin
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Content-Length, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Disposition, ETag",
    };

    // 如果有Content-Length，添加到头部
    if (response.ContentLength !== undefined) {
      headers["Content-Length"] = String(response.ContentLength);
    }

    // 如果有Last-Modified，添加到头部
    if (response.LastModified) {
      headers["Last-Modified"] = response.LastModified.toUTCString();
    }

    // 如果有ETag，添加到头部
    if (response.ETag) {
      headers["ETag"] = response.ETag;
    }

    // 返回包含文件内容的响应
    return new Response(response.Body, {
      status: 200,
      headers: headers,
    });
  } catch (error) {
    console.error(`${isPreview ? "预览" : "下载"}文件出错:`, error);

    // 处理不同类型的错误
    if (error.$metadata && error.$metadata.httpStatusCode === 404) {
      throw new HTTPException(ApiStatus.NOT_FOUND, { message: "文件不存在" });
    } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
      throw new HTTPException(ApiStatus.FORBIDDEN, { message: "没有权限访问该文件" });
    }

    throw new HTTPException(ApiStatus.INTERNAL_ERROR, { message: `${isPreview ? "预览" : "下载"}文件失败: ${error.message || "未知错误"}` });
  }
}

/**
 * 获取文件预签名下载URL
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件路径
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @param {number} expiresIn - URL过期时间（秒），默认为7天
 * @param {boolean} forceDownload - 是否强制下载（而非预览）
 * @returns {Promise<Object>} 包含预签名URL的对象
 */
export async function getFilePresignedUrl(db, path, userId, userType, encryptionSecret, expiresIn = 604800, forceDownload = false) {
  return handleFsError(
      async () => {
        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 仅允许S3类型的挂载点
        if (mount.storage_type !== "S3") {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "当前路径不支持生成预签名URL" });
        }

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 确保路径指向文件而非目录
        if (path.endsWith("/")) {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "无法为目录生成预签名URL" });
        }

        // 规范化S3子路径 (不添加斜杠，因为是文件)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        // 获取文件名
        const fileName = path.split("/").filter(Boolean).pop() || "file";

        // 生成预签名URL
        const { generatePresignedUrl } = await import("../utils/s3Utils.js");
        const presignedUrl = await generatePresignedUrl(s3Config, s3SubPath, encryptionSecret, expiresIn, forceDownload);

        // 构建响应对象
        return {
          path: path,
          name: fileName,
          presignedUrl: presignedUrl,
          expiresIn: expiresIn,
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          forceDownload: forceDownload,
          mount_id: mount.id,
          storage_type: mount.storage_type,
        };
      },
      "获取文件预签名URL",
      "获取文件预签名URL失败"
  );
}

/**
 * 更新文件内容
 * @param {D1Database} db - D1数据库实例
 * @param {string} path - 文件路径
 * @param {string|ArrayBuffer} content - 新的文件内容
 * @param {string} userId - 用户ID
 * @param {string} userType - 用户类型 (admin 或 apiKey)
 * @param {string} encryptionSecret - 加密密钥
 * @returns {Promise<Object>} 更新结果
 */
export async function updateFile(db, path, content, userId, userType, encryptionSecret) {
  // 设置文件大小限制 (10MB)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  return handleFsError(
      async () => {
        // 检查内容大小
        if (typeof content === "string" && content.length > MAX_FILE_SIZE) {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "文件内容过大，超过最大限制(10MB)" });
        } else if (content instanceof ArrayBuffer && content.byteLength > MAX_FILE_SIZE) {
          throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "文件内容过大，超过最大限制(10MB)" });
        }

        // 查找挂载点
        const mountResult = await findMountPointByPath(db, path, userId, userType);

        // 处理错误情况
        if (mountResult.error) {
          throw new HTTPException(mountResult.error.status, { message: mountResult.error.message });
        }

        const { mount, subPath } = mountResult;

        // 获取S3配置
        const s3Config = await db.prepare("SELECT * FROM s3_configs WHERE id = ?").bind(mount.storage_config_id).first();
        if (!s3Config) {
          throw new HTTPException(ApiStatus.NOT_FOUND, { message: "存储配置不存在" });
        }

        // 创建S3客户端
        const s3Client = await createS3Client(s3Config, encryptionSecret);

        // 规范化S3子路径 (不添加斜杠，因为是文件)
        const s3SubPath = normalizeS3SubPath(subPath, s3Config, false);

        // 更新最后使用时间
        await updateMountLastUsed(db, mount.id);

        try {
          // 获取文件名
          const fileName = path.split("/").pop();

          // 尝试获取原始文件信息
          let originalMetadata = null;
          try {
            const headParams = {
              Bucket: s3Config.bucket_name,
              Key: s3SubPath,
            };

            const headCommand = new HeadObjectCommand(headParams);
            originalMetadata = await s3Client.send(headCommand);
            console.log("获取到原始文件元数据:", {
              contentType: originalMetadata.ContentType,
              contentLength: originalMetadata.ContentLength,
              lastModified: originalMetadata.LastModified,
            });
          } catch (error) {
            // 如果文件不存在，则记录日志但继续执行
            if (error.$metadata?.httpStatusCode === 404) {
              console.log(`文件 ${s3SubPath} 不存在，将创建新文件`);
            } else {
              console.warn("获取原始文件元数据失败:", error);
            }
          }

          // 准备文件内容
          let fileContent;
          let contentType;

          // 检查content类型并使用fileUtils中的函数确定MIME类型
          if (typeof content === "string") {
            fileContent = content;

            // 使用现有函数获取MIME类型和分组
            const { mimeType, mimeGroup } = getMimeTypeAndGroupFromFile({
              filename: fileName,
              mimetype: originalMetadata?.ContentType || "text/plain",
            });

            // 检查是否为可执行文件或危险文件类型
            if (mimeGroup === MIME_GROUPS.EXECUTABLE) {
              throw new HTTPException(ApiStatus.FORBIDDEN, { message: "不允许更新可执行文件类型" });
            }

            contentType = mimeType;
            console.log(`文件 ${fileName} 的MIME类型确定为: ${contentType}, 分组: ${mimeGroup}`);
          } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
            fileContent = content;

            // 对于二进制内容，尝试从文件名和原始元数据确定类型
            const { mimeType, mimeGroup } = getMimeTypeAndGroupFromFile({
              filename: fileName,
              mimetype: originalMetadata?.ContentType || "application/octet-stream",
            });

            // 检查是否为可执行文件或危险文件类型
            if (mimeGroup === MIME_GROUPS.EXECUTABLE) {
              throw new HTTPException(ApiStatus.FORBIDDEN, { message: "不允许更新可执行文件类型" });
            }

            contentType = mimeType;
            console.log(`二进制文件 ${fileName} 的MIME类型确定为: ${contentType}, 分组: ${mimeGroup}`);
          } else {
            throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "不支持的内容格式" });
          }

          // 更新S3对象
          const putParams = {
            Bucket: s3Config.bucket_name,
            Key: s3SubPath,
            Body: fileContent,
            ContentType: contentType,
          };

          // 如果有原始元数据，尝试保留某些元数据
          if (originalMetadata) {
            // 可以选择性地保留某些元数据
            if (originalMetadata.Metadata) {
              putParams.Metadata = originalMetadata.Metadata;
            }
          }

          console.log(`准备更新S3对象: ${s3SubPath}, 内容类型: ${contentType}`);
          const putCommand = new PutObjectCommand(putParams);
          const result = await s3Client.send(putCommand);

          // 清除文件缓存
          if (mount.cache_ttl > 0) {
            // 清除父目录缓存
            if (subPath !== "/" && subPath.includes("/")) {
              const parentSubPath = subPath.substring(0, subPath.lastIndexOf("/") + 1);
              const invalidatedCount = directoryCacheManager.invalidatePathAndAncestors(mount.id, parentSubPath);
              console.log(`更新文件后缓存已刷新（包含所有父路径）：挂载点=${mount.id}, 路径=${parentSubPath}, 清理了${invalidatedCount}个缓存条目`);
            }
          }

          // 返回更新结果
          return {
            success: true,
            path: path,
            etag: result.ETag ? result.ETag.replace(/"/g, "") : undefined,
            contentType: contentType,
            message: "文件更新成功",
            isNewFile: !originalMetadata,
          };
        } catch (error) {
          console.error("更新文件错误:", error);

          // 增强错误处理
          if (error.$metadata) {
            if (error.$metadata.httpStatusCode === 404) {
              throw new HTTPException(ApiStatus.NOT_FOUND, { message: "文件不存在" });
            } else if (error.$metadata.httpStatusCode === 403) {
              throw new HTTPException(ApiStatus.FORBIDDEN, { message: "没有权限更新该文件" });
            } else if (error.$metadata.httpStatusCode === 413) {
              throw new HTTPException(ApiStatus.BAD_REQUEST, { message: "文件内容过大" });
            }

            // 记录详细错误信息
            console.error("S3错误详情:", {
              errorName: error.name,
              errorMessage: error.message,
              errorCode: error.$metadata?.httpStatusCode,
              s3Path: s3SubPath,
            });
          }

          throw error;
        }
      },
      "更新文件",
      "更新文件失败"
  );
}
