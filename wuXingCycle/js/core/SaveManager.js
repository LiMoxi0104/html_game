// SaveManager：多存档管理系统（v1）。
//
// 核心设计：
//   - 多槽位支持（默认3个存档槽，可扩展）
//   - 元数据与存档数据分离：
//       * _META_KEY: 存储各槽位的元数据（名称、时间、进度摘要等）
//       * _SLOT_KEY_PREFIX + slotId: 存储各槽位的完整游戏存档数据
//   - 向后兼容：旧版单存档自动迁移至槽位1并生成元数据
//
// 存储结构：
//   localStorage["wuXingCycle_meta"] = { slots: { "1": {...}, "2": {...}, ... }, currentSlot: "1" }
//   localStorage["wuXingCycle_save_1"] = { ...完整GameData结构... }
//   localStorage["wuXingCycle_save_2"] = ...
//
// 使用方式：
//   const saveMgr = new SaveManager();
//   saveMgr.init();              // 初始化（含旧版迁移检测）
//   const data = saveMgr.load("1");    // 加载槽位1的存档
//   saveMgr.save("1", data);           // 保存到槽位1
//   const meta = saveMgr.getSlotMeta("1");  // 获取槽位1元数据
//   saveMgr.rename("1", "新名称");        // 重命名槽位
//   saveMgr.delete("1");                  // 删除槽位

class SaveManager {
  constructor() {
    // 常量定义
    this._META_KEY = "wuXingCycle_meta";          // 元数据存储键
    this._SAVE_KEY_PREFIX = "wuXingCycle_save_";  // 各槽位存档键前缀
    this._OLD_SAVE_KEY = "wuXingCycleSave";       // 旧版单存档键（向后兼容）
    this._MAX_SLOTS = 3;                           // 最大存档槽数量

    // 运行时状态
    this.meta = null;      // 当前元数据对象
    this.currentSlot = null; // 当前使用的槽位ID
    this._migrated = false; // 是否已执行旧版迁移
  }

  // ======================== 初始化 ========================

  // 初始化多存档系统（应用启动时调用一次）
  // 负责加载元数据、检测旧版存档并迁移
  init() {
    this._loadMeta();
    this._checkAndMigrateOldSave();
    return this;
  }

  // 加载元数据（内部使用）
  _loadMeta() {
    if (!StorageUtil.available()) {
      // localStorage 不可用，创建空元数据
      this.meta = this._createEmptyMeta();
      return;
    }

    try {
      const raw = StorageUtil.read(this._META_KEY);
      if (raw) {
        this.meta = JSON.parse(raw);
        // 确保字段完整性
        if (!this.meta.slots) this.meta.slots = {};
        if (!this.meta.currentSlot) this.meta.currentSlot = "1";
        this.currentSlot = this.meta.currentSlot;
      } else {
        this.meta = this._createEmptyMeta();
        this._saveMeta();
      }
    } catch (e) {
      console.warn("[SaveManager] 元数据解析失败，重建空白", e);
      this.meta = this._createEmptyMeta();
      this._saveMeta();
    }
  }

  // 创建空白元数据结构
  _createEmptyMeta() {
    return {
      version: 1,
      currentSlot: "1",
      slots: {}
    };
  }

  // 持久化元数据（内部使用）
  _saveMeta() {
    if (!StorageUtil.available()) return false;
    this.meta.currentSlot = this.currentSlot || "1";
    return StorageUtil.write(this._META_KEY, JSON.stringify(this.meta));
  }

  // ======================== 旧版迁移 ========================

  // 检测并迁移旧版单存档（首次运行或元数据不存在时调用）
  _checkAndMigrateOldSave() {
    if (this._migrated) return;
    this._migrated = true;

    if (!StorageUtil.available()) return;

    // 检测旧版存档是否存在
    const oldRaw = StorageUtil.read(this._OLD_SAVE_KEY);
    if (!oldRaw) {
      console.log("[SaveManager] 未检测到旧版存档，跳过迁移");
      return;
    }

    // 检查槽位1是否已有数据（避免重复迁移）
    if (this._hasSlotData("1")) {
      console.log("[SaveManager] 槽位1已有数据，跳过旧版迁移");
      return;
    }

    try {
      const oldData = JSON.parse(oldRaw);
      console.log("[SaveManager] 检测到旧版单存档，开始迁移至槽位1...");

      // 将旧版存档写入槽位1
      this._writeSlotData("1", oldData);

      // 为槽位1生成元数据
      const slotMeta = this._generateSlotMeta(oldData, "旧版存档");
      this.meta.slots["1"] = slotMeta;
      this.currentSlot = "1";
      this._saveMeta();

      console.log(`[SaveManager] 旧版存档已成功迁移至槽位1 [${slotMeta.saveName}]`);
    } catch (e) {
      console.error("[SaveManager] 旧版存档迁移失败", e);
    }
  }

  // 为存档数据生成元数据摘要
  _generateSlotMeta(data, defaultName) {
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    return {
      saveName: defaultName || `存档 ${timeStr}`,
      savedAt: timeStr,
      timestamp: Date.now(),
      // 进度摘要
      summary: {
        cycle: data.cycle ?? 1,
        level: data.level ?? 1,
        map: data.currentMap ?? "wuxingVillage",
        skillCount: (data.ownedSkills && data.ownedSkills.length) || 0
      },
      // 标记为有效存档
      valid: true
    };
  }

  // ======================== 槽位操作 ========================

  // 加载指定槽位的完整存档数据
  load(slotId) {
    slotId = String(slotId);
    if (!this._isValidSlot(slotId)) {
      console.warn(`[SaveManager] 无效槽位: ${slotId}`);
      return null;
    }
    return this._readSlotData(slotId);
  }

  // 保存数据到指定槽位
  save(slotId, data) {
    slotId = String(slotId);
    if (!this._isValidSlot(slotId)) {
      console.warn(`[SaveManager] 无效槽位: ${slotId}`);
      return false;
    }

    // 写入存档数据
    if (!this._writeSlotData(slotId, data)) return false;

    // 更新该槽位的元数据
    const slotMeta = this._generateSlotMeta(data, this.getSaveName(slotId));
    slotMeta.valid = true;
    this.meta.slots[slotId] = slotMeta;
    this.currentSlot = slotId;
    this._saveMeta();

    console.log(`[SaveManager] 存档已保存至槽位 ${slotId}`);
    return true;
  }

  // 删除指定槽位的存档和元数据
  delete(slotId) {
    slotId = String(slotId);
    if (!this._isValidSlot(slotId)) return false;

    // 删除存档数据
    StorageUtil.remove(this._SAVE_KEY_PREFIX + slotId);

    // 清除元数据
    delete this.meta.slots[slotId];
    this._saveMeta();

    // 如果删除的是当前槽位，切换到第一个有效槽位
    if (this.currentSlot === slotId) {
      this.currentSlot = this._findFirstValidSlot() || "1";
    }

    console.log(`[SaveManager] 槽位 ${slotId} 已删除`);
    return true;
  }

  // 重命名指定槽位
  rename(slotId, newName) {
    slotId = String(slotId);
    if (!this._isValidSlot(slotId)) return false;
    if (!this.meta.slots[slotId]) return false;

    this.meta.slots[slotId].saveName = newName || `存档 ${slotId}`;
    this._saveMeta();

    console.log(`[SaveManager] 槽位 ${slotId} 重命名为: ${newName}`);
    return true;
  }

  // ======================== 查询接口 ========================

  // 获取某槽位的元数据（null 表示空槽）
  getSlotMeta(slotId) {
    slotId = String(slotId);
    return this.meta.slots[slotId] || null;
  }

  // 获取某槽位的显示名称
  getSaveName(slotId) {
    slotId = String(slotId);
    const m = this.meta.slots[slotId];
    return m ? m.saveName : (`空槽位 ${slotId}`);
  }

  // 获取所有槽位的元数据列表
  getAllSlotMetas() {
    const result = [];
    for (let i = 1; i <= this._MAX_SLOTS; i++) {
      const id = String(i);
      result.push({
        id,
        meta: this.meta.slots[id] || null,
        hasData: this._hasSlotData(id)
      });
    }
    return result;
  }

  // 检查槽位是否有有效存档数据
  hasValidSave(slotId) {
    slotId = String(slotId);
    return !!(this.meta.slots[slotId] && this.meta.slots[slotId].valid && this._hasSlotData(slotId));
  }

  // 获取当前活跃槽位ID
  getCurrentSlot() {
    return this.currentSlot || "1";
  }

  // 设置当前活跃槽位
  setCurrentSlot(slotId) {
    slotId = String(slotId);
    if (!this._isValidSlot(slotId)) return false;
    this.currentSlot = slotId;
    this.meta.currentSlot = slotId;
    this._saveMeta();
    return true;
  }

  // ======================== 内部工具方法 ========================

  // 验证槽位ID合法性
  _isValidSlot(slotId) {
    const num = parseInt(slotId, 10);
    return num >= 1 && num <= this._MAX_SLOTS;
  }

  // 检查槽位是否有存储的数据
  _hasSlotData(slotId) {
    if (!StorageUtil.available()) return false;
    const raw = StorageUtil.read(this._SAVE_KEY_PREFIX + slotId);
    return !!raw && raw.length > 0;
  }

  // 从 localStorage 读取槽位数据
  _readSlotData(slotId) {
    if (!StorageUtil.available()) {
      console.warn("[SaveManager] localStorage 不可用");
      return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    }

    const raw = StorageUtil.read(this._SAVE_KEY_PREFIX + slotId);
    if (!raw) {
      console.log(`[SaveManager] 槽位 ${slotId} 无存档数据`);
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(`[SaveManager] 槽位 ${slotId} 数据解析失败`, e);
      return null;
    }
  }

  // 写入槽位数据到 localStorage
  _writeSlotData(slotId, data) {
    if (!StorageUtil.available()) return false;
    return StorageUtil.write(this._SAVE_KEY_PREFIX + slotId, JSON.stringify(data));
  }

  // 查找第一个有数据的有效槽位
  _findFirstValidSlot() {
    for (let i = 1; i <= this._MAX_SLOTS; i++) {
      const id = String(i);
      if (this.hasValidSave(id)) return id;
    }
    return null;
  }
}

// ======================== 全局单例导出 ========================
// GameMain 或其他模块可通过 window.__saveManager 访问
// 用法：const smgr = new SaveManager(); smgr.init(); window.__saveManager = smgr;
