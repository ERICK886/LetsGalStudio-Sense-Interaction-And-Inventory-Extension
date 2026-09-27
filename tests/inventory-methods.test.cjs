const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));

function compileModule(code, name, resolve) {
  const compiled = new Module(path.join(__dirname, name), module);
  compiled.filename = compiled.id;
  compiled.paths = Module._nodeModulePaths(root);
  const originalRequire = compiled.require.bind(compiled);
  compiled.require = id => resolve?.(id) ?? originalRequire(id);
  compiled._compile(code, compiled.filename);
  return compiled.exports;
}

// 使用仓库 SDK 的真实 method 品牌和方法枚举；宿主实例与 UI 根由测试替身提供。
const sdkMethods = compileModule(esbuild.transformSync(
  fs.readFileSync(path.join(root, 'sdk/extension-method.ts'), 'utf8'),
  { loader: 'ts', format: 'cjs' },
).code, 'inventory-method-sdk.cjs');
const sdk = {
  ...sdkMethods, Extension: class {}, extension: () => value => value,
  settings: () => ({}), defineSave: schema => schema,
};
const code = esbuild.buildSync({
  stdin: {
    contents: `export * as methods from './src/methods/inventory-methods';
      export { SceneInteractionExtension } from './src/modules/scene-interaction-extension';
      export * as preview from './src/store/preview-save';
      export * as session from './src/store/inventory-session';
      export * as saveSync from './src/store/save-sync';
      export * as inventory from './src/domain/inventory';`,
    resolveDir: root, loader: 'ts', sourcefile: 'inventory-methods-entry.ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
  external: ['@avg-studio/sdk', 'react', '../app/scene-interaction-app', '../methods/scene-methods'],
}).outputFiles[0].text;

// 每个测试重新初始化真实会话模块，避免库存重绑救援机制沿用前一个测试的状态。
function fixture(entries = []) {
  const api = compileModule(code, 'inventory-methods-bundle.cjs', id => {
    if (id === '@avg-studio/sdk') return sdk;
    if (id === '../app/scene-interaction-app' || id === '../methods/scene-methods') return {};
  });
  const save = api.preview.createPreviewSave({ inventoryJson: JSON.stringify({ entries }) });
  const results = new Map(), settingsWrites = [], writes = [];
  const originalSet = save.set;
  save.set = (key, value) => { writes.push([key, value]); originalSet(key, value); };
  const ctx = {
    variables: { set: (key, value) => results.set(key, value) },
    settings: { get: () => undefined, set: (...args) => settingsWrites.push(args),
      cross: { get: () => undefined, set: (...args) => settingsWrites.push(args) } },
  };
  const invoke = (params, mode = 'run') => api.methods.removeItem[mode].call({ save }, ctx, params);
  return { api, save, results, settingsWrites, writes, ctx, invoke,
    inventory: () => JSON.parse(save.get('inventoryJson')) };
}
const stack = (count, itemId = 'key') => ({ kind: 'stack', itemId, count, lastGainedAt: 1 });
const unique = (id, time) => ({ kind: 'unique', itemId: 'key', instanceId: id, lastGainedAt: time });

test('扣除物品通过场景交互静态属性注册，SDK 可枚举方法及 block 参数 schema', () => {
  const { api } = fixture();
  const registered = sdkMethods.listExtensionMethods(api.SceneInteractionExtension);
  const entry = registered.find(value => value.localId === 'remove-item');
  assert.equal(entry?.propertyName, 'removeItem');
  assert.equal(entry?.def, api.methods.removeItem);
  assert.equal(entry.def.title, '扣除物品');
  assert.equal(entry.def.schema.itemId.required, true);
  assert.equal(entry.def.schema.amount.default, 1);
  assert.equal(entry.def.schema.amount.min, 1);
  assert.equal(entry.def.schema.amount.step, 1);
  assert.equal(entry.def.schema.resultVariable.required, false);
});

for (const mode of ['run', 'runImmediately', 'skip']) {
  test(`${mode} 扣除堆叠物品并写回玩家 slot 与结果变量`, () => {
    const f = fixture([stack(5), stack(2, 'other')]);
    let notifications = 0;
    const off = f.api.saveSync.subscribeSaveField(key => { if (key === 'inventoryJson') notifications++; });
    f.invoke({ itemId: ' key ', amount: 2, resultVariable: ' paid ' }, mode);
    off();
    assert.deepEqual(f.inventory(), { entries: [stack(3), stack(2, 'other')] });
    assert.equal(f.results.get('paid'), true);
    assert.equal(notifications, 1);
    assert.deepEqual(f.settingsWrites, []);
  });
}

test('省略数量默认扣除一个，可不写结果变量；扣完移除该库存条目', () => {
  const f = fixture([stack(1)]);
  f.invoke({ itemId: 'key' });
  assert.deepEqual(f.inventory(), { entries: [] });
  assert.equal(f.results.size, 0);
});

test('非堆叠物品扣除最早获得的实例，保留其他实例与物品', () => {
  const f = fixture([unique('new', 3), stack(1, 'other'), unique('old', 1), unique('middle', 2)]);
  f.invoke({ itemId: 'key', amount: 2, resultVariable: 'paid' });
  assert.deepEqual(f.inventory(), { entries: [unique('new', 3), stack(1, 'other')] });
  assert.equal(f.results.get('paid'), true);
});

test('数量不足或没有物品时写 false，库存完全不变且无库存写入', () => {
  for (const entries of [[stack(2)], []]) {
    const f = fixture(entries);
    const before = f.save.get('inventoryJson');
    f.invoke({ itemId: 'key', amount: 3, resultVariable: 'paid' });
    assert.equal(f.results.get('paid'), false);
    assert.equal(f.save.get('inventoryJson'), before);
    assert.deepEqual(f.writes, []);
  }
});

test('非法 ID 或非正整数数量拒绝扣物，防止变量绑定异常导致误扣', () => {
  const params = [
    ...['', ' ', undefined, null, 'undefined', 'null'].map(itemId => ({ itemId, amount: 1 })),
    ...[0, -1, 1.5, NaN, Infinity, '2', null, Number.MAX_SAFE_INTEGER + 1]
      .map(amount => ({ itemId: 'key', amount })),
  ];
  for (const param of params) {
    const f = fixture([stack(5)]);
    const before = f.save.get('inventoryJson');
    f.invoke({ ...param, resultVariable: 'paid' });
    assert.equal(f.results.get('paid'), false);
    assert.equal(f.save.get('inventoryJson'), before);
    assert.deepEqual(f.writes, []);
  }
});

test('已绑定会话扣物同步通知 HUD，并将正确库存写回玩家 save', () => {
  const f = fixture([stack(5)]);
  const unbind = f.api.session.bindInventoryPersistence(f.save);
  let refreshes = 0;
  const off = f.api.session.subscribeInventorySession(() => refreshes++);
  try {
    f.invoke({ itemId: 'key', amount: 2, resultVariable: 'paid' });
    assert.deepEqual(f.api.session.getInventorySession(), f.inventory());
    assert.equal(f.api.inventory.getItemCount(f.inventory(), 'key'), 3);
    assert.ok(refreshes > 0);
    assert.equal(f.results.get('paid'), true);
    assert.deepEqual(f.settingsWrites, []);
    const reloaded = f.api.preview.createPreviewSave({ inventoryJson: f.save.get('inventoryJson') });
    assert.equal(f.api.inventory.getItemCount(JSON.parse(reloaded.get('inventoryJson')), 'key'), 3);
  } finally { off(); unbind(); }
});
