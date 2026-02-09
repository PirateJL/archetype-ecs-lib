const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
    testEnvironment: "node",
    transform: {
        ...tsJestTransformCfg,
    },
    roots: ["<rootDir>/test"],
    testMatch: ["**/*.test.ts"],
    collectCoverage: true,
    collectCoverageFrom: [
        "<rootDir>/src/**/*.ts",
        "!**/*.d.ts"
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["json-summary", "lcov", "text-summary"],
    testEnvironmentOptions: {
        customExportConditions: ["node", "node-addons"],
    }
};