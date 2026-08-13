import fs from "fs";
import path from "path";

const dir = "packages/client/public/icons/satori";

// 按我查看图片后的主题匹配
const mapping = [
  {
    old: "__komeiji_satori_touhou_drawn_by_kagami_haret46_..jpg",
    new: "satori-kyoufu.jpg",
    note: "想起【恐怖的回忆】",
  },
  {
    old: "__komeiji_satori_touhou_and_1_more_drawn_by_mirr..jpg",
    new: "satori-aphrodite.jpg",
    note: "想起【阿弗洛狄特的蔷薇园】",
  },
  {
    old: "__komeiji_satori_touhou_and_1_more_drawn_by_calp..jpg",
    new: "satori-oboro.jpg",
    note: "想起【朦胧的表意识】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_riri_hashi__sam..jpg",
    new: "satori-shinka.jpg",
    note: "心花【羞于留影之蔷薇】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_starjinxin__sam..jpg",
    new: "satori-mushin.jpg",
    note: "心理【无心之书】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_kikugetsu__cc02..png",
    new: "satori-shimon.png",
    note: "脑符【脑指纹测谎法】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_nagihara_rion__..jpg",
    new: "satori-butai.jpg",
    note: "想起【心身的舞台】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_yukizen__sample..jpg",
    new: "satori-daigata.jpg",
    note: "暗示【意识的代替形态】",
  },
  {
    old: "__komeiji_satori_touhou_and_1_more_drawn_by_sunn..jpg",
    new: "satori-nihanshoku.jpg",
    note: "心结【二反色】",
  },
  {
    old: "__komeiji_satori_touhou_drawn_by_sunnysideup__sa..jpg",
    new: "satori-suishou.jpg",
    note: "心晶【水色孪晶】",
  },
];

for (const { old: oldName, new: newName, note } of mapping) {
  const src = path.join(dir, oldName);
  const dst = path.join(dir, newName);
  if (!fs.existsSync(src)) {
    console.warn(`跳过（源文件不存在）: ${oldName}`);
    continue;
  }
  fs.renameSync(src, dst);
  console.log(`${oldName}  ->  ${newName}  (${note})`);
}

console.log("\n重命名完成。");
