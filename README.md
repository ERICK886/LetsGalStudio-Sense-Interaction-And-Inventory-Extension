# 场景交互系统



---

> 这是一个 AVG+ Light Engine **扩展**。
> 一个类同时承担 UI、可调用方法、存档字段、项目设置 —— 用统一基类 `Extension`。
> 它通过 React 组件渲染到游戏舞台,可以读取宿主提供的角色 / 对话 / 变量等数据。

## 目录结构

```
src/
  index.tsx         扩展入口 - 导出 Extension 子类(WelcomeExtension)
  welcome-ui.tsx    视觉组件 - 默认的 Welcome 画面
extension.json      manifest - id / 版本 / sdkVersion
vite.config.ts      build 配置 - lib 模式 ESM 输出
sdk/                @avg-studio/sdk 源码副本 - npm install 会 symlink
```

## 开发流程

```bash
npm install           # 安装 react / vite + 建立 sdk symlink
npm run watch         # 监听 src/ 改动并增量 build 到 dist/
```

Studio 的 Preview 会自动接住 `dist/index.js` 的更新(约 200ms 延迟)。
单次 build:`npm run build`。

## 关键概念

- **Extension 子类**:一个类 = 一个完整子模块。身份用 `@extension({ id, label })`
  装饰器声明;`id` 在剧本里以 `<扩展id>/<id>` 被引用,是稳定标识。
- **render()**:实现了就有界面,Action block「显示界面」会列出来。不实现 = 纯方法模块。
- **ctx (ExtensionContext)**:通过 `useExtensionContext()` 拿到的 SDK 入口,
  暴露 story / character / dialogue / variables / archive 等 namespace。
- **props**:从剧本的「显示界面」block 传入,通过 `this.data` 在 `render()` 里拿到。

## 下一步

- 多个子模块:在 src/index.tsx 再加一个 `@extension({...}) export class XxxExtension extends Extension<...>`
- 暴露给「调用方法」block:加 `static greet = method({ title, schema, async run(ctx, params) {...} })`
- 持久化数据:加 `static saveSchema = defineSave({ ... })`,this.save 自动可读写
- 项目设置:加 `static settings = settings(s => ({ ... }))`,在 Studio 项目设置里可见
- 完整 SDK 文档:Studio 顶部 · 帮助 · SDK 手册
