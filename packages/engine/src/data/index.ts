import type { Character } from "../types.js";
import { youmu } from "./youmu.js";
import { seija } from "./seija.js";
import { aya } from "./aya.js";
import { flandre } from "./flandre.js";
import { sakuya } from "./sakuya.js";
import { cirno } from "./cirno.js";
import { reisen } from "./reisen.js";
import { yuuka } from "./yuuka.js";
import { koishi } from "./koishi.js";
import { satori } from "./satori.js";
import { patchouli } from "./patchouli.js";
import { remilia } from "./remilia.js";
import { mystia } from "./mystia.js";
import { hata } from "./hata.js";
import { reimu } from "./reimu.js";
import { suika } from "./suika.js";
import { sagume } from "./sagume.js";
import { nue } from "./nue.js";
import { patches } from "./patches.js";
// import { sukuna } from "./sukuna.js"; // 暂时移除两面宿傩
import { tokoyo } from "./tokoyo.js";

/** 所有角色。 */
export const CHARACTERS: Character[] = [
  youmu, seija, aya, flandre, sakuya, cirno, reisen,
  yuuka, koishi, satori, patchouli, remilia,
  mystia, hata, reimu, suika,
  sagume, nue, patches, tokoyo,
  // sukuna, // 暂时移除两面宿傩
];

export const CHARACTERS_BY_ID: Record<string, Character> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
);

export {
  youmu, seija, aya, flandre, sakuya, cirno, reisen, yuuka, koishi, satori, patchouli, remilia,
  mystia, hata, reimu, suika, sagume, nue, patches, tokoyo,
  // sukuna, // 暂时移除两面宿傩
};
