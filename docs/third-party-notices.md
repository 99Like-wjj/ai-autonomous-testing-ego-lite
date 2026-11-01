# 第三方文件读取依赖

0.1.8 开发版通过构建生成 vendor/file-readers.mjs。运行时使用该明确列入完整性清单的 bundle，不执行 npm install。

直接运行依赖为 csv-parse 7.0.3（MIT）及 read-excel-file 9.3.14（MIT）；esbuild 0.28.2（MIT）仅作构建工具。确切的传递依赖、版本和 registry integrity 由源码 package-lock.json 锁定。

打包使用 inline legal comments 保留依赖声明，不删除其中的版权和许可文字。构建/交付时同时核对 bundle 与本说明；相关公开源码可从 [csv-parse](https://www.npmjs.com/package/csv-parse)、[read-excel-file](https://www.npmjs.com/package/read-excel-file)、[esbuild](https://www.npmjs.com/package/esbuild) 获取。

构建还生成 vendor/THIRD-PARTY-LICENSES.txt，列出实际 bundle 输入包版本及完整许可文本，并纳入完整性清单。worker-f 0.1.21 的 npm 包声明 MIT/作者但未附独立许可文件，使用源码 docs/third-party-licenses/worker-f-0.1.21.txt 中明确标注来源的标准许可文本，不推断版权年份。

依赖审计只反映当次已知公告，不能认证输入安全、文件内容正确或业务结论成立。读取范围、精度及格式限制由实际工具输出说明。
