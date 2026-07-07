import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'src/game/generated-cards.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Resetting local state on auth/game transitions is intentional here;
      // revisit if these effects become a perf problem.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    rules: {
      // The engine and AI intentionally use broad types in a few hot spots;
      // keep lint actionable rather than noisy on day one.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
