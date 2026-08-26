import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    include: [
      'src/app/activate/**/*.test.tsx',
      'src/app/register/**/*.test.tsx',
      'src/app/client/**/*.test.tsx',
      'src/app/dashboard/**/*.test.tsx',
      'src/app/employee/**/*.test.tsx',
      'src/components/**/*.test.tsx',
    ],
  },
});
