import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";

const root = normalize(join(import.meta.dirname, ".."));
const html = readFileSync(join(root, "index.html"), "utf8");
const script = readFileSync(join(root, "app.js"), "utf8");
const errors = [];

for (const resource of ["styles.css", "app.js", "favicon.svg"]) {
  if (!existsSync(join(root, resource))) {
    errors.push(`缺少静态资源：${resource}`);
  }
}

const referencedIds = [
  ...script.matchAll(/querySelector\("#([A-Za-z][\w-]*)"\)/g),
].map((match) => match[1]);

for (const id of new Set(referencedIds)) {
  if (!html.includes(`id="${id}"`)) {
    errors.push(`app.js 引用了不存在的元素：#${id}`);
  }
}

if (!html.includes('lang="zh-CN"')) {
  errors.push("页面语言未设置为 zh-CN");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`完整性检查通过：${new Set(referencedIds).size} 个页面元素，3 个静态资源。`);
}
