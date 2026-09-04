(function initVideoPolling(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VideoPolling = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVideoPolling() {
  const retryableStatuses = new Set([404, 429, 502, 503, 504]);

  function isCprtProvider(provider) {
    return /(?:^|\.)cprt\.xyz(?:\/|$)/i.test(String(provider?.baseUrl || ""));
  }

  function policyFor(providerId, provider) {
    if (providerId === "kling-cli" || provider?.adapter === "kling-cli") {
      return { initialDelayMs: 0, intervalMs: 5000, maxAttempts: 180 };
    }
    if (isCprtProvider(provider)) {
      return { initialDelayMs: 10000, intervalMs: 10000, maxAttempts: 120 };
    }
    return { initialDelayMs: 0, intervalMs: 5000, maxAttempts: 24 };
  }

  function isRetryableError(error) {
    const message = String(error?.message || "");
    if (/任务失败|未扣金额|审核|余额不足|未授权|参数错误/i.test(message)) return false;
    const status = Number(error?.statusCode ?? error?.status);
    if (retryableStatuses.has(status)) return true;
    return /任务不存在|任务未找到|请求过于频繁|稍后重试|fetch failed|network|timeout|timed out/i.test(message);
  }

  return { isCprtProvider, policyFor, isRetryableError };
});
