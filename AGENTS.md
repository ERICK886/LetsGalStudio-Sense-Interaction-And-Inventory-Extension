# 场景交互及物品栏扩展 Agent 规范

本文件适用于本仓库全部目录。回答和提交摘要使用中文；新增文件默认使用 kebab-case，`AGENTS.md`、`README.md` 等固定文件名保持原样。

## 开始工作

- 先读 `README.md`、`package.json`、`extension.json` 和涉及模块的源码，再确认 `git status --short --branch`。不要把其他分支或旧记录当成当前事实。
- 保留已有未提交文件和未跟踪文件。只修改任务相关路径；不要用 `git reset --hard`、`git clean` 或全量暂存处理脏工作区。需要破坏性恢复时，先做完整备份并取得本次明确授权。
- `sdk/`、`node_modules/` 和 `dist/` 是本地依赖或构建产物，不能把它们当作业务源码直接修补。

## 模块与数据边界

- 包 ID `ink.zenly.ext-27b96b` 与模块 ID `editor`、`scene-interaction`、`backpack-hud`、`backpack` 是不同层级的稳定契约。修改 ID、方法名、设置键或存档字段前，先查所有调用和旧数据兼容路径。
- `editor` 的作者数据通过 settings 持久化；运行时通过 `settings.cross` 读取。玩家库存、进度、当前场景、主场景和返回栈属于 `scene-interaction` 的 slot 存档。快捷栏和全屏背包共用同一库存，不得创建第二份权威数据。
- 编辑器“运行预览”的存档是沙箱；`inventoryJson`、`progressJson` 不得写进作者 settings，也不得覆盖玩家 slot。改预览、保存或重挂逻辑时同时检查这一边界。
- 运行时问题沿“编辑器配置 → 方法或交互点动作 → UI 显示/关闭 → 会话桥 → slot 写回”追踪；涉及返回栈、片段跳转、阻塞结束时检查完整生命周期，不只验证按钮点击。
- 资源路径优先使用 SDK 的解析接口；编辑器、运行时和打包后的资源访问都要能成立。不要用开发机绝对路径作为插件数据。

## 界面与构建

- 编辑器控件使用本仓库依赖的 Chakra UI，并保持 Provider/样式变量局限于编辑器根节点。玩家 HUD、场景叠层和背包的点击穿透、层级及透明背景按运行时需求处理，不把编辑器样式注入玩家界面。
- 保留现有信息架构、键盘与焦点操作，并检查浅色和深色模式。界面调整应走真实的设置、存档和渲染路径，不能只改外观。
- Vite 输出必须仍是 `dist/index.mjs` 单文件；React、React DOM、JSX runtime 与 `@avg-studio/sdk` 继续由宿主提供。修改依赖或构建配置后，核对产物不存在未被宿主解析的裸导入。
- 优先执行相关的定向验证，再运行 `node node_modules/vite/bin/vite.js build` 与 `git diff --check`。可用 `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` 检查类型；若有失败，逐项区分本次引入与原有问题并报告。
- 游戏行为要在剧本 Preview 的真实调用链验证；单独打开扩展预览不能证明阻塞方法、玩家存档或返回栈正确。

## Studio、本地状态与交付

- 不得自行启动或重启 Studio、Electron 或 AVG Player；界面验证只能复用已确认的用户实例。不得清理或覆盖 Studio 登录态、许可证、userData、项目存档及安装中的扩展副本。
- 本仓库构建不等于安装或发布。修改版本时同步核对 `package.json` 与 `extension.json`，构建后检查入口产物；安装目录、项目快照、市场包和线上渠道只有在本次任务明确涉及时才修改，先备份再核验加载文件。
- 完成需求改动后只暂存相关路径并提交；提交前参考 `git log --oneline -20` 的格式。未经本次明确授权，不推送远端、不创建或移动 tag、不发布可被用户自动获取的版本。
- 在 macOS 上不得访问 Keychain；Git/SSH/签名/打包不得触发钥匙串或自动凭证发现，认证受此限制失败时停止并报告。
