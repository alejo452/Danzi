// La versión web no debe cargar el código de la APK de Android: fuera de src/native/ solo se importa
// con import() (detrás de isNative) o con import type. Si alguien lo importa de forma estática, la web lo
// descargaría al abrir y, sin internet, fallaría (el service worker no guarda los archivos native-*.js).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

// Todo menos la carpeta src/native/ (src/lib/native.ts sí cuenta: es parte de la web).
const outside = sources('src').filter((f) => !f.includes(`${path.sep}native${path.sep}`));

describe('código de la APK', () => {
  it('fuera de src/native/ no se importa de forma estática', () => {
    for (const file of outside) {
      const text = fs.readFileSync(file, 'utf8');
      const bad = [...text.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+['"](?:\.{1,2}\/)+native\/[^'"]+['"]/gm)].map((m) => m[0].trim());
      expect(bad, file).toEqual([]);
    }
  });

  it('Capacitor solo se usa dentro de src/native/', () => {
    for (const file of outside) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toMatch(/from\s+['"]@capacitor/);
    }
  });

  it('el service worker no guarda los archivos de la APK', () => {
    const config = fs.readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("'assets/native-*.js'");
    expect(config).toContain('assets/native-[name]-[hash].js');
    // manualChunks como opción (no en un comentario).
    expect(config).not.toMatch(/^\s*manualChunks\b/m);
  });
});
