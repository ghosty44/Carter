import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Les tests tapent directement les sources de `shared` : pas besoin de
      // compiler le paquet avant de lancer `npm test`.
      '@carter/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sync/**', 'src/alertes/**', 'src/export/**', 'src/providers/**'],
    },
  },
});
