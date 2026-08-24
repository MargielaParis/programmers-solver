import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const version = packageJson.version;
const bundleName = `ProgrammersSolver-${version}`;
const vsixName = `programmers-solver-${version}.vsix`;
const vsixPath = join(projectRoot, vsixName);
const releaseDir = join(projectRoot, "release");
const archivePath = join(releaseDir, `${bundleName}.zip`);

const run = (command, args, cwd = projectRoot) => {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} 종료 코드: ${result.status}`);
  }
};

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
};

await run("pnpm", ["exec", "vsce", "package", "--no-dependencies", "--out", vsixName]);
await mkdir(releaseDir, { recursive: true });
await rm(archivePath, { force: true });

const stageRoot = await mkdtemp(join(tmpdir(), "programmers-solver-release-"));
const bundleRoot = join(stageRoot, bundleName);
await mkdir(bundleRoot, { recursive: true });
await cp(vsixPath, join(bundleRoot, vsixName));
await cp(join(projectRoot, "chrome-extension"), join(bundleRoot, "chrome-extension"), {
  recursive: true,
});
await cp(join(projectRoot, "INSTALL.md"), join(bundleRoot, "INSTALL.md"));

const files = (await collectFiles(bundleRoot))
  .filter((file) => !file.endsWith("SHA256SUMS.txt"))
  .sort();
const checksums = [];
for (const file of files) {
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  checksums.push(`${hash}  ${relative(bundleRoot, file).split(sep).join("/")}`);
}
await writeFile(join(bundleRoot, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`, "utf8");

run("zip", ["-qr", archivePath, bundleName], stageRoot);
await rm(stageRoot, { recursive: true, force: true });
console.log(`Release created: ${archivePath}`);
