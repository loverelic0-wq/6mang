# ag-psd 浏览器导出组件

- 固定版本：31.0.2（MIT，见 LICENSE）
- 上游：https://github.com/Agamnentzar/ag-psd
- 包来源：https://registry.npmjs.org/ag-psd/-/ag-psd-31.0.2.tgz
- npm SHA-512：`5s5PvqbomPIIJ9YjL6robz55rT4RYPiQkww4brisyZEb5jzlHB1EKh47IJg7gIFj0RUrD0cMgdntM907qaZjXA==`
- 内含依赖许可：`LICENSE-base64-js`（1.5.1）、`LICENSE-pako`（2.1.0）；JPEG 解码器的 Apache 2.0 声明保留于 bundle，完整文本见 `LICENSE-jpeg-apache-2.0.txt`。

`bundle.js` 复制自包内 `dist/bundle.js`，只在导出 Worker 中按需加载。
部署无需安装 npm 包、构建或连接 CDN。升级时整体替换并重新验证图层叠放顺序。

## 本地修复（2026-09-15）

PSD writer 的 `maxBufferSize` 行将合成图 RLE 行长度表预算从 `2 * height`
改为 `8 * height`，覆盖 RGBA 四个通道（每行每通道 2 字节）。上游原值会使
1 / 2 像素宽的透明文档缓冲区不足，导致合成预览 alpha 截断。
这是唯一源码补丁，专项测试覆盖多种窄图尺寸的透明通道往返读取。
