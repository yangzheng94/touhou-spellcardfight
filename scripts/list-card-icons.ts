// 列出所有当前激活角色及其符卡对应的图标路径
// 运行方式：npx tsx scripts/list-card-icons.ts

import { CHARACTERS } from "../packages/engine/src/data/index.js";

const FORMATS = ["png", "jpg", "jpeg", "webp"];

for (const char of CHARACTERS) {
  console.log(`\n【${char.name}】 id=${char.id}`);
  for (const card of char.cards) {
    const paths = FORMATS.map((ext) => `public/icons/${char.id}/${card.id}.${ext}`);
    console.log(`  ${card.name} → ${paths.join(" / ")}`);
  }
}
