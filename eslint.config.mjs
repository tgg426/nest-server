// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // ==================== TypeScript 相关规则（放宽类型检查） ====================
      '@typescript-eslint/no-explicit-any': 'off', // 允许使用 `any` 类型（关闭严格类型检查）
      '@typescript-eslint/no-unsafe-assignment': 'off', // 允许不安全的赋值（如 any 赋值给变量）
      '@typescript-eslint/no-unsafe-call': 'off', // 允许调用类型不明确的函数（如装饰器）
      '@typescript-eslint/no-unsafe-member-access': 'off', // 允许访问可能不存在的属性
      '@typescript-eslint/no-unsafe-return': 'off', // 允许返回类型不明确的值
      '@typescript-eslint/no-floating-promises': 'off', // 允许未处理的 Promise（不强制 await/catch）
      '@typescript-eslint/no-misused-promises': 'off', // 允许 Promise 的非标准用法（如 setTimeout(promise)）
      //'@typescript-eslint/no-unused-vars': 'off', // 允许定义但未使用的变量
      '@typescript-eslint/restrict-template-expressions': 'off', // 允许模板字符串中使用任意表达式
      '@typescript-eslint/no-base-to-string': 'off', // 允许覆盖 Object.prototype.toString

      // ==================== JavaScript 原生规则（关闭部分检查） ====================
      'no-case-declarations': 'off', // 允许在 switch-case 中直接声明变量（不强制用 {} 包裹）
      'no-unused-vars': 'off', // 允许未使用的变量（JS 版，与 TS 规则重复）
      'no-undef': 'off', // 允许使用未声明的变量（适用于 JS/TS 混合项目或全局变量）

      // ==================== Prettier 相关规则（关闭格式化检查） ====================
      'prettier/prettier': 'off', // 关闭 Prettier 的 ESLint 集成检查（避免与 ESLint 规则冲突）
    },
  },
);
