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
};
const code = esbuild.buildSync({
  stdin: {
    contents: Object.entries(entries).map(([name, file]) => `export * as ${name} from './src/${file}.ts';`).join('\n'),
    resolveDir: root, sourcefile: 'scene-pr-compatibility-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom', '@avg-studio/sdk'], logLevel: 'silent',
}).outputFiles[0].text;
const compiled = new Module(path.join(__dirname, 'scene-pr-compatibility-bundle.cjs'), module);
compiled.filename = compiled.id;
compiled.paths = Module._nodeModulePaths(root);
const originalRequire = compiled.require.bind(compiled);
compiled.require = name => name === '@avg-studio/sdk'
  ? { useExtensionContext() { throw new Error('这些回归不应依赖真实 Studio 实例'); } }
  : originalRequire(name);
compiled._compile(code, compiled.filename);
const { progress, serialize, visual, imageSize, layout, actions, hud, preview, slot,
  saveSync, settingsSync, target, hotspotSchema, sceneSchema, projectImages } = compiled.exports;
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
