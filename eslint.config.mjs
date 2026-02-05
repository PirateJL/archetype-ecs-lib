import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["example/**/*", "src/**/*.ts", "test/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.eslint.json"],
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "no-empty": ["error", {"allowEmptyCatch": true}]
        }
    }
];
