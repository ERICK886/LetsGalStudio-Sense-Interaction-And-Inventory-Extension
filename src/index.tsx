import { Extension, extension, type ExtensionRenderData } from "@avg-studio/sdk";
import { WelcomeUI, type WelcomeUIProps } from "./welcome-ui";

/**
 * 扩展入口。
 *
 * 一个扩展项目里可以有多个 Extension 子类(对应多个子模块);default export 是
 * 默认子模块,其它通过 named export 暴露给宿主。
 *
 * 命名约定:类用 `XxxExtension` 后缀,对应的 React 组件叫 `Xxx` ——
 * 类是"宿主契约入口",组件是"视觉实现",同一文件里 import 不撞名。
 *
 * @extension 装饰器声明身份:
 *   - id    : 剧本里引用的稳定 id(不怕重命名 class 后剧本里的引用失效)
 *   - label : Studio 选择器里展示的友好名
 *
 * Extension 还能做更多 —— 一个类同时包含 UI、可调用方法、存档字段、项目设置:
 *   - 想暴露给 Action block「调用方法」: 加 `static xxx = method({...})`
 *   - 想存档跟随玩家进度:                  加 `static saveSchema = defineSave({...})`
 *   - 想加项目设置:                          加 `static settings = settings(s => ({...}))`
 * 详见 SDK 文档。
 */
@extension({ id: "welcome", label: "Welcome 画面" })
class WelcomeExtension extends Extension<WelcomeUIProps> {
  render(): ExtensionRenderData<WelcomeUIProps> {
    // this.data 是剧本里「显示界面」传过来的 props,可能为 undefined
    // (从 Studio 扩展预览 Tab 进来时就是空的)。这里给个默认 title。
    return {
      component: WelcomeUI,
      props: this.data ?? { title: "场景交互系统" },
    };
  }
}

export default WelcomeExtension;
