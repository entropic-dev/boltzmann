module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: ['plugin:@typescript-eslint/recommended', 'prettier/@typescript-eslint', 'plugin:prettier/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '(Context|_)' }],
    '@typescript-eslint/no-var-requires': [0],
  },
}
