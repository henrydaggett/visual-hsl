/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the build works at any URL (e.g. a GitHub Pages sub-path).
  base: './',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
});
