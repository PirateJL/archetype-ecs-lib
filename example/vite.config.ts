import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    build: {
        outDir: "../docs/Demo/Game",
        assetsDir: "assets",
        emptyOutDir: true
    },
});
