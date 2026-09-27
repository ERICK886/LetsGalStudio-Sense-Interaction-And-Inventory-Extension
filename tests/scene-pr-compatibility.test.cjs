const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));

// 将真实领域/存档模块一起编译，保持共享状态；SDK 由宿主提供，不加载本地 SDK 源码。
const root = path.resolve(__dirname, '..');
const entries = {
  progress: 'domain/progress', serialize: 'domain/serialize', visual: 'domain/hotspot-visual',
  imageSize: 'shared/hotspot-image-size', layout: 'shared/scene-layout', actions: 'domain/actions',
  hud: 'store/scene-hud-visibility', preview: 'store/preview-save', slot: 'store/slot-save-bridge',
  saveSync: 'store/save-sync', settingsSync: 'store/settings-sync', target: 'store/open-scene-target',
  hotspotSchema: 'schema/hotspot-schema', sceneSchema: 'schema/scene-schema',
  projectImages: 'editor/project-image-resources',
  hudSettings: 'store/hud-settings', visualHud: 'runtime/visual-inventory-hud',
  inventorySession: 'store/inventory-session', reactHud: 'backpack/hud-shell.tsx',
  theme: 'theme/theme-provider.tsx',
};
const code = esbuild.buildSync({
  stdin: {
    contents: Object.entries(entries).map(([name, file]) => `export * as ${name} from './src/${file.endsWith('.tsx') ? file : file + '.ts'}';`).join('\n'),
    resolveDir: root, sourcefile: 'scene-pr-compatibility-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', '@avg-studio/sdk'], logLevel: 'silent',
}).outputFiles[0].text;
const compiled = new Module(path.join(__dirname, 'scene-pr-compatibility-bundle.cjs'), module);
compiled.filename = compiled.id;
compiled.paths = Module._nodeModulePaths(root);
const originalRequire = compiled.require.bind(compiled);
let currentTestContext;
compiled.require = name => name === '@avg-studio/sdk'
  ? { useExtensionContext() {
    if (!currentTestContext) throw new Error('这些回归不应依赖真实 Studio 实例');
    return currentTestContext;
  } }
  : originalRequire(name);
compiled._compile(code, compiled.filename);
const { progress, serialize, visual, imageSize, layout, actions, hud, preview, slot,
  saveSync, settingsSync, target, hotspotSchema, sceneSchema, projectImages,
  hudSettings, visualHud, inventorySession, reactHud, theme } = compiled.exports;
const scene = (id, hotspots = [], extra = {}) => serialize.parseScenesLibraryJson(JSON.stringify({
  version: 1, scenes: [{ id, name: id, baseImage: '', hotspots, ...extra }],
})).scenes[0];
const hotspot = (id, extra = {}) => scene('room', [{ id, visual: { kind: 'image', src: '' }, ...extra }]).hotspots[0];
const rect = { width: 1000, height: 500 };
const fields = nodes => nodes.flatMap(node => node.children ? fields(node.children) : [node]);

test('普通点各完成一次才解锁，解锁点不互为前置', () => {
  const a = hotspot('a'), b = hotspot('b');
  const door = hotspot('door', { showAfterAllOthers: true });
  const exit = hotspot('exit', { showAfterAllOthers: true });
  const points = [a, b, door, exit];
  const initial = { consumed: {} };
  assert.equal(progress.isHotspotVisible(door, initial, undefined, points), false);
  const one = progress.markHotspotInteracted(initial, a);
  assert.equal(progress.isHotspotVisible(door, one, undefined, points), false);
  const all = progress.markHotspotInteracted(one, b);
  assert.equal(progress.isHotspotVisible(door, all, undefined, points), true);
  assert.equal(progress.isHotspotVisible(exit, all, undefined, points), true);
  assert.deepEqual(initial, { consumed: {} });
});

test('旧存档已消耗的点算完成，其他场景的点不影响解锁', () => {
  const door = hotspot('door', { showAfterAllOthers: true });
  const a = hotspot('a', { once: true });
  const saved = serialize.parseProgressJson('{"consumed":{"a":true,"other-scene":false}}');
  assert.equal(progress.isHotspotVisible(door, saved, undefined, [a, door]), true);
  assert.equal(progress.isHotspotVisible(door, { consumed: {} }, undefined, [door]), true);
});

test('完成条件与本地变量条件、显隐覆盖、once 共同生效', () => {
  const a = hotspot('a');
  const door = hotspot('door', { once: true, showAfterAllOthers: true, visibleIf: {
    logic: 'all', conditions: [{ source: 'game', target: 'score', valueType: 'number', operator: 'gte', value: 2 }],
  } });
  const state = progress.markHotspotInteracted({ consumed: {} }, a);
  assert.equal(progress.isHotspotVisible(door, state, () => 1, [a, door]), false);
  assert.equal(progress.isHotspotVisible(door, state, () => 2, [a, door]), true);
  assert.equal(progress.isHotspotVisible(door, { ...state, visibility: { door: false } }, () => 2, [a, door]), false);
  assert.equal(progress.isHotspotVisible(door, { consumed: {}, visibility: { door: true } }, () => 2, [a, door]), false);
  assert.equal(progress.isHotspotVisible(door, progress.markHotspotInteracted(state, door), () => 2, [a, door]), false);
  assert.equal(progress.isHotspotVisible(hotspot('legacy'), { consumed: {} }, () => undefined), true);
});

test('完成进度经 JSON 存档读回，显隐覆盖保持不变', () => {
  const a = hotspot('a', { once: true });
  const original = { consumed: {}, visibility: { hidden: false } };
  const updated = progress.markHotspotInteracted(original, a);
  const restored = serialize.parseProgressJson(serialize.stringifyProgress(updated));
  assert.deepEqual(restored, { consumed: { a: true }, interacted: { a: true }, visibility: { hidden: false } });
  assert.deepEqual(original, { consumed: {}, visibility: { hidden: false } });
});

test('底图 contain/cover 使用一致坐标参照', () => {
  const contain = layout.contentRectForBase(1000, 500, 1000, 1000, 'contain');
  const cover = layout.contentRectForBase(1000, 500, 1000, 1000, 'cover');
  assert.deepEqual(contain, { originX: 250, originY: 0, width: 500, height: 500 });
  assert.deepEqual(cover, { originX: 0, originY: -250, width: 1000, height: 1000 });
  assert.deepEqual(layout.normToWorld(0.5, 0.5, cover), { x: 500, y: 250 });
  assert.deepEqual(layout.contentRectForBase(1000, 500, 0, 0, 'cover'), { originX: 0, originY: 0, width: 1000, height: 500 });
});

test('旧图片框迁移保持实际图像大小，不退回 64 像素', () => {
  const hs = hotspot('image', { visual: { kind: 'image', src: 'ui/image.png', width: 100, height: 100 } });
  const natural = { width: 400, height: 200 };
  assert.equal(visual.normalizeHotspotSize(hs, rect), hs);
  const migrated = visual.normalizeHotspotSize(hs, rect, natural);
  assert.equal(migrated.visual.width, undefined);
  assert.equal(migrated.visual.height, undefined);
  assert.deepEqual(visual.hotspotDisplaySize(migrated, rect, natural), { width: 100, height: 50 });
  assert.deepEqual(visual.hotspotDisplaySize(migrated, { width: 2000, height: 1000 }, natural), { width: 200, height: 100 });
  assert.equal(visual.normalizeHotspotSize(migrated, rect, natural), migrated);
});

test('未配置尺寸的图片先用原尺寸，再保存比例；无效底图不迁移', () => {
  const hs = hotspot('image', { visual: { kind: 'image', src: 'ui/image.png' } });
  const natural = { width: 300, height: 150 };
  assert.equal(visual.normalizeHotspotSize(hs, rect), hs);
  assert.deepEqual(visual.hotspotDisplaySize(hs, rect, natural), natural);
  const migrated = visual.normalizeHotspotSize(hs, rect, natural);
  assert.equal(migrated.visual.widthRatio, 0.3);
  assert.equal(migrated.visual.heightRatio, 0.3);
  assert.equal(visual.normalizeHotspotSize(hs, { width: 0, height: 0 }, natural), hs);
  assert.deepEqual(hs.visual, { kind: 'image', src: 'ui/image.png', placeholderColor: '#2EC4A4', placeholderOpacity: 0.18, placeholderShape: 'square' });
});

test('无图点保持正方形，颜色透明度和圆形可保存', () => {
  const hs = hotspot('circle', { visual: { kind: 'image', src: '', widthRatio: 0.1, heightRatio: 0.9,
    placeholderColor: '#123456', placeholderOpacity: 0.4, placeholderShape: 'circle' } });
  assert.deepEqual(visual.hotspotDisplaySize(hs, rect), { width: 100, height: 100 });
  assert.equal(visual.placeholderBackground(hs.visual), 'rgba(18, 52, 86, 0.4)');
  assert.equal(visual.placeholderBorderRadius(hs.visual), '50%');
});

test('换图清除旧尺寸与比例，但保留无图外观设置', () => {
  const old = { kind: 'image', src: 'a.png', width: 80, height: 40, widthRatio: 0.08, heightRatio: 0.08,
    placeholderColor: '#123456', placeholderOpacity: 0.4, placeholderShape: 'circle' };
  assert.equal(imageSize.resetSizeForHotspotImageChange(old, old), old);
  assert.deepEqual(imageSize.resetSizeForHotspotImageChange(old, { ...old, src: 'b.png' }), {
    kind: 'image', src: 'b.png', placeholderColor: '#123456', placeholderOpacity: 0.4, placeholderShape: 'circle',
  });
});

test('新字段与本地变量动作、条件和工程资源路径同时序列化', () => {
  const original = scene('room', [{ id: 'a', showAfterAllOthers: true,
    visual: { kind: 'image', src: 'ui/a.png', widthRatio: 0.2, heightRatio: 0.1 },
    visibleIf: { logic: 'all', conditions: [{ source: 'game', target: 'ready', valueType: 'bool', operator: 'truthy' }] },
    actions: [{ type: 'editVariable', source: 'game', target: 'score', valueType: 'number', operator: 'add', value: 1 }],
  }], { baseImage: 'scene/bg.png', baseImageFit: 'cover', showQuickbar: false, showOpenBagButton: true });
  const restored = serialize.parseScenesLibraryJson(serialize.stringifyScenesLibrary({ version: 1, scenes: [original] })).scenes[0];
  assert.deepEqual(restored, original);
  assert.equal(restored.hotspots[0].visibleIf.conditions[0].target, 'ready');
  assert.equal(restored.hotspots[0].actions[0].type, 'editVariable');
  assert.equal(restored.hotspots[0].visual.src, 'ui/a.png');
  assert.deepEqual(hud.sceneHudVisibility(scene('legacy')), { showQuickbar: true, showOpenBagButton: true });
});

test('场景 HUD 读取权威 slot，场景切换和作者设置变更刷新并能取消订阅', () => {
  const data = { scenesLibraryJson: serialize.stringifyScenesLibrary({ version: 1, scenes: [
    scene('a', [], { showQuickbar: false, showOpenBagButton: true }),
    scene('b', [], { showQuickbar: true, showOpenBagButton: false }),
  ] }) };
  const ctx = { settings: { get: key => data[key], cross: { get: (_, key) => data[key] } } };
  const save = preview.createPreviewSave({ currentSceneId: 'a' });
  slot.registerSlotSave(save, { authoritative: true });
  assert.deepEqual(hud.readSceneHudVisibility(ctx), { showQuickbar: false, showOpenBagButton: true });
  let calls = 0;
  const off = hud.subscribeSceneHudVisibility(() => calls++);
  slot.writeSlotField('currentSceneId', 'b');
  assert.deepEqual(hud.readSceneHudVisibility(ctx), { showQuickbar: true, showOpenBagButton: false });
  settingsSync.notifySettingsField('scenesLibraryJson');
  target.setForcedOpenSceneId('b');
  assert.equal(calls, 3);
  off();
  saveSync.notifySaveField('currentSceneId');
  assert.equal(calls, 3);
});

test('预览进度保存不覆盖玩家 slot，也不写作者 settings', () => {
  const player = preview.createPreviewSave();
  slot.registerSlotSave(player, { authoritative: true });
  player.set('progressJson', '{"consumed":{"player":true}}');
  const writes = [];
  const ctx = { settings: { get: () => undefined, set: (...args) => writes.push(args), cross: { get: () => undefined, set: (...args) => writes.push(args) } } };
  const sandbox = preview.createSettingsPreviewSave(ctx, { currentSceneId: 'a' });
  writes.length = 0;
  sandbox.set('progressJson', '{"consumed":{},"interacted":{"a":true}}');
  sandbox.set('inventoryJson', '{"entries":[]}');
  assert.deepEqual(writes, []);
  assert.equal(player.get('progressJson'), '{"consumed":{"player":true}}');
  assert.equal(JSON.parse(sandbox.get('progressJson')).interacted.a, true);
});

test('实际动作链扣物失败中断，成功动作仍按序执行变量修改与继续剧情', async () => {
  const called = [];
  const runtime = { removeItem: () => ({ ok: false, displayName: '钥匙', reason: '不足' }),
    enqueueToast: () => {}, warn: () => {}, editVariable: () => called.push('variable'), continueStory: () => called.push('story') };
  const result = await actions.executeSceneActions([
    { type: 'removeItem', itemId: 'key', amount: 1 }, { type: 'continueStory' },
  ], 'a', runtime);
  assert.equal(result.aborted, true);
  assert.deepEqual(called, []);
  const success = await actions.executeSceneActions([
    { type: 'editVariable', target: 'score' }, { type: 'continueStory' },
  ], 'a', runtime);
  assert.equal(success.aborted, false);
  assert.deepEqual(called, ['variable', 'story']);
});

test('编辑 schema 同时提供新字段与原有资源入口', () => {
  const hs = hotspot('a');
  const keys = fields(hotspotSchema.hotspotFields(hs)).map(field => field.key);
  assert.ok(keys.includes('showAfterAllOthers'));
  assert.ok(keys.includes('visual.widthRatio'));
  assert.ok(keys.includes('visual.placeholderColor'));
  assert.ok(!keys.includes('visual.heightRatio'));
  const sceneKeys = fields(sceneSchema.sceneFields(scene('a'))).map(field => field.key);
  for (const key of ['baseImage', 'baseImageFit', 'showQuickbar', 'showOpenBagButton']) assert.ok(sceneKeys.includes(key));
});

test('保留 Studio 工程清单读取与非法资源路径过滤', async () => {
  const manifest = { version: 1, entries: {
    ['a'.repeat(32)]: { path: 'ui/a.png' },
    ['b'.repeat(32)]: { path: '../outside.png' },
    ['c'.repeat(32)]: { path: 'https://example.com/a.png' },
    ['d'.repeat(32)]: { path: 'C:/private/a.png' },
  } };
  let requested;
  const resources = await projectImages.readProjectImageResources({ resolve(uri) {
    assert.equal(uri, '.manifest.json');
    return { url: 'asset://project/.manifest.json' };
  } }, undefined, async (url, options) => {
    requested = { url, options };
    return { ok: true, status: 200, json: async () => manifest };
  });
  assert.equal(requested.options.cache, 'no-store');
  assert.deepEqual(resources, [{ id: 'a'.repeat(32), path: 'ui/a.png', name: 'a.png' }]);
});


function hudContext(author = {}, hudData = {}, local = {}) {
  return { settings: {
    get: key => local[key],
    useValue: key => [local[key]],
    cross: {
      get: (owner, key) => (owner === 'backpack-hud' ? hudData : author)[key],
      set: (owner, key, value) => {
        assert.equal(owner, 'backpack-hud');
        hudData[key] = value;
      },
    },
  } };
}

test('全局按钮开关属于 backpack-hud，跨模块 false 优先，旧项目默认显示', () => {
  const data = {};
  const ctx = hudContext({}, data, { showOpenBagButton: true });
  assert.equal(hudSettings.readShowOpenBagButton(hudContext()), true);
  hudSettings.writeHudSetting(ctx, hudSettings.SHOW_OPEN_BAG_BUTTON_KEY, false);
  assert.equal(data.showOpenBagButton, false);
  assert.equal(hudSettings.readShowOpenBagButton(ctx), false);
  hudSettings.writeHudSetting(ctx, hudSettings.SHOW_OPEN_BAG_BUTTON_KEY, true);
  assert.equal(hudSettings.readShowOpenBagButton(ctx), true);
});

test('全局关闭覆盖场景按钮设置，缺少场景也隐藏，不改变快捷栏', () => {
  for (const current of [scene('a'), scene('b', [], { showOpenBagButton: true }), null]) {
    assert.deepEqual(hud.sceneHudVisibility(current, false), { showQuickbar: true, showOpenBagButton: false });
  }
  assert.deepEqual(hud.sceneHudVisibility(scene('c', [], { showQuickbar: false }), false), {
    showQuickbar: false, showOpenBagButton: false,
  });
  assert.equal(hud.sceneHudVisibility(scene('d', [], { showOpenBagButton: false }), true).showOpenBagButton, false);
  assert.equal(hud.readSceneHudVisibility(hudContext({}, { showOpenBagButton: false })).showOpenBagButton, false);
});

test('已打开 Visual HUD 切换全局开关即时刷新，库存不变且关闭时解除订阅', () => {
  const author = {
    itemsLibraryJson: '{"version":1,"items":[]}',
    scenesLibraryJson: serialize.stringifyScenesLibrary({ version: 1, scenes: [scene('visual')] }),
  };
  const data = {};
  const ctx = hudContext(author, data);
  const save = preview.createPreviewSave({ currentSceneId: 'visual' });
  slot.registerSlotSave(save, { authoritative: true });
  const original = inventorySession.getInventorySession();
  const inventory = { entries: [{ kind: 'stack', itemId: 'key', count: 2, lastGainedAt: 1 }] };
  inventorySession.setInventorySession(inventory);
  const savedInventory = save.get('inventoryJson');
  const elements = new Map();
  let updates = 0, onOpen, onClose;
  const view = {
    get(id) {
      if (!elements.has(id)) elements.set(id, {
        hidden: undefined,
        setHidden(value) { this.hidden = value; updates++; },
        setProps() {}, on() { return () => {}; },
      });
      return elements.get(id);
    },
    onClose(callback) { onClose = callback; },
  };
  ctx.visualUI = { onOpen(name, callback) { onOpen = callback; return () => {}; } };
  const unregister = visualHud.registerVisualInventoryHud(ctx);
  try {
    onOpen(view);
    assert.equal(elements.get('open-backpack').hidden, false);
    assert.equal(elements.get('slot-0').hidden, false);
    hudSettings.writeHudSetting(ctx, hudSettings.SHOW_OPEN_BAG_BUTTON_KEY, false);
    settingsSync.notifySettingsField(hudSettings.SHOW_OPEN_BAG_BUTTON_KEY);
    assert.equal(elements.get('open-backpack').hidden, true);
    assert.equal(elements.get('slot-0').hidden, false);
    assert.equal(inventorySession.getInventorySession(), inventory);
    assert.equal(save.get('inventoryJson'), savedInventory);
    hudSettings.writeHudSetting(ctx, hudSettings.SHOW_OPEN_BAG_BUTTON_KEY, true);
    settingsSync.notifySettingsField(hudSettings.SHOW_OPEN_BAG_BUTTON_KEY);
    assert.equal(elements.get('open-backpack').hidden, false);
    onClose();
    const closedUpdates = updates;
    settingsSync.notifySettingsField(hudSettings.SHOW_OPEN_BAG_BUTTON_KEY);
    assert.equal(updates, closedUpdates);
  } finally {
    onClose?.();
    unregister();
    inventorySession.setInventorySession(original);
  }
});

function renderHud(ctx, sceneOverride, mode) {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  currentTestContext = ctx;
  try {
    return renderToStaticMarkup(React.createElement(theme.ThemeProvider, { initialMode: mode },
      React.createElement(reactHud.HudShell, { compactHost: true, scene: sceneOverride })));
  } finally {
    currentTestContext = undefined;
  }
}

test('React 回退实际渲染遵循全局与场景开关，亮暗主题下快捷栏仍保留', () => {
  const author = { scenesLibraryJson: serialize.stringifyScenesLibrary({ version: 1, scenes: [scene('react')] }) };
  const data = {};
  const ctx = hudContext(author, data);
  slot.registerSlotSave(preview.createPreviewSave({ currentSceneId: 'react' }), { authoritative: true });
  for (const mode of ['light', 'dark']) {
    assert.match(renderHud(ctx, undefined, mode), /data-overlay-role="openBag"/);
    data.showOpenBagButton = false;
    const hidden = renderHud(ctx, undefined, mode);
    assert.doesNotMatch(hidden, /data-overlay-role="openBag"/);
    assert.match(hidden, /data-testid="backpack-quickbar-slot"/);
    data.showOpenBagButton = true;
  }
  author.scenesLibraryJson = serialize.stringifyScenesLibrary({ version: 1, scenes: [
    scene('react', [], { showOpenBagButton: false }),
  ] });
  assert.doesNotMatch(renderHud(ctx, undefined, 'dark'), /data-overlay-role="openBag"/);
});

test('运行预览使用显式场景和全局开关，不混入玩家场景按钮状态', () => {
  const author = { scenesLibraryJson: serialize.stringifyScenesLibrary({ version: 1, scenes: [
    scene('player', [], { showOpenBagButton: false }), scene('preview'),
  ] }) };
  const data = {};
  const ctx = hudContext(author, data);
  const player = preview.createPreviewSave({ currentSceneId: 'player' });
  slot.registerSlotSave(player, { authoritative: true });
  assert.match(renderHud(ctx, scene('preview'), 'dark'), /data-overlay-role="openBag"/);
  data.showOpenBagButton = false;
  assert.doesNotMatch(renderHud(ctx, scene('preview'), 'dark'), /data-overlay-role="openBag"/);
  assert.equal(player.get('currentSceneId'), 'player');
});
