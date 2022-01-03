process.env.JEST_JUNIT_OUTPUT = './test-report/junit.xml'

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['.d.ts', '.js', '__mocks__', 'mockData'],
  moduleNameMapper: {
    '^@shapeshiftoss\\/([^/]+)': ['@shapeshiftoss/$1/src', '@shapeshiftoss/$1'],
  },
  setupFiles: ['<rootDir>/.jest/setEnvVars.js'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
}
