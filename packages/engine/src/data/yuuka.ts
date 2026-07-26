import type { Character } from "../types.js";
import {
  dealSpell,
  drainLife,
  heal,
  immune,
  setHp,
  hpOf,
  cardPowerOf,
  multPower,
  negateEffect,
} from "../effects.js";
import { getRes, setRes, addRes } from "../buffs.js";

/**
 * 风见幽香  HP30
 */
export const yuuka: Character = {
  id: "yuuka",
  name: "风见幽香",
  hp: 30,
  skills: [
    {
      id: "yuuka-yuumu",
      name: "幽梦",
      text: "每2回合，对对手造成一点生命流失",
      cooldown: 2,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnEnd: (ec) => {
          if (ec.ctx.turn % 2 === 0) drainLife(ec, 1, ec.foe);
        },
      },
    },
    {
      id: "yuuka-renzuka",
      name: "樱花之恋冢",
      text: "每三回合一次，无视对方一半的符卡威力",
      cooldown: 3,
      passive: false,
      declaredAtTurnStart: true,
      script: {
        power: (ec) => multPower(ec, 0.5, ec.foe),
      },
    },
    {
      id: "yuuka-shiki",
      name: "四季鲜花之主",
      text: "每受到2次伤害后一次，本回合无视对方的符卡效果",
      cooldown: 1,
      passive: true,
      declaredAtTurnStart: false,
      script: {
        turnStart: (ec) => {
          // 检查是否累计受到2次伤害
          const hitCount = getRes(ec, ec.self, "_shiki_hit_count");
          if (hitCount >= 2) {
            setRes(ec, ec.self, "_shiki_hit_count", 0);
            setRes(ec, ec.self, "_shiki_active", 1);
          }
        },
        priority: (ec) => {
          if (getRes(ec, ec.self, "_shiki_active") > 0) {
            negateEffect(ec, ec.foe);
            setRes(ec, ec.self, "_shiki_active", 0);
          }
        },
        apply: (ec) => {
          // 如果本回合自己受到伤害，累计受伤次数
          const taken = ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell;
          if (taken > 0) {
            addRes(ec, ec.self, "_shiki_hit_count", 1);
          }
        },
      },
    },
  ],
  cards: [
    {
      id: "yuuka-sparks",
      name: "魔炮【双生火花】",
      power: 30,
      text: "本回合己方最多受3点伤害，对方至少受4点伤害，至多受5点伤害",
      tags: [],
      script: {
        damage: (ec) => {
          // 己方最多受3点伤害（物理+法术）
          ec.ctx.damageConfig[ec.self].physical.atMost = 3;
          ec.ctx.damageConfig[ec.self].spell.atMost = 3;
          // 对方至少受4点伤害，至多受5点伤害（物理+法术）
          ec.ctx.damageConfig[ec.foe].physical.atLeast = 4;
          ec.ctx.damageConfig[ec.foe].physical.atMost = 5;
          ec.ctx.damageConfig[ec.foe].spell.atLeast = 4;
          ec.ctx.damageConfig[ec.foe].spell.atMost = 5;
        },
      },
    },
    {
      id: "yuuka-mugetsu",
      name: "幻想【梦月】",
      power: 5,
      text: "本回合格挡5伤害，回复5HP",
      tags: ["absorb", "heal"],
      script: {
        damage: (ec) => {
          ec.ctx.damageConfig[ec.self].absorb += 5;
          heal(ec, 5);
        },
      },
    },
    {
      id: "yuuka-kakurebana",
      name: "花符【隐目之花】",
      power: 6,
      text: "若本回合自己受到伤害，则回合结束时使对方流失4点生命",
      tags: ["drain"],
      script: {
        apply: (ec) => {
          if (ec.ctx.dealt[ec.self].physical + ec.ctx.dealt[ec.self].spell > 0)
            setRes(ec, ec.self, "_kakure", 1);
        },
        turnEnd: (ec) => {
          if (getRes(ec, ec.self, "_kakure") > 0) {
            drainLife(ec, 4, ec.foe);
            setRes(ec, ec.self, "_kakure", 0);
          }
        },
      },
    },
    {
      id: "yuuka-kaika",
      name: "花符【幻想乡的开花】",
      power: 7,
      text: "回合开始时将对方生命值减半，回合结束时将对方生命值翻倍",
      tags: [],
      script: {
        turnStart: (ec) => setHp(ec, ec.foe, Math.floor(hpOf(ec, ec.foe) / 2)),
        turnEnd: (ec) => setHp(ec, ec.foe, hpOf(ec, ec.foe) * 2),
      },
    },
    {
      id: "yuuka-ryoushu",
      name: "花符【花之领主】",
      power: 6,
      text: "若对方威力低于自己，则本回合免疫一切伤害；若对方生命低于自己，则造成3点法术伤害",
      tags: ["immune"],
      script: {
        damage: (ec) => {
          if (cardPowerOf(ec, ec.foe) < cardPowerOf(ec, ec.self)) immune(ec, ec.self, "all");
          if (hpOf(ec, ec.foe) < hpOf(ec, ec.self)) dealSpell(ec, 3);
        },
      },
    },
    {
      id: "yuuka-gekka",
      name: "幻夜【月下美人狂咲】",
      power: 6,
      text: "使对方的最大生命值降至现在的值",
      tags: [],
      script: {
        damage: (ec) => {
          ec.ctx.state.players[ec.foe].maxHp = hpOf(ec, ec.foe);
        },
      },
    },
    {
      id: "yuuka-reverse",
      name: "幻想【花鸟风月，啸风弄月】",
      power: 3,
      text: "本回合使对方符卡能力作用对象反转",
      tags: ["reverse"],
      script: {
        priority: (ec) => {
          ec.ctx.state.players[ec.foe].flags["_effect_reversed"] = true;
        },
      },
    },
    {
      id: "yuuka-taiyou",
      name: "幻想【太阳花食】",
      power: 6,
      text: "产生（双方已损失生命值之和）/2的法术伤害",
      tags: ["spell-damage"],
      script: {
        damage: (ec) => {
          const lostA = ec.ctx.state.players.A.maxHp - hpOf(ec, "A");
          const lostB = ec.ctx.state.players.B.maxHp - hpOf(ec, "B");
          dealSpell(ec, Math.floor((lostA + lostB) / 2));
        },
      },
    },
    {
      id: "yuuka-daiousana",
      name: "孔符【大王花之穴】",
      power: 3,
      text: "本回合免疫对方的物理伤害，回复5HP",
      tags: ["immune", "heal"],
      script: {
        damage: (ec) => {
          immune(ec, ec.self, "physical");
          heal(ec, 5);
        },
      },
    },
    {
      id: "yuuka-anrenge",
      name: "疵符【暗黑莲华】",
      power: 3,
      text: "本回合双方免疫物理伤害，对对方造成5点法术伤害",
      tags: ["immune", "spell-damage"],
      script: {
        damage: (ec) => {
          immune(ec, "A", "physical");
          immune(ec, "B", "physical");
          dealSpell(ec, 5);
        },
      },
    },
  ],
};
