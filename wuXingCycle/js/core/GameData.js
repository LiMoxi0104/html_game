// GameData：存档管理（localStorage 键 wuXingCycleSave，JSON 序列化）。
// 存档结构 v2：技能系统升级为「技能池 + 技能槽 + 熟练度」动态招式体系。
//
// v3 增强（多存档兼容）：
//   - 原有 GameData.load/save 保持不变，继续使用旧键名
//   - SaveManager 作为新的多槽位管理层，负责元数据与多槽位管理
//   - 首次加载时 SaveManager 会检测并自动迁移旧版单存档至槽位1
//
// 向后兼容策略：
//   - 旧代码调用 GameData.load() → 正常工作（读取旧格式）
//   - 新代码通过 SaveManager 操作多槽位 → 使用新格式
//   - 两套存储键不冲突，可共存

const DEFAULT_SAVE = {
  cycle: 1,
  awakening: 0,
  currentMap: "woodValley",
  level: 1,
  exp: 0,
  expNeed: 100,
  point: 0,
  attr: { strength: 1, agility: 1, spirit: 1, physique: 1 },
  hp: 100,
  maxHp: 100,
  mp: 50,
  maxMp: 50,

  // —— 动态招式系统（v2）——
  ownedSkills: ["water_slash", "parry_dagger"],       // 技能池：已学会的全部招式ID
  equippedSkills: {                                    // 技能槽：当前装配到各键位的招式ID
    light1: "water_slash",      // J
    light2: null,               // S+J
    heavy1: null,               // W+K
    heavy2: null,               // A/D+K
    heavy3: null,               // S+K
    parry: "parry_dagger"       // L（固定不可更换）
  },
  skillMastery: {                                        // 熟练度记录：skillId → 当前等级（0~maxMastery）
    water_slash: 0,
    parry_dagger: 0
  },

  mapExplore: {
    woodValley: { unlock: true, box: [false, false] }
  },
  timeScale: 1,
  freezeTimer: 0
};

// 存档迁移：从旧版 unlockSkill 数组自动升级为 v2 结构
function migrateSaveV1(oldData) {
  if (oldData.ownedSkills && oldData.equippedSkills) return oldData;  // 已经是 v2

  const data = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  data.cycle = oldData.cycle ?? 1;
  data.awakening = oldData.awakening ?? 0;
  data.currentMap = oldData.currentMap ?? "woodValley";
  data.level = oldData.level ?? 1;
  data.exp = oldData.exp ?? 0;
  data.expNeed = oldData.expNeed ?? 100;
  data.point = oldData.point ?? 0;
  data.attr = oldData.attr || DEFAULT_SAVE.attr;
  data.hp = oldData.hp ?? DEFAULT_SAVE.hp;
  data.maxHp = oldData.maxHp ?? DEFAULT_SAVE.maxHp;
  data.mp = oldData.mp ?? DEFAULT_SAVE.mp;
  data.maxMp = oldData.maxMp ?? DEFAULT_SAVE.maxMp;
  data.mapExplore = oldData.mapExplore || DEFAULT_SAVE.mapExplore;

  // 旧 unlockSkill 迁移：将已解锁元素名映射为对应基础招式ID，装入技能池并自动装备
  const elementSkillMap = {
    water: "water_slash",
    wood: "wood_vine",
    metal: "metal_sword",
    fire: "fire_dragon",
    earth: "earth_meteor"
  };

  const unlocked = oldData.unlockSkill || [];
  data.ownedSkills = ["parry_dagger"];   // 弹反始终拥有
  for (const el of unlocked) {
    const sid = elementSkillMap[el];
    if (sid && !data.ownedSkills.includes(sid)) {
      data.ownedSkills.push(sid);
    }
  }

  // 自动装备到默认槽位
  if (data.ownedSkills.includes("water_slash")) {
    data.equippedSkills.light1 = "water_slash";
  }
  if (data.ownedSkills.includes("wood_vine")) {
    data.equippedSkills.light2 = "wood_vine";
  }
  if (data.ownedSkills.includes("metal_sword")) {
    data.equippedSkills.heavy1 = "metal_sword";
  }
  if (data.ownedSkills.includes("fire_dragon")) {
    data.equippedSkills.heavy2 = "fire_dragon";
  }
  if (data.ownedSkills.includes("earth_meteor")) {
    data.equippedSkills.heavy3 = "earth_meteor";
  }

  // 初始化熟练度
  data.skillMastery = { parry_dagger: 0 };
  for (const sid of data.ownedSkills) {
    if (sid !== "parry_dagger") data.skillMastery[sid] = 0;
  }

  console.log("[GameData] 存档已从 v1 迁移至 v2 结构");
  return data;
}

class GameData {
  static load() {
    if (!StorageUtil.available()) {
      DialogBox.showStorageError && DialogBox.showStorageError();
      return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }
    const raw = StorageUtil.read(SAVE_KEY);
    if (!raw) {
      const fresh = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      this.save(fresh);
      return fresh;
    }
    try {
      let data = JSON.parse(raw);
      // 检测旧版格式并迁移
      if (!data.ownedSkills || !data.equippedSkills) {
        data = migrateSaveV1(data);
        this.save(data);
      } else {
        // 确保 v2 字段完整性（新增字段向前兼容）
        data.ownedSkills = data.ownedSkills || DEFAULT_SAVE.ownedSkills;
        data.equippedSkills = Object.assign({}, DEFAULT_SAVE.equippedSkills, data.equippedSkills);
        data.skillMastery = Object.assign({}, DEFAULT_SAVE.skillMastery, data.skillMastery);
      }
      // 补全 mapExplore 中缺失的条目（全部五行地图）
      if (!data.mapExplore) data.mapExplore = {};
      if (!data.mapExplore.woodValley) data.mapExplore.woodValley = { unlock: true, box: [false, false] };
      const allMaps = ["jinDomain","muDomain","shuiDomain","huoDomain","tuDomain"];
      for (const m of allMaps) {
        if (!data.mapExplore[m]) data.mapExplore[m] = { unlock: true, box: [] };
      }
      // ★ 确保始终从木幽谷（最原始地图）开始
      if (data.currentMap !== "woodValley") {
        data.currentMap = "woodValley";
        this.save(data);
        console.log("[GameData] currentMap 已修正为木幽谷");
      }
      return data;
    } catch (e) {
      console.warn("[GameData] 存档解析失败，重建空白存档", e);
      const fresh = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      this.save(fresh);
      return fresh;
    }
  }

  static save(data) {
    if (!StorageUtil.available()) return false;
    return StorageUtil.write(SAVE_KEY, JSON.stringify(data));
  }

  // 真结局触发后清空全部存档
  static clearAll() {
    StorageUtil.remove(SAVE_KEY);
  }
}
