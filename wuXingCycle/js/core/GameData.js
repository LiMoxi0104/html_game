// GameData：存档管理（localStorage 键 wuXingCycleSave，JSON 序列化）。
// 首次进入初始化 1 级空白存档；无存储权限弹窗容错；预留真结局清空接口。
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
  unlockSkill: ["water"],
  mapExplore: {
    woodValley: { unlock: true, box: [false, false] }
  },
  timeScale: 1,
  freezeTimer: 0
};

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
      return JSON.parse(raw);
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
