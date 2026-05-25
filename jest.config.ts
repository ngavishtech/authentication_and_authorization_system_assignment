import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.ts'],
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './reports',
        filename: 'test-report.html',
        openReport: false,
        pageTitle: 'Auth System – Test Report',
        includeConsoleLog: true,
        includeFailureMsg: true,
      },
    ],
  ],
};

export default config;
