/**
 * WebDAV工具函数
 */
import { enhancedPathSecurity } from "../../storage/fs/utils/PathResolver.js";

/**
 * 解析目标路径
 * WebDAV特有功能：处理WebDAV的Destination头，包含WebDAV特有的路径前缀处理
 * @param {string} destination - 目标路径头
 * @returns {string|null} 规范化的目标路径或null（如果无效）
 */
export function parseDestinationPath(destination) {
  if (!destination) {
    return null;
  }

  let destPath;
  try {
    // 尝试从完整URL中提取路径
    const url = new URL(destination);
    destPath = url.pathname;
  } catch (error) {
    // 如果不是完整URL，直接使用值作为路径
    destPath = destination;
  }

  // 处理WebDAV路径前缀
  if (destPath.startsWith("/dav/")) {
    destPath = destPath.substring(4); // 移除"/dav"前缀
  } else if (destPath.startsWith("/dav")) {
    destPath = destPath.substring(4); // 移除"/dav"前缀
  }

  // 使用增强的路径安全检查
  const securityResult = enhancedPathSecurity(destPath, {
    allowDotDot: false,
    strictCharCheck: true,
  });

  if (securityResult.error) {
    console.warn(`WebDAV安全警告: ${securityResult.error}`);
    return null;
  }

  return securityResult.path;
}
