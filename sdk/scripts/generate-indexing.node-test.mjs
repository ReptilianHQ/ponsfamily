import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getPonsIndexingManifest } from '../dist/indexing.js';
import { generate, renderIndexing, validateCatalog } from './generate-indexing.mjs';

test('deterministic generation detects changed, missing and obsolete outputs without writing', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'pons-generation-'));
  try {
    assert.deepEqual(renderIndexing(), renderIndexing());
    generate({ directory });
    generate({ directory, check: true });
    for (const path of ['indexing/mainnet.json', 'artifacts/PonsV2Factory.json', 'examples/envio/config.yaml', 'examples/envio/schema.graphql', 'examples/envio/src/EventHandlers.ts', 'examples/envio/src/eventLog.ts']) {
      writeFileSync(resolve(directory, path), 'stale');
      assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
      assert.equal(readFileSync(resolve(directory, path), 'utf8'), 'stale');
      generate({ directory });
    }
    rmSync(resolve(directory, 'examples/envio/schema.graphql'));
    assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
    generate({ directory });
    writeFileSync(resolve(directory, 'examples/envio/src/removedHandler.ts'), 'obsolete');
    assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
    generate({ directory });
    generate({ directory, check: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('coverage, metadata, discovery and materialization references fail closed', () => {
  const original = getPonsIndexingManifest();
  for (const mutate of [
    m => m.catalog.pop(),
    m => { m.catalog[0].parameters[0].name = 'missing'; },
    m => { m.catalog[0].description = ''; },
    m => { m.sources.find(s => s.kind === 'dynamic').registeredBy.addressParameter = 'missing'; },
    m => { m.materializations[0].updates[0].set.curve.parameter = 'missing'; },
    m => { m.dependencies[0].filters[0].parameter = 'missing'; },
  ]) {
    const manifest = structuredClone(original); mutate(manifest);
    assert.throws(() => validateCatalog(manifest));
  }
});
