const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
    testEnvironment: "node",
    transform: {
        ...tsJestTransformCfg,
    },
    roots: ["<rootDir>/test"],
    testMatch: ["**/*.bench.ts"],
    // No coverage for benchmarks
    collectCoverage: false,
    testTimeout: 60_000,
};
