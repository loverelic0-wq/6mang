/* 固定版本本地依赖：离线导出，不发送图层到服务器。 */
importScripts("./vendor/ag-psd/bundle.js");

self.onmessage = ({ data }) => {
  try {
    const bytes = agPsd.writePsdUint8Array(data, {
      noBackground: true,
      generateThumbnail: false,
      trimImageData: false,
      compress: false,
    });
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: `PSD 文件生成失败：${error.message || "请重试"}` });
  }
};
