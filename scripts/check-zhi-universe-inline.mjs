import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const html = readFileSync("web/zhi-universe.html", "utf8");
const match = html.match(/<script type="module">([\\s\\S]*?)<\\/script>/i);
if (!match) throw new Error("ZHI Universe module script not found");
const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], {
  input: match[1],
  encoding: "utf8",
});
if (checked.status !== 0) {
  process.stderr.write(checked.stderr || checked.stdout || "inline module syntax check failed\\n");
  process.exit(1);
}
process.stdout.write("ZHI Universe inline module syntax OK\\n");
