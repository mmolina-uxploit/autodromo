import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Regla de dependencias: cada capa solo puede importar de las capas listadas. */
const ALLOWED = {
  domain: ['domain'],
  config: ['config'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'application', 'domain', 'config'],
  presentation: ['presentation', 'application', 'config']
};

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.js') ? [full] : [];
  });
}

const layerOf = file => relative(SRC, file).split(sep)[0];

for (const file of files(SRC)) {
  const layer = layerOf(file);
  if (!(layer in ALLOWED)) continue;
  test(`${relative(SRC, file)} respeta la regla de dependencias`, () => {
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(spec.startsWith('.'), `${spec}: solo se permiten imports relativos, sin paquetes externos`);
      const target = layerOf(resolve(dirname(file), spec));
      assert.ok(ALLOWED[layer].includes(target), `${layer} no puede depender de ${target} (${spec})`);
    }
  });
}

test('el dominio no toca APIs del navegador', () => {
  for (const file of files(join(SRC, 'domain'))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\b(window|document|localStorage|navigator|requestAnimationFrame)\b/, relative(SRC, file));
  }
});
