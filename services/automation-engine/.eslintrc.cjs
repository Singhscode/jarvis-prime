module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': 'off',
    'no-control-regex': 'off',
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};