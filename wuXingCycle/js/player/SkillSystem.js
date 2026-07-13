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

    // ★ v6 蓄力系统
    this.chargeState = null;            // { active, skillId, timer, maxMs, enemies }
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

  isCasting() { return !!this.active || !!(this.chargeState && this.chargeState.active); }

  // ★ 蓄力状态查询
  isCharging() { return !!(this.chargeState && this.chargeState.active); }
  isChargeFull() { return this.chargeState && this.chargeState.active && this.chargeState.timer >= this.chargeState.maxMs; }
  getChargeProgress() {
    if (!this.chargeState || !this.chargeState.active) return 0;
    return Math.min(1, this.chargeState.timer / this.chargeState.maxMs);
  }
  getChargeSkillId() { return this.chargeState ? this.chargeState.skillId : null; }

  // ★ v4 注入战斗组件（由 GameMain 在 start() 时调用）
  setCombatSystems(hitboxSys, vfx) {
    this.hitboxSystem = hitboxSys;
    this.vfxRenderer = vfx;
  }

  canCast(skillId) {
    const s = this.skills[skillId];
    if (!s) return false;
    if (this.active) return false;
    if (this.chargeState && this.chargeState.active) return false;  // ★ 蓄力中不可施放其他技能
    if (this.player.state === "hurt" || this.player.state === "dead" || this.player.state === "dodge") return false;
    if ((this.cooldowns[skillId] || 0) > 0) return false;
    if (s.mpCost && this.player.mp < s.mpCost) return false;
    return true;
  }

  // ======================== ★ v6 蓄力系统 ========================

  startCharge(skillId, enemies, map) {
    const s = this.skills[skillId];
    if (!s || !s.charge || !s.charge.enabled) return false;
    if (this.active) return false;
    if (this.chargeState && this.chargeState.active) return false;
    if (this.player.state === "hurt" || this.player.state === "dead" || this.player.state === "dodge") return false;
    if ((this.cooldowns[skillId] || 0) > 0) return false;
    if (s.mpCost && this.player.mp < s.mpCost) return false;

    const ch = s.charge;

    // ★ 地面锁定技能：蓄力开始瞬间计算并锁定落点 + 45°斜上方出生点
    let _targetLockX = null, _targetLockY = null;
    let _meteorSpawnX = null, _meteorSpawnY = null;
    if (s.groundLock) {
      const nearest = this._findNearestEnemy(s, enemies);
      if (nearest) {
        _targetLockX = nearest.x;
        _targetLockY = (map ? Math.min(nearest.footY, map.groundY) : nearest.footY) || (map ? map.groundY : nearest.footY);
      } else if (map) {
        const dir = this.player.facing === "right" ? 1 : -1;
        _targetLockX = this.player.x + this.player.w / 2 + dir * 150;
        _targetLockY = map.groundY;
      }
      // ★ 计算 45° 斜上方出生点（屏幕最上方、朝向角色一侧）
      if (_targetLockX != null) {
        const playerCx = this.player.x + this.player.w / 2;
        const toPlayerSign = (playerCx > _targetLockX) ? 1 : -1;
        _meteorSpawnY = Math.max(20, _targetLockY - 400);  // 目标上方400px
        _meteorSpawnX = _targetLockX + toPlayerSign * (_targetLockY - _meteorSpawnY);  // 45°: dx==dy
        console.log(`[SkillManager] 锁定落点(${_targetLockX.toFixed(0)},${_targetLockY.toFixed(0)}) 出生点(${_meteorSpawnX.toFixed(0)},${_meteorSpawnY.toFixed(0)})`);
      }
    }

    this.chargeState = {
      active: true,
      skillId: skillId,
      timer: 0,
      maxMs: ch.maxMs || 2000,
      minRatio: ch.minDistanceRatio || 0.2,
      enemies: enemies || [],
      _map: map || null,
      // ★ 锁定落点与出生点（蓄力期间不变）
      _targetLockX, _targetLockY,
      _meteorSpawnX, _meteorSpawnY
    };

    this.player.state = "charge";
    this.player.facingLock = true;
    this.player.vx = 0;
    this.player.vy = 0;

    console.log(`[SkillManager] 开始蓄力: ${s.name} 最大 ${this.chargeState.maxMs}ms`);
    return true;
  }

  updateCharge(dtMs) {
    if (!this.chargeState || !this.chargeState.active) return;
    this.chargeState.timer = Math.min(this.chargeState.maxMs, this.chargeState.timer + dtMs);
  }

  releaseCharge() {
    if (!this.chargeState || !this.chargeState.active) return false;
    const cs = this.chargeState;
    const s = this.skills[cs.skillId];
    if (!s) { this.chargeState = null; return false; }

    // 计算蓄力比例
    const ratio = Math.min(1, cs.timer / cs.maxMs);

    const activePhase = s.phases.find(p => p.id === "active");
    const baseDash = activePhase ? (activePhase.dashDistance || 0) : 0;

    // ★ 区分技能类型：有 dashDistance 则按位移缩放；有 groundLock 则按冲击半径缩放
    let scaledDash = 0;
    let impactScale = 1;
    if (baseDash > 0) {
      // 冲刺类（fire_dragon）：缩放位移距离
      const effectiveRatio = cs.minRatio + (1 - cs.minRatio) * ratio;
      scaledDash = Math.floor(baseDash * effectiveRatio);
      console.log(`[SkillManager] 释放蓄力: ${s.name} 蓄力比=${ratio.toFixed(2)} 位移=${scaledDash}px`);
    }
    if (s.groundLock) {
      // 锁定类（earth_meteor）：缩放冲击半径
      impactScale = ratio;
      console.log(`[SkillManager] 释放蓄力: ${s.name} 蓄力比=${ratio.toFixed(2)} 冲击波缩放=${impactScale.toFixed(2)}`);
    }

    // ★ 提取锁定位置（在清除 chargeState 之前读取）
    const mapRef = cs._map || null;
    const lockedX = cs._targetLockX;
    const lockedY = cs._targetLockY;
    const spawnX  = cs._meteorSpawnX;
    const spawnY  = cs._meteorSpawnY;

    // 清除蓄力状态
    this.chargeState = null;

    // 以缩放后参数执行技能（传入锁定的落点与出生点）
    this._startCastWithDash(s, cs.skillId, scaledDash, cs.enemies, mapRef, impactScale, lockedX, lockedY, spawnX, spawnY);
    return true;
  }

  cancelCharge() {
    if (!this.chargeState || !this.chargeState.active) return;
    console.log(`[SkillManager] 取消蓄力`);
    this.chargeState = null;
    this.player.state = "idle";
    this.player.facingLock = false;
  }

  // ★ 搜索范围内最近敌人（返回 {x, y} 或 null）
  _findNearestEnemy(skill, enemies) {
    const ts = skill.targetSearch;
    if (!ts || !ts.enabled || !enemies || enemies.length === 0) return null;
    const playerCx = this.player.x + this.player.w / 2;
    const playerCy = this.player.y + this.player.h / 2;
    let nearestDist = ts.radius || 400;
    let nearest = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      const ecx = e.x + e.w / 2;
      const ecy = e.y + e.h / 2;
      const d = MathTool.dist(playerCx, playerCy, ecx, ecy);
      if (d <= nearestDist) {
        nearestDist = d;
        nearest = { x: ecx, y: ecy, footY: e.y + e.h };  // footY = 敌人脚下（地面）
      }
    }
    return nearest;
  }

  // 内部：以指定参数执行技能（releaseCharge 调用）
  _startCastWithDash(s, skillId, dashDistance, enemies, map, chargeRatio, lockX, lockY, spawnX, spawnY) {
    // ★ 优先使用传入的锁定坐标（由 releaseCharge/startCharge 预先计算）
    let targetLockX = lockX || null;
    let targetLockY = lockY || null;
    let meteorSpawnX = spawnX || null;
    let meteorSpawnY = spawnY || null;

    // 回退：无传入值时重新搜索
    if (targetLockX == null) {
      const nearest = this._findNearestEnemy(s, enemies);
      if (s.groundLock) {
        if (nearest) {
          targetLockX = nearest.x;
          targetLockY = (map ? Math.min(nearest.footY, map.groundY) : nearest.footY) || (map ? map.groundY : nearest.footY);
        } else if (map) {
          const dir = this.player.facing === "right" ? 1 : -1;
          targetLockX = this.player.x + this.player.w / 2 + dir * 150;
          targetLockY = map.groundY;
        }
        if (targetLockX != null && meteorSpawnX == null) {
          const playerCx = this.player.x + this.player.w / 2;
          const toPlayerSign = (playerCx > targetLockX) ? 1 : -1;
          meteorSpawnY = Math.max(20, targetLockY - 400);
          meteorSpawnX = targetLockX + toPlayerSign * (targetLockY - meteorSpawnY);
        }
      } else if (nearest) {
        targetLockX = nearest.x;
        targetLockY = nearest.y;
      }
    }

    this.active = {
      id: skillId,
      phaseIndex: 0,
      phaseTimer: 0,
      frameIndex: s.phases.length > 0 ? s.phases[0].frameStart : 0,
      hasHit: false,
      _dashStartX: dashDistance > 0 ? this.player.x : null,
      _dashDistance: dashDistance,
      _hitEnemies: (dashDistance > 0 || targetLockX != null) ? new Set() : null,
      _targetLockX: targetLockX || null,
      _targetLockY: targetLockY || null,
      _chargeRatio: (chargeRatio != null) ? chargeRatio : 0,
      _phaseDurationScale: s.groundLock ? (1 + (chargeRatio || 0)) : 1,
      // ★ 陨石出生点（用于直线坠落轨迹）
      _meteorSpawnX: meteorSpawnX || null,
      _meteorSpawnY: meteorSpawnY || null
    };

    this.player.state = "attack";
    this.player.facingLock = true;

    if (s.element && s.element !== "none") {
      AudioManager.play("skill_" + s.element);
    }
    console.log(`[SkillManager] 执行技能: ${s.name}` + (chargeRatio != null ? ` 蓄力比=${chargeRatio.toFixed(2)}` : ''));
  }

  startCast(skillId, enemies, map) {
    const s = this.skills[skillId];
    if (!s || !this.canCast(skillId)) return false;

    // ★ 检测是否有冲刺位移（fire_dragon 等）
    const activePhase = s.phases.find(p => p.id === "active");
    const dashDist = activePhase ? (activePhase.dashDistance || 0) : 0;

    // ★ 目标锁定
    let targetLockX = null;
    let targetLockY = null;
    const nearest = this._findNearestEnemy(s, enemies);

    if (s.groundLock) {
      // ★ 地面锁定模式（earth_meteor）：落点在敌人脚底/地面
      if (nearest) {
        targetLockX = nearest.x;
        const groundY = map ? map.groundY : (nearest.footY);
        targetLockY = nearest.footY || groundY;
        if (map && targetLockY > map.groundY) targetLockY = map.groundY;
      } else if (map) {
        const dir = this.player.facing === "right" ? 1 : -1;
        targetLockX = this.player.x + this.player.w / 2 + dir * 150;
        targetLockY = map.groundY;
      }
      console.log(`[SkillManager] 地面锁定 → (${targetLockX ? targetLockX.toFixed(0) : 'X'}, ${targetLockY ? targetLockY.toFixed(0) : 'Y'})`);
    } else if (nearest) {
      targetLockX = nearest.x;
      targetLockY = nearest.y;
      console.log(`[SkillManager] 锁定目标 → (${targetLockX.toFixed(0)}, ${targetLockY.toFixed(0)})`);
    }

    this.active = {
      id: skillId,
      phaseIndex: 0,
      phaseTimer: 0,
      frameIndex: s.phases.length > 0 ? s.phases[0].frameStart : 0,
      hasHit: false,
      // ★ 冲刺位移相关
      _dashStartX: dashDist > 0 ? this.player.x : null,
      _dashDistance: dashDist,
      _hitEnemies: (dashDist > 0 || targetLockX != null) ? new Set() : null,
      // ★ 目标锁定相关
      _targetLockX: targetLockX,
      _targetLockY: targetLockY,
      _chargeRatio: 0,   // 非蓄力模式默认基础大小(1x)
      _phaseDurationScale: 1  // 非蓄力模式正常速度
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

    // ★ 蓄力中：由 GameMain 调用 updateCharge 驱动，此处跳过施放逻辑
    if (this.chargeState && this.chargeState.active) return;

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
    // ★ 阶段时长缩放（earth_meteor 蓄力越久下落越慢）
    cast.phaseTimer += dtMs / (cast._phaseDurationScale || 1);

    // 计算当前阶段内的局部帧索引
    const frameDur = phase.durationMs / phase.frameCount;
    let local = Math.floor(cast.phaseTimer / frameDur);
    if (local >= phase.frameCount) local = phase.frameCount - 1;
    cast.frameIndex = phase.frameStart + local;

    // ★ 冲刺位移：在 active 阶段按 easeOutCubic 曲线移动角色
    if (phase.id === "active" && cast._dashDistance > 0 && cast._dashStartX != null) {
      const progress = Math.min(1, cast.phaseTimer / phase.durationMs);
      // easeOutCubic: 1 - (1 - t)^3，模拟自然冲刺减速
      const t = 1 - Math.pow(1 - progress, 3);
      const dir = this.player.facing === "right" ? 1 : -1;
      this.player.x = cast._dashStartX + dir * cast._dashDistance * t;
    }

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

    // ★ 目标锁定技能：生成以锁定坐标为圆心的圆形碰撞箱
    if (cast._targetLockX != null) {
      return this._getTargetedHitbox(skill, cast, phase);
    }

    // ★ attachToPlayer：碰撞箱与角色尺寸完全一致，同步跟随位移
    if (phase.attachToPlayer) {
      const masteryLevel = this.getMastery(cast.id);
      const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
      const finalDamage = Math.floor(phase.damage * masteryMult);
      return {
        x: this.player.x,
        y: this.player.y,
        w: this.player.w,
        h: this.player.h,
        damage: finalDamage,
        knockback: phase.knockback || 0,
        element: skill.element,
        skillId: cast.id,
        hitEnemies: cast._hitEnemies || null
      };
    }

    // ★ spriteHitbox：精灵图圆形碰撞箱，固定半径，精确居中（water_slash）
    if (phase.spriteHitbox && phase.spriteHitbox.shape === "circle") {
      const sh = phase.spriteHitbox;
      const hb = phase.hitbox;  // 用于计算精灵图中心
      const dir = this.player.facing === "right" ? 1 : -1;
      const px = this.player.x;
      const py = this.player.y;
      const ox = hb.offsetX * dir;
      const x = dir === 1 ? px + ox : px - ox - hb.width;
      const y = py + hb.offsetY;
      const cx = x + hb.width / 2;
      const cy = y + hb.height / 2;

      const masteryLevel = this.getMastery(cast.id);
      const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
      const finalDamage = Math.floor(phase.damage * masteryMult);

      return {
        shape: "circle",
        cx: cx,
        cy: cy,
        radius: sh.radius,
        damage: finalDamage,
        knockback: phase.knockback || 0,
        element: skill.element,
        skillId: cast.id,
        hitEnemies: cast._hitEnemies || null
      };
    }

    // ★ v4：优先使用 HitboxSystem 引擎
    if (this.hitboxSystem) {
      let hb = this.hitboxSystem.getCurrentHitbox(skill, cast, this.player);
      // 熟练度伤害加成（叠加在 HitboxSystem 的 baseDamage 上）
      if (hb) {
        const masteryLevel = this.getMastery(cast.id);
        const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
        hb.damage = Math.floor(hb.damage * masteryMult);
        hb.hitEnemies = cast._hitEnemies || null;  // ★ 冲刺技去重
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
      skillId: cast.id,
      hitEnemies: cast._hitEnemies || null  // ★ 冲刺技的去重集合
    };
  }

  // ★ 目标锁定技能：生成圆形碰撞箱，圆心为锁定坐标
  _getTargetedHitbox(skill, cast, phase) {
    const cx = cast._targetLockX;
    const cy = cast._targetLockY;

    // 从 perFrameHitboxes 或 hitbox 推导当前帧的冲击半径
    let baseRadius = 80;  // 默认最小半径
    if (phase.perFrameHitboxes && phase.perFrameHitboxes.length > 0) {
      const localFrame = Math.max(0, cast.frameIndex - (phase.frameStart || 0));
      const idx = Math.min(localFrame, phase.perFrameHitboxes.length - 1);
      const fhb = phase.perFrameHitboxes[idx];
      baseRadius = Math.max(fhb.width, fhb.height) / 2;
    } else if (phase.hitbox) {
      baseRadius = Math.max(phase.hitbox.width, phase.hitbox.height) / 2;
    }

    // ★ 蓄力半径缩放（earth_meteor 等 groundLock 技能，线性 1x → 2x）
    let radius = baseRadius;
    if (skill.groundLock) {
      const chargeRatio = (cast._chargeRatio != null) ? cast._chargeRatio : 0;
      radius = baseRadius * (1 + chargeRatio);  // 0→1 对应 1x→2x
    }

    const masteryLevel = this.getMastery(cast.id);
    const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
    const finalDamage = Math.floor(phase.damage * masteryMult);

    return {
      shape: "circle",
      cx: cx,
      cy: cy,
      radius: radius,
      damage: finalDamage,
      knockback: phase.knockback || 0,
      element: skill.element,
      skillId: cast.id,
      hitEnemies: cast._hitEnemies || null
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
    // ★ v6 蓄力条 UI（角色头顶）
    if (this.chargeState && this.chargeState.active) {
      this._drawChargeBar(ctx);
      // ★ 按蓄力技能的元素类型分派专属蓄力特效（火≠土，严禁混用）
      if (this.vfxRenderer) {
        const cs = this.chargeState;
        const chargeSkill = this.skills[cs.skillId];
        const elem = chargeSkill ? chargeSkill.element : null;
        this.vfxRenderer.renderCharge(ctx, this.player, elem, this.getChargeProgress(),
          cs._meteorSpawnX, cs._meteorSpawnY, cs._targetLockX, cs._targetLockY);
        this.vfxRenderer.renderParticles(ctx);
      }
    }

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

  // ★ v6 蓄力进度条（角色头顶）
  _drawChargeBar(ctx) {
    const cs = this.chargeState;
    if (!cs || !cs.active) return;
    const p = this.player;
    const progress = Math.min(1, cs.timer / cs.maxMs);
    const barW = 40;
    const barH = 6;
    const x = p.x + p.w / 2 - barW / 2;
    const y = p.y - 18;

    ctx.save();

    // 背景条（暗色）
    ctx.fillStyle = "rgba(20,20,20,0.7)";
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);
    ctx.strokeStyle = "rgba(120,120,120,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, barW + 2, barH + 2);

    // ★ 按蓄力技能元素配色（火=红橙 土=赭棕，不再硬编码红色）
    const chargeSkill = this.skills[cs.skillId];
    const elem = chargeSkill ? chargeSkill.element : "fire";
    const barPalette = {
      fire:  { c0: "#ff4400", c1: "#ff8800", c2: "#ffcc00", max: "#ffffc8" },
      earth: { c0: "#8a5a20", c1: "#b8860b", c2: "#daa520", max: "#ffe4a0" }
    };
    const pal = barPalette[elem] || barPalette.fire;

    // 蓄力填充条
    const fillW = barW * progress;
    const fillGrad = ctx.createLinearGradient(x, y, x + barW, y);
    fillGrad.addColorStop(0, pal.c0);
    fillGrad.addColorStop(0.5, pal.c1);
    fillGrad.addColorStop(1, pal.c2);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(x, y, fillW, barH);

    // 满蓄力闪光效果（按元素配色）
    if (progress >= 1) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.012) * 0.5;
      ctx.fillStyle = `rgba(255,255,200,${pulse * 0.7})`;
      ctx.fillRect(x, y, barW, barH);
      ctx.fillStyle = pal.max;
      ctx.font = 'bold 10px "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("MAX", p.x + p.w / 2, y - 6);
    }

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
