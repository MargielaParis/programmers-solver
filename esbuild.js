const esbuild = require("esbuild");

const production = process.argv.includes("--production");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    // 프로덕션에서도 console.log 유지
    drop: [],
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "out/extension.js",
    // vscode는 external 유지, ws 모듈은 번들에 포함
    external: ["vscode"],
    logLevel: "info",
    // minify 옵션 상세 설정 - console 문 유지
    minifyWhitespace: production,
    minifyIdentifiers: production,
    minifySyntax: production,
  });

  await ctx.rebuild();
  await ctx.dispose();
  console.log("Build complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
