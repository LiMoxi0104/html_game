// SkillManager：动态招式管理器（v4）。
//
// 核心职责：
//   1) 继承原有「逐帧序列图三阶段攻击」引擎（windup → active → recovery + 判定盒）
//   2) 技能池管理：ownedSkills 记录已学会的全部招式
//   3) 技能槽管理：equippedSkills 将招式ID装配到六个键位
//   4) 熟练度系统：skillMastery 记录每个招式的使用等级，影响伤害倍率与进阶解锁
//   5) 数据驱动：所有招式属性来自 skillConfig.json，新增/平衡调整无需改代码
//
// v4 增强：
//   - 集成 HitboxSystem：逐帧动态碰撞箱引擎（数组逐帧取值 + 单值全帧兼容）
//   - 集成 SkillVFXRenderer：Canvas 程序化水墨特效渲染器
//   - 碰撞箱与视觉特效共享帧数据，严格同步
//   - 调试可视化模式（H 键切换）
//
// 槽位定义：
//   light1  → J          轻击槽1    light2  → S+J       轻击槽2
//   light3  → W+J        轻击槽3    heavy1  → W+K       重击槽1
//   heavy2  → A/D+K      重击槽2    heavy3  → S+K       重击槽3
//   parry   → L          弹反槽（固定不可换）
class SkillManager {
  constructor(player, assetManager, gameData) {
    this.player = player;
    this.asset = assetManager;
    this.data = gameData;              // 存档引用（ownedSkills / equippedSkills / skillMastery）

    this.skills = {};                   // id → 招式完整配置（从 skillConfig.json 注册）
    this.slots = {};                    // slotKey → {key, label, acceptType, locked} （槽位元信息）

    this.active = null;                 // 当前施放状态 {id, phaseIndex, phaseTimer, frameIndex, hasHit}
    this.cooldowns = {};                // id → 剩余冷却 ms

    // 解锁提示队列（水墨风弹窗）
    this._unlockQueue = [];
    this._unlockTimer = 0;

    // ★ v4 新增：战斗系统组件引用（由 GameMain 注入）
    this.hitboxSystem = null;           // HitboxSystem 实例
    this.vfxRenderer = null;            // SkillVFXRenderer 实例
  }

  // ======================== 初始化 ========================

  // 注册完整配置（含 skills 表 + slots 定义）
  registerConfig(config) {
    const list = (config && config.skills) || {};
    for (const id in list) this.skills[id] = list[id];
    this.slots = (config && config.slots) || {};
  }

  // 从存档初始化已拥有招式的熟练度引用（确保 data.skillMastery 中每个 ownedSkill 都有记录)
  initFromSave() {
    const d = this.data;
    if (!d.skillMastery) d.skillMastery = {};
    if (!d.ownedSkills) d.ownedSkills = ["water_slash", "parry_dagger"];
    if (!d.equippedSkills) d.equippedSkills = this._defaultEquipped();
    for (const sid of d.ownedSkills) {
      if (!(sid in d.skillMastery)) d.skillMastery[sid] = 0;
    }
  }

  _defaultEquipped() {
    return {
      light1: "water_slash",
      light2: null,
      light3: null,              // W+J 轻击槽3（新增）
      heavy1: null,
      heavy2: null,
      heavy3: null,
      parry: "parry_dagger"
    };
  }

  // ======================== 槽位查询 ========================

  // 根据槽位键获取当前装备的技能ID（未装备则返回 null）
  getSlotSkillId(slotKey) {
    return this.data.equippedSkills[slotKey] || null;
  }

  // 根据槽位键获取当前装备的技能完整配置（未装备返回 null）
  getSlotSkill(slotKey) {
    const id = this.getSlotSkillId(slotKey);
    return id ? this.skills[id] : null;
  }

  // ======================== 施放控制（继承原 SkillSystem）========================

  isCasting() { return !!this.active; }

  // ★ v4 注入战斗组件（由 GameMain 在 start() 时调用）
  setCombatSystems(hitboxSys, vfx) {
    this.hitboxSystem = hitboxSys;
    this.vfxRenderer = vfx;
  }

  canCast(skillId) {
    const s = this.skills[skillId];
    if (!s) return false;
    if (this.active) return false;
    if (this.player.state === "hurt" || this.player.state === "dead" || this.player.state === "dodge") return false;
    if ((this.cooldowns[skillId] || 0) > 0) return false;
    if (s.mpCost && this.player.mp < s.mpCost) return false;
    return true;
  }

  startCast(skillId) {
    const s = this.skills[skillId];
    if (!s || !this.canCast(skillId)) return false;

    this.active = {
      id: skillId,
      phaseIndex: 0,
      phaseTimer: 0,
      frameIndex: s.phases.length > 0 ? s.phases[0].frameStart : 0,
      hasHit: false
    };

    this.player.state = "attack";
    this.player.facingLock = true;

    // 播放元素音效（非弹反时）
    if (s.element && s.element !== "none") {
      AudioManager.play("skill_" + s.element);
    }

    return true;
  }

  update(dtMs) {
    // 冷却递减
    for (const k in this.cooldowns) {
      if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dtMs);
    }

    // 解锁提示计时器
    if (this._unlockQueue.length > 0) {
      this._unlockTimer -= dtMs;
      if (this._unlockTimer <= 0) this._unlockQueue.shift();
    }

    if (!this.active) return;

    const cast = this.active;
    const skill = this.skills[cast.id];
    if (!skill || !skill.phases || skill.phases.length === 0) {
      this.active = null;
      this.player.state = "idle";
      this.player.facingLock = false;
      return;
    }

    const phase = skill.phases[cast.phaseIndex];
    cast.phaseTimer += dtMs;

    // 计算当前阶段内的局部帧索引
    const frameDur = phase.durationMs / phase.frameCount;
    let local = Math.floor(cast.phaseTimer / frameDur);
    if (local >= phase.frameCount) local = phase.frameCount - 1;
    cast.frameIndex = phase.frameStart + local;

    // 标记命中窗口
    if (phase.hit && phase.hitFrames && phase.hitFrames.includes(cast.frameIndex)) {
      cast.hasHit = true;
    }

    // 阶段切换
    if (cast.phaseTimer >= phase.durationMs) {
      cast.phaseIndex++;
      cast.phaseTimer = 0;
      if (cast.phaseIndex >= skill.phases.length) {
        // 施放结束：冷却、扣灵气、增加熟练度、复位状态
        this.cooldowns[cast.id] = skill.cooldownMs || 0;
        if (skill.mpCost) this.player.mp = Math.max(0, this.player.mp - skill.mpCost);
        this.addMastery(cast.id, 1);       // 每次使用 +1 熟练度经验
        this._checkMasteryUnlock(cast.id);  // 检查是否触发熟练度解锁
        this.active = null;
        this.player.state = "idle";
        this.player.facingLock = false;
      }
    }
  }

  // 返回当前帧的攻击判定盒
  // ★ v4 增强：优先使用 HitboxSystem（逐帧动态碰撞箱），回退到旧逻辑
  // 叠加熟练度伤害加成
  getActiveHitbox() {
    if (!this.active) return null;
    const cast = this.active;
    const skill = this.skills[cast.id];
    if (!skill || !skill.phases) return null;
    const phase = skill.phases[cast.phaseIndex];
    if (!phase) return null;
    if (!phase.hit) return null;
    if (!phase.hitFrames || !phase.hitFrames.includes(cast.frameIndex)) return null;

    // ★ v4：优先使用 HitboxSystem 引擎
    if (this.hitboxSystem) {
      let hb = this.hitboxSystem.getCurrentHitbox(skill, cast, this.player);
      // 熟练度伤害加成（叠加在 HitboxSystem 的 baseDamage 上）
      if (hb) {
        const masteryLevel = this.getMastery(cast.id);
        const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
        hb.damage = Math.floor(hb.damage * masteryMult);
        return hb;
      }
    }

    // ★ 向后兼容：旧版单值碰撞箱计算
    const hb = phase.hitbox;
    const dir = this.player.facing === "right" ? 1 : -1;
    const px = this.player.x;
    const py = this.player.y;
    const ox = hb.offsetX * dir;
    const x = dir === 1 ? px + ox : px - ox - hb.width;
    const y = py + hb.offsetY;

    const masteryLevel = this.getMastery(cast.id);
    const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
    const finalDamage = Math.floor(phase.damage * masteryMult);

    return {
      x, y, w: hb.width, h: hb.height,
      damage: finalDamage,
      knockback: phase.knockback || 0,
      element: skill.element,
      skillId: cast.id
    };
  }

  // ======================== 熟练度系统 ========================

  // 获取某招式当前熟练度等级
  getMastery(skillId) {
    if (!this.data.skillMastery) return 0;
    return this.data.skillMastery[skillId] || 0;
  }

  // 获取某招式最大等级
  getMaxMastery(skillId) {
    const s = this.skills[skillId];
    return s ? (s.maxMastery || 5) : 5;
  }

  // 增加熟练度（amount 为增量，通常每次使用 +1）
  addMastery(skillId, amount) {
    if (!this.data.skillMastery) this.data.skillMastery = {};
    const current = this.data.skillMastery[skillId] || 0;
    const max = this.getMaxMastery(skillId);
    this.data.skillMastery[skillId] = Math.min(max, current + amount);
    GameData.save(this.data);
  }

  // 检查是否因熟练度满足条件而自动解锁进阶招式
  _checkMasteryUnlock(baseSkillId) {
    const baseSkill = this.skills[baseSkillId];
    if (!baseSkill) return;
    const currentMastery = this.getMastery(baseSkillId);

    // 遍历所有招式，查找需要该基础招式达到特定熟练度的进阶招式
    for (const id in this.skills) {
      const adv = this.skills[id];
      if (adv.unlockMode !== "mastery") continue;
      const cond = adv.unlockCondition;
      if (!cond || cond.skillId !== baseSkillId) continue;
      if (cond.masteryLevel && currentMastery >= cond.masteryLevel) {
        if (!this.isOwned(id)) {
          this.learnSkill(id);
        }
      }
    }
  }

  // ======================== 技能池：学习 / 查询 ========================

  // ★ v5 新增：解锁所有未拥有的技能（调试/测试用途）
  // 遍历 skills 配置表，对每个 isOwned()==false 的技能执行 learnSkill()
  // 返回统计：{ total: 总数, unlocked: 本次新解锁数量, skipped: 已拥有跳过数量 }
  unlockAllSkills() {
    const allSkillIds = Object.keys(this.skills);
    let unlocked = 0;
    let skipped = 0;

    for (const skillId of allSkillIds) {
      if (this.isOwned(skillId)) {
        skipped++;
        continue;                    // 已拥有，跳过避免重复操作
      }
      const success = this.learnSkill(skillId);  // 调用标准学习流程（含自动装备+存档）
      if (success) {
        unlocked++;
        console.log(`[SkillManager] 批量解锁 → ${this.skills[skillId]?.name || skillId}`);
      }
    }

    const result = { total: allSkillIds.length, unlocked, skipped };
    console.log(`[SkillManager] unlockAllSkills 完成: ${result.unlocked} 个新解锁, ${result.skipped} 个已有, 共 ${result.total} 个技能`);
    return result;
  }

  // 是否已拥有某招式
  isOwned(skillId) {
    return this.data.ownedSkills.indexOf(skillId) >= 0;
  }

  // 学习新招式：加入技能池，同类型空槽自动装备，弹出水墨风格解锁提示
  learnSkill(skillId) {
    if (this.isOwned(skillId)) return false;           // 已学会
    const s = this.skills[skillId];
    if (!s) return false;                              // 配置不存在

    // 加入技能池
    this.data.ownedSkills.push(skillId);

    // 初始化熟练度为 0
    if (!this.data.skillMastery) this.data.skillMastery = {};
    this.data.skillMastery[skillId] = 0;

    // 同类型空槽自动装备
    let autoEquipped = false;
    if (s.type === "parry") {
      // 弹反固定槽
      if (!this.data.equippedSkills.parry) {
        this.data.equippedSkills.parry = skillId;
        autoEquipped = true;
      }
    } else {
      // 找到第一个同类空槽
      for (const sk in this.slots) {
        const slotInfo = this.slots[sk];
        if (slotInfo.locked) continue;
        if (slotInfo.acceptType && slotInfo.acceptType.indexOf(s.type) >= 0) {
          if (!this.data.equippedSkills[sk]) {
            this.data.equippedSkills[sk] = skillId;
            autoEquipped = true;
            break;
          }
        }
      }
    }

    // 入队解锁提示
    this._unlockQueue.push({ id: skillId, name: s.name, time: 2800 });
    this._unlockTimer = 2800;

    GameData.save(this.data);
    console.log(`[SkillManager] 学会招式: ${s.name} (${skillId})${autoEquipped ? " [自动装备]" : ""}`);
    return true;
  }

  // 获取全部已拥有的招式列表（按类型分组可选）
  getOwnedSkills(groupByType) {
    if (!groupByType) return [...(this.data.ownedSkills || [])];
    const groups = { light: [], heavy: [], parry: [] };
    for (const id of this.data.ownedSkills) {
      const s = this.skills[id];
      if (s && groups[s.type]) groups[s.type].push(id);
    }
    return groups;
  }

  // ★ v5 新增：按五行元素获取已拥有招式列表
  // 返回指定元素的全部技能ID数组（不包含"none"类型，除非明确指定）
  getOwnedSkillsByElement(element) {
    if (!element || element === "all") return this.getOwnedSkills(false);
    return (this.data.ownedSkills || []).filter(id => {
      const s = this.skills[id];
      return s && s.element === element;
    });
  }

  // ======================== 槽位：替换 / 校验 ========================

  // 替换指定槽位的招式（严格类型校验）
  equipSkill(slotKey, skillId) {
    const slotInfo = this.slots[slotKey];
    if (!slotInfo) {
      console.warn(`[SkillManager] 未知槽位: ${slotKey}`);
      return false;
    }
    if (slotInfo.locked) {
      console.warn(`[SkillManager] 槽位 ${slotKey} 已锁定，不可更换`);
      return false;
    }

    // 允许卸下（传入 null）
    if (skillId === null) {
      this.data.equippedSkills[slotKey] = null;
      GameData.save(this.data);
      return true;
    }

    // 必须已拥有该招式
    if (!this.isOwned(skillId)) {
      console.warn(`[SkillManager] 尚未学会招式: ${skillId}`);
      return false;
    }

    const s = this.skills[skillId];
    if (!s) return false;

    // 类型校验：轻击只能入轻击槽，重击只能入重击槽
    if (slotInfo.acceptType && slotInfo.acceptType.indexOf(s.type) < 0) {
      console.warn(`[SkillManager] 类型不匹配: ${s.type} 不能装入 ${slotKey} (${slotInfo.acceptType.join("/")})`);
      return false;
    }

    // ★ 防重复装备：如果该技能已在其他槽位，先从旧槽位卸下
    for (const otherSlot in this.data.equippedSkills) {
      if (otherSlot !== slotKey && this.data.equippedSkills[otherSlot] === skillId) {
        this.data.equippedSkills[otherSlot] = null;
        console.log(`[SkillManager] 自动从 ${otherSlot} 卸下重复技能: ${s.name}`);
      }
    }

    this.data.equippedSkills[slotKey] = skillId;
    GameData.save(this.data);
    return true;
  }

  // 获取当前装备方案（供 UI 渲染用）
  getEquippedSlots() {
    return Object.assign({}, this.data.equippedSkills);
  }

  // ======================== 渲染 ========================

  // ★ v4 重构：攻击特效渲染（VFXRenderer 驱动）+ 调试可视化
  draw(ctx) {
    if (this.active) {
      const cast = this.active;
      const skill = this.skills[cast.id];

      if (skill && skill.phases) {
        const phase = skill.phases[cast.phaseIndex];
        const progress = phase ? (cast.phaseTimer / phase.durationMs || 0) : 0;

        // ★ v4：优先使用 VFXRenderer 绘制水墨特效
        if (this.vfxRenderer && skill.element && skill.element !== "none") {
          this.vfxRenderer.render(ctx, skill, cast, this.player, progress);

          // 调试模式：叠加碰撞箱可视化
          if (this.hitboxSystem && this.hitboxSystem.debugMode) {
            const hb = this.hitboxSystem.getCurrentHitbox(skill, cast, this.player)
              || this.hitboxSystem.getCurrentFrameData(skill, cast);
            if (hb) {
              // 为非命中帧也构建一个调试用的矩形区域
              const debugHb = hb.isHitFrame ? hb : {
                ...hb,
                isHitFrame: false,
                damage: 0,
                knockback: 0,
                frameIndex: cast.frameIndex,
                element: skill.element,
                skillId: cast.id
              };
              if (!debugHb.w) { debugHb.w = debugHb.width; debugHb.h = debugHb.height; }
              this.hitboxSystem.drawDebug(ctx, debugHb, this.player, null);
            }
            this.hitboxSystem.drawPlayerAnchor(ctx, this.player);
          }

          // 渲染粒子效果
          this.vfxRenderer.renderParticles(ctx);
        } else {
          // 向后兼容：旧版占位符渲染
          this._drawPlaceholderLegacy(ctx, phase);
        }
      }
    }

    // 水墨风解锁提示
    this._drawUnlockToast(ctx);
  }

  // ★ v4 旧版向后兼容：当 VFX 不可用时的简单占位符
  _drawPlaceholderLegacy(ctx, phase) {
    const p = this.player;
    const colorMap = { water: "#3a7bd5", wood: "#2e8b57", metal: "#b0b0b0", fire: "#d9480f", earth: "#8a6d3b" };
    const col = colorMap[this.skills[this.active.id].element] || "#8b0000";
    ctx.save();
    if (phase.hit) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = col;
      const hb = phase.hitbox;
      const dir = p.facing === "right" ? 1 : -1;
      const x = dir === 1 ? p.x + hb.offsetX : p.x - hb.offsetX - hb.width;
      ctx.fillRect(x, p.y + hb.offsetY, hb.width, hb.height);
    } else {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = col;
      const sx = p.facing === "right" ? p.x + p.w : p.x - 6;
      ctx.fillRect(sx, p.y + 10, 6, p.h - 20);
    }
    ctx.restore();
  }

  // —— 水墨风解锁提示 Toast ——
  _drawUnlockToast(ctx) {
    if (this._unlockQueue.length === 0) return;
    const item = this._unlockQueue[0];

    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const cx = W / 2;
    const cy = H * 0.38;

    // 墨晕扩散背景
    ctx.save();
    const progress = 1 - (this._unlockTimer / 2800);  // 0→1 出现 → 消散
    const alpha = progress < 0.15 ? progress / 0.15 : (progress > 0.8 ? (1 - progress) / 0.2 : 1);
    const scale = 1 + Math.sin(progress * Math.PI) * 0.08;

    ctx.globalAlpha = alpha * 0.88;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // 宣纸底色矩形
    const boxW = 300, boxH = 90;
    ctx.fillStyle = "rgba(26,26,26,0.85)";
    this._roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 8);
    ctx.fill();

    // 朱红上边框线
    ctx.strokeStyle = "#c0392b";
    ctx.lineWidth = 2;
    this._roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 8);
    ctx.stroke();

    // 文字：「招式已领悟」+ 名称
    ctx.fillStyle = "#caa64a";
    ctx.font = '14px "PingFang SC", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("— 招式已领悟 —", 0, -10);

    ctx.fillStyle = "#f5f0e6";
    ctx.font = '22px "PingFang SC", sans-serif';
    ctx.textBaseline = "middle";
    ctx.fillText(item.name || "", 0, 18);

    // 元素色小条
    const skill = this.skills[item.id];
    const elemColorMap = { water: "#3a7bd5", wood: "#2e8b57", metal: "#b0b0b0", fire: "#d9480f", earth: "#8a6d3b" };
    const elemCol = (skill && skill.element && elemColorMap[skill.element]) || "#666";
    ctx.fillStyle = elemCol;
    ctx.fillRect(-50, 42, 100, 3);

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);          // 右上角
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);    // 右下角
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);            // 左下角
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);                    // 左上角
    ctx.closePath();
  }
}
