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

    // ★ 墨龙冲三段式动画状态机（fire_dragon 专属）
    this.molong = null;

    // ★ 金行·天剑坠 旋转动画状态机
    this.jianren = null;

    // ★ 荆棘牢笼草对象帧（hit/ 序列）
    this._thornTrapFrames = [];
  }

  /** ★ 设置荆棘牢笼草对象动画帧 */
  setThornTrapFrames(frames) { this._thornTrapFrames = frames || []; }

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

  isCasting() {
    // ★ 荆棘牢笼：attack3 播完后玩家已释放，草独立运行期间不计为施法中
    if (this.active && this.active._playerReleased) return false;
    return !!this.active || !!(this.chargeState && this.chargeState.active);
  }

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

  // ★ 注入墨龙冲动画状态机（由 GameMain 在 start() 时调用）
  setMolongAnim(molong) {
    this.molong = molong;
  }

  // ★ 注入金行·天剑坠 旋转动画状态机
  setJianrenAnim(jianren) {
    this.jianren = jianren;
  }

  canCast(skillId) {
    const s = this.skills[skillId];
    if (!s) return false;
    if (s.unlockMode === "locked") return false;
    if (this.active) return false;
    if (this.player._hardRecovery > 0) return false;  // ★ 硬直中不可施放
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
      // ★ 陨石出生点：目标正上方 400px，水平微偏 ~80px（~11° 斜角，接近垂直坠落）
      if (_targetLockX != null) {
        const playerCx = this.player.x + this.player.w / 2;
        const toPlayerSign = (playerCx > _targetLockX) ? 1 : -1;
        _meteorSpawnY = Math.max(20, _targetLockY - 400);  // 目标上方400px
        _meteorSpawnX = _targetLockX + toPlayerSign * 80;   // 水平微偏 80px（≈arctan(80/400)=11°）
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

    // ★ fire_dragon 专属：启动墨龙冲蓄力动画
    if (skillId === 'fire_dragon' && this.molong) {
      this.molong.startCharge();
    }

    // ★ metal_sword 专属：启动天剑坠蓄力动画
    if (skillId === 'metal_sword' && this.jianren) {
      this.jianren.startCharge();
      this.player.useSkillJianSprite = true;
    }

    // ★ earth_meteor 专属：启动 attack3 蓄力动画（完整播放 55 帧）
    if (skillId === 'earth_meteor') {
      const chargeMs = ch.maxMs || 2000;
      this.player.startAttack3Anim(chargeMs);
      console.log(`[SkillManager] 陨星震蓄力动画启动, ${chargeMs}ms`);
    }

    console.log(`[SkillManager] 开始蓄力: ${s.name} 最大 ${this.chargeState.maxMs}ms`);
    return true;
  }

  updateCharge(dtMs) {
    if (!this.chargeState || !this.chargeState.active) return;
    this.chargeState.timer = Math.min(this.chargeState.maxMs, this.chargeState.timer + dtMs);

    // ★ 墨龙冲蓄力缩放：ratio 0→1 映射到 scale 1→4
    if (this.chargeState.skillId === 'fire_dragon' && this.molong) {
      const ratio = this.chargeState.timer / this.chargeState.maxMs;
      this.molong.setChargeProgress(ratio);
    }

    // ★ 天剑坠蓄力缩放：ratio 0→1 映射剑身高度 1x→2x
    if (this.chargeState.skillId === 'metal_sword' && this.jianren) {
      const ratio = this.chargeState.timer / this.chargeState.maxMs;
      this.jianren.setChargeProgress(ratio);
    }
  }

  releaseCharge() {
    if (!this.chargeState || !this.chargeState.active) return false;
    const cs = this.chargeState;
    const s = this.skills[cs.skillId];
    if (!s) { this.chargeState = null; return false; }

    // 计算蓄力比例
    const ratio = Math.min(1, cs.timer / cs.maxMs);

    // ★ metal_sword 走专属旋转攻击（不进相位移驱动）
    if (cs.skillId === 'metal_sword' && this.jianren) {
      this.active = {
        id: 'metal_sword',
        phaseIndex: 0,
        phaseTimer: 0,
        frameIndex: 0,
        hasHit: true,
        _metalSwordMode: true     // ★ 标志位：update() 会路由到 jianren
      };
      this.player.state = "attack";
      this.player.facingLock = true;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.useSkillJianSprite = true;
      this.jianren.startSpinPhase1();
      this.chargeState = null;
      console.log(`[SkillManager] 释放天剑坠: 蓄力比=${ratio.toFixed(2)}`);
      return true;
    }

    // ★ earth_meteor 释放蓄力：停止 attack3 动画，切换到 windup VFX
    if (cs.skillId === 'earth_meteor') {
      this.player.stopAttack3Anim();
    }

    const activePhase = s.phases.find(p => p.id === "active");
    const baseDash = activePhase ? (activePhase.dashDistance || 0) : 0;

    // ★ 区分技能类型：有 dashDistance 则按位移缩放；有 groundLock 则按冲击半径缩放
    //    通用蓄力：伤害倍率 1x → 1.5x
    let scaledDash = 0;
    let impactScale = 1;
    let chargeDmgMult = 1;
    if (baseDash > 0) {
      // 冲刺类（fire_dragon）：缩放位移距离
      const effectiveRatio = cs.minRatio + (1 - cs.minRatio) * ratio;
      scaledDash = Math.floor(baseDash * effectiveRatio);
      console.log(`[SkillManager] 释放蓄力: ${s.name} 蓄力比=${ratio.toFixed(2)} 位移=${scaledDash}px`);
    } else if (!s.groundLock) {
      // ★ 通用蓄力重击（metal_blade 等自身AOE）：蓄力越长伤害越高 1x→1.5x
      chargeDmgMult = 1 + ratio * 0.5;
      console.log(`[SkillManager] 释放蓄力: ${s.name} 蓄力比=${ratio.toFixed(2)} 伤害倍率=${chargeDmgMult.toFixed(2)}x`);
    }
    if (s.groundLock) {
      // earth_meteor / fire_inferno / earthquake：缩放冲击半径 + 伤害
      impactScale = ratio;
      chargeDmgMult = 1 + ratio * 0.3;  // 1x→1.3x（地面锁定技蓄力伤害加成略低，以半径为主）
      console.log(`[SkillManager] 释放蓄力: ${s.name} 蓄力比=${ratio.toFixed(2)} 冲击波缩放=${(1+impactScale).toFixed(2)}x 伤害=${chargeDmgMult.toFixed(2)}x`);
    }

    // ★ 提取锁定位置（在清除 chargeState 之前读取）
    const mapRef = cs._map || null;
    const lockedX = cs._targetLockX;
    const lockedY = cs._targetLockY;
    const spawnX  = cs._meteorSpawnX;
    const spawnY  = cs._meteorSpawnY;

    // ★ fire_dragon 专属：蓄力释放时切换到墨龙冲 DASH 阶段
    if (cs.skillId === 'fire_dragon' && this.molong) {
      this.molong.startDash();
    }

    // 清除蓄力状态
    this.chargeState = null;

    // 以缩放后参数执行技能（传入锁定的落点与出生点 + 伤害倍率）
    this._startCastWithDash(s, cs.skillId, scaledDash, cs.enemies, mapRef, impactScale, lockedX, lockedY, spawnX, spawnY, chargeDmgMult);
    return true;
  }

  cancelCharge() {
    if (!this.chargeState || !this.chargeState.active) return;
    console.log(`[SkillManager] 取消蓄力`);
    // ★ 取消墨龙冲动画
    if (this.molong && this.molong.isActive) {
      this.molong.reset();
    }
    // ★ 取消天剑坠动画
    if (this.jianren && this.jianren.isActive) {
      this.jianren.reset();
    }
    // ★ 取消陨星震 attack3 蓄力动画
    if (this.chargeState.skillId === 'earth_meteor') {
      this.player.stopAttack3Anim();
    }
    this.player.useSkillJianSprite = false;
    this.chargeState = null;
    this.player.state = "idle";
    this.player.facingLock = false;
  }

  // ★★★ 荆棘牢笼逐帧更新 ★★★
  _updateWoodTrap(dtMs) {
    const cast = this.active;
    if (!cast || !cast._woodTrapMode) return;

    const skill = this.skills['wood_thorn'];
    if (!skill) { this.active = null; return; }

    // 攻击期间禁止移动
    this.player.vx = 0;
    this.player.vy = 0;

    // 推进 attack3 动画时间（帧推进在 Player.update 中完成）
    cast.phaseTimer += dtMs;

    // ★ 到达触发帧 → 启动草生长动画
    if (!cast._trapTriggered) {
      const triggerTime = (cast._triggerFrame / (skill.attack3Frames || 55)) * cast._totalMs;
      if (cast.phaseTimer >= triggerTime) {
        cast._trapTriggered = true;
        cast._grassActive = true;
        cast._grassTimer = 0;
        cast._grassFrameIdx = 0;
        console.log(`[SkillManager] 荆棘牢笼 → 草生长动画触发 (t=${cast.phaseTimer.toFixed(0)}ms)`);
      }
    }

    // ★ 推进草生长动画（hit/ 帧序列）
    if (cast._grassActive && this._thornTrapFrames.length > 0) {
      cast._grassTimer += dtMs;
      const grassTotal = skill.grassTotalMs || 2000;
      const grassCount = skill.grassFrames || 121;
      const interval = grassTotal / grassCount;
      cast._grassFrameIdx = Math.min(grassCount - 1, Math.floor(cast._grassTimer / interval));

      // 草动画播完 → 进入驻留阶段（保留显示2秒）
      if (cast._grassTimer >= grassTotal) {
        cast._grassActive = false;
        cast._grassDwell = true;
        cast._grassDwellTimer = 0;
        cast._grassFrameIdx = grassCount - 1;  // 定格在最后一帧
        console.log(`[SkillManager] 荆棘牢笼 → 草生长完成, 进入驻留 ${skill.grassDwellMs || 2000}ms`);
      }
    }

    // ★ 驻留阶段：草保留显示不动，倒计时2秒
    if (cast._grassDwell) {
      const dwellMs = skill.grassDwellMs || 2000;
      cast._grassDwellTimer += dtMs;
      if (cast._grassDwellTimer >= dwellMs) {
        cast._grassDwell = false;
        cast._trapDone = true;
        // 对目标敌人造成伤害（可控制时才造成伤害）
        if (!cast._damageDealt) {
          cast._damageDealt = true;
          const target = cast._trapTarget;
          if (target && target.alive && typeof target.takeDamage === 'function' && cast._canControl) {
            const dmg = skill.trapDamage || 20;
            target.takeDamage(dmg);
            console.log(`[SkillManager] 荆棘牢笼 → 造成 ${dmg} 点伤害`);
          } else if (!cast._canControl) {
            console.log(`[SkillManager] 荆棘牢笼 → 敌人悬空, 跳过伤害`);
          }
        }
        console.log(`[SkillManager] 荆棘牢笼 → 驻留完成, 草消失`);
      }
    }

    // ★ attack3 动画播完 → 立即释放玩家自由移动（草继续独立运行）
    if (!cast._playerReleased && cast.phaseTimer >= cast._totalMs) {
      cast._playerReleased = true;
      this.player.state = "idle";
      this.player.facingLock = false;
      this.player.stopAttack3Anim();
      console.log(`[SkillManager] 荆棘牢笼 → attack3 完成, 玩家恢复自由移动 (草持续中)`);
    }

    // ★ attack3 播完且草已完毕 → 结束技能
    if (cast.phaseTimer >= cast._totalMs && cast._trapDone) {
      this._finishWoodThorn(cast, skill);
      return;
    }

    // ★ 边界：目标已死亡 → 提前结束（跳过驻留）
    const target = cast._trapTarget;
    if (target && !target.alive && cast._trapTriggered && !cast._trapDone) {
      cast._grassActive = false;
      cast._grassDwell = false;
      cast._trapDone = true;
      if (typeof target.releaseImprison === 'function') {
        target.releaseImprison();
      }
    }
  }

  _finishWoodThorn(cast, skill) {
    // 解除目标禁锢（仅当施加过禁锢时）
    const target = cast._trapTarget;
    if (cast._canControl && target && typeof target.releaseImprison === 'function') {
      target.releaseImprison();
    }

    // 冷却、扣蓝、熟练度
    this.cooldowns['wood_thorn'] = skill.cooldownMs || 0;
    if (skill.mpCost) this.player.mp = Math.max(0, this.player.mp - skill.mpCost);
    this.addMastery('wood_thorn', 1);
    this._checkMasteryUnlock('wood_thorn');

    // 清理状态
    this.active = null;
    // ★ attack3 播完时已释放玩家，此处仅做最终清理
    if (!cast._playerReleased) {
      this.player.state = "idle";
      this.player.facingLock = false;
      this.player.stopAttack3Anim();
    }
    console.log(`[SkillManager] 荆棘牢笼 → 技能结束`);
  }

  // ★★★ 荆棘牢笼专属启动逻辑 ★★★
  _startWoodThorn(s, enemies, map) {
    // 1. 搜索最近敌人
    const nearest = this._findNearestEnemy(s, enemies);
    if (!nearest) {
      console.warn("[SkillManager] 荆棘牢笼：范围内无目标，技能取消");
      return false;
    }

    // 2. 寻找敌人引用（用于后续禁锢/伤害）
    let targetEnemy = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      const ecx = e.x + e.w / 2;
      const ecy = e.y + e.h / 2;
      if (MathTool.dist(nearest.x, nearest.y, ecx, ecy) < 20) {
        targetEnemy = e;
        break;
      }
    }
    if (!targetEnemy) {
      // 回退：取与锁定坐标最接近的敌人
      let minD = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const ecx = e.x + e.w / 2;
        const ecy = e.y + e.h / 2;
        const d = MathTool.dist(nearest.x, nearest.y, ecx, ecy);
        if (d < minD) { minD = d; targetEnemy = e; }
      }
    }

    // 3. 转向锁定目标
    const ecx = targetEnemy.x + targetEnemy.w / 2;
    this.player.facing = (ecx > this.player.x + this.player.w / 2) ? "right" : "left";

    // 4. ★ 计算草对象位置：严格基于地面网格
    //    groundY：地图地表 Y 坐标（权威地面线）
    //    footY：  敌人脚底碰撞体 Y 坐标（仅用于悬空检测，不做草定位）
    const footY = targetEnemy.y + targetEnemy.h;
    // ★ 草底部 = 地图地面；无地图时回退用敌人脚底
    const groundY = (map && map.groundY != null) ? map.groundY : footY;
    const groundOffset = s.groundOffset || 0;  // 微调（正=下沉）

    // ★ 悬空检测：敌人脚底离地面过高 → 草无法接触敌人 → 无控制效果
    const floatGap = footY - groundY;
    const floatThreshold = s.floatThreshold || 30;
    const canControl = floatGap <= floatThreshold;
    console.log(`[SkillManager] 荆棘牢笼 → 悬空检测: gap=${floatGap.toFixed(0)}px ` +
      `(阈值${floatThreshold}px) → ${canControl ? "可控制" : "敌人悬空, 无禁锢效果"}`);

    const trapX = targetEnemy.x + targetEnemy.w / 2;   // 水平居中于敌人
    const trapY = groundY + (groundOffset || 0);        // ★ 草底部紧贴地面 + 偏移
    const grassW = s.grassWidth || 120;
    const grassH = s.grassHeight || 120;

    // 5. 设置玩家状态，启动 attack3 动画
    this.player.state = "attack";
    this.player.facingLock = true;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.startAttack3Anim(s.attack3TotalMs || 2800);

    // 6. 创建荆棘牢笼专属 active 状态
    this.active = {
      _woodTrapMode: true,
      id: "wood_thorn",
      phaseIndex: 0,
      phaseTimer: 0,
      frameIndex: 0,
      hasHit: false,
      _trapTarget: targetEnemy,
      _trapX: trapX,
      _trapY: trapY,
      _trapW: grassW,
      _trapH: grassH,
      _grassTimer: 0,
      _grassFrameIdx: 0,
      _grassActive: false,
      _grassDwell: false,
      _grassDwellTimer: 0,
      _canControl: canControl,
      _playerReleased: false,
      _trapTriggered: false,
      _trapDone: false,
      _damageDealt: false,
      _totalMs: s.attack3TotalMs || 2800,
      _triggerFrame: s.attack3TriggerFrame || 21,
      _hitEnemies: new Set()
    };

    // 7. 施加禁锢（仅当草可接触敌人时）控制时间 = 技能总时长 + 额外2秒
    if (canControl && typeof targetEnemy.imprison === 'function') {
      const controlMs = (s.attack3TotalMs || 2800) + (s.grassTotalMs || 2000)
        + (s.grassDwellMs || 2000) + (s.controlExtraMs || 2000);
      targetEnemy.imprison(controlMs);
    }

    if (s.element && s.element !== "none") {
      AudioManager.play("skill_" + s.element);
    }
    console.log(`[SkillManager] 荆棘牢笼 → 锁定目标(${trapX.toFixed(0)},${trapY.toFixed(0)})`);
    return true;
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
  _startCastWithDash(s, skillId, dashDistance, enemies, map, chargeRatio, lockX, lockY, spawnX, spawnY, chargeDmgMult) {
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
          meteorSpawnX = targetLockX + toPlayerSign * 80;   // 水平微偏 80px，接近垂直
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
      _chargeDmgMult: (chargeDmgMult != null) ? chargeDmgMult : 1,
      _phaseDurationScale: s.groundLock ? (1 + (chargeRatio || 0)) : 1,
      // ★ 陨石出生点（用于直线坠落轨迹）
      _meteorSpawnX: meteorSpawnX || null,
      _meteorSpawnY: meteorSpawnY || null
    };

    this.player.state = "attack";
    this.player.facingLock = true;

    // ★ 轻攻击动画：除"木行·荆棘牢笼"外，播放 attack1/ 序列帧
    this._triggerLightAttackAnim(s);

    if (s.element && s.element !== "none") {
      AudioManager.play("skill_" + s.element);
    }
    console.log(`[SkillManager] 执行技能: ${s.name}` + (chargeRatio != null ? ` 蓄力比=${chargeRatio.toFixed(2)}` : ''));
  }

  startCast(skillId, enemies, map) {
    const s = this.skills[skillId];
    if (!s || !this.canCast(skillId)) return false;

    // ★★★ 荆棘牢笼专属路径 ★★★
    if (skillId === "wood_thorn") {
      return this._startWoodThorn(s, enemies, map);
    }

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

    // ★ 轻攻击动画：除"木行·荆棘牢笼"外，播放 attack1/ 序列帧
    this._triggerLightAttackAnim(s);

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

    // ★ 墨龙冲动画驱动（贯穿全流程：CHARGE/DASH/END）★
    if (this.molong && this.molong.isActive) {
      this.molong.update(dtMs);
    }

    // ★ 金行·天剑坠 旋转驱动（由 GameMain 调用 jianren.update 传入 enemies）

    // ★ 墨龙冲收尾阶段：技能 phases 已结束但 END 动画还在播
    if (this.active && this.active._molongEndPhase) {
      if (this.molong && this.molong.state === MolongAnimState.END) {
        // 动画还在播，保持 attack 状态
        return;
      }
      // 动画完成 → 清理
      this.active = null;
      this.player.state = "idle";
      this.player.facingLock = false;
      return;
    }

    // 蓄力中：由 GameMain 调用 updateCharge 驱动，此处跳过施放逻辑
    if (this.chargeState && this.chargeState.active) return;

    if (!this.active) return;

    // ★★★ 荆棘牢笼模式 ★★★
    if (this.active._woodTrapMode) {
      return this._updateWoodTrap(dtMs);
    }

    // ★ 天剑坠收尾：active 已建立但 jianren 已 DONE
    if (this.active._metalSwordMode) {
      if (this.jianren && this.jianren.isDone) {
        // 清理：扣蓝、冷却、熟练度
        const skill = this.skills['metal_sword'];
        if (skill) {
          this.cooldowns['metal_sword'] = skill.cooldownMs || 0;
          if (skill.mpCost) this.player.mp = Math.max(0, this.player.mp - skill.mpCost);
          this.addMastery('metal_sword', 1);
          this._checkMasteryUnlock('metal_sword');
        }
        this.active = null;
        this.player.state = "idle";
        this.player.facingLock = false;
        this.player.useSkillJianSprite = false;  // 恢复原精灵
        return;
      }
      // 攻击期间：禁止移动、阻止相位移推进
      this.player.vx = 0;
      return;
    }

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

    // ★ 墨龙冲：检测 active 阶段结束 → 触发收尾动画
    if (cast.id === 'fire_dragon' && this.molong && phase.id === 'active' &&
        cast.phaseTimer >= phase.durationMs) {
      // active 阶段即将结束，位移完成，触发墨龙冲 END 阶段
      if (this.molong.state === MolongAnimState.DASH) {
        this.molong.endDash();
      }
    }

    // 阶段切换
    if (cast.phaseTimer >= phase.durationMs) {
      cast.phaseIndex++;
      cast.phaseTimer = 0;
      if (cast.phaseIndex >= skill.phases.length) {
        // ★ 墨龙冲：延迟 idle 复位，等 END 动画播完
        if (cast.id === 'fire_dragon' && this.molong &&
            this.molong.state === MolongAnimState.END) {
          // 保留 this.active，标记为收尾阶段
          this.active._molongEndPhase = true;
          // 施放结束但动画未结束：冷却、扣蓝、熟练度等仍需执行
          this.cooldowns[cast.id] = skill.cooldownMs || 0;
          if (skill.mpCost) this.player.mp = Math.max(0, this.player.mp - skill.mpCost);
          this.addMastery(cast.id, 1);
          this._checkMasteryUnlock(cast.id);
          return;
        }

        // 正常施放结束：冷却、扣灵气、增加熟练度、复位状态
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
      const chargeDmgMult = (cast._chargeDmgMult != null) ? cast._chargeDmgMult : 1;
      const finalDamage = Math.floor(phase.damage * masteryMult * chargeDmgMult);

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
      // 熟练度伤害加成（叠加在 HitboxSystem 的 baseDamage 上）+ 蓄力倍率
      if (hb) {
        const masteryLevel = this.getMastery(cast.id);
        const masteryMult = 1 + (skill.masteryBonus || 0) * masteryLevel;
        const chargeDmgMult = (cast._chargeDmgMult != null) ? cast._chargeDmgMult : 1;
        hb.damage = Math.floor(hb.damage * masteryMult * chargeDmgMult);
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
    const chargeDmgMult = (cast._chargeDmgMult != null) ? cast._chargeDmgMult : 1;
    const finalDamage = Math.floor(phase.damage * masteryMult * chargeDmgMult);

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
    const chargeDmgMult = (cast._chargeDmgMult != null) ? cast._chargeDmgMult : 1;
    const finalDamage = Math.floor(phase.damage * masteryMult * chargeDmgMult);

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
      const skillCfg = this.skills[skillId];
      if (skillCfg && skillCfg.unlockMode === "locked") {
        skipped++;
        continue;                    // ★ 锁定技能不可解锁，跳过
      }
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
    if (s.unlockMode === "locked") {
      console.warn(`[SkillManager] 技能 ${s.name}(${skillId}) 处于锁定状态，不可学习`);
      return false;                                    // ★ 锁定技能永久不可学
    }

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
      // ★ 蓄力 VFX：墨龙冲/天剑坠跳过（精灵图已替代）
      const chargeSkill = this.skills[this.chargeState.skillId];
      const isMolongCharge = chargeSkill && chargeSkill.id === 'fire_dragon' && this.molong && this.molong.isActive;
      const isJianrenCharge = chargeSkill && chargeSkill.id === 'metal_sword' && this.jianren && this.jianren.isActive;
      if (this.vfxRenderer && !isMolongCharge && !isJianrenCharge) {
        const cs = this.chargeState;
        const elem = chargeSkill ? chargeSkill.element : null;
        this.vfxRenderer.renderCharge(ctx, this.player, elem, this.getChargeProgress(),
          cs._meteorSpawnX, cs._meteorSpawnY, cs._targetLockX, cs._targetLockY);
        this.vfxRenderer.renderParticles(ctx);
      }
    }

    if (this.active) {
      const cast = this.active;
      const skill = this.skills[cast.id];

      // ★ 墨龙冲/天剑坠动画播放期间跳过程序化 VFX（精灵图已替代）
      const isMolongActive = cast.id === 'fire_dragon' && this.molong && this.molong.isActive;
      const isJianrenActive = cast._metalSwordMode && this.jianren && this.jianren.isActive;

      if (skill && skill.phases) {
        const phase = skill.phases[cast.phaseIndex];
        const progress = phase ? (cast.phaseTimer / phase.durationMs || 0) : 0;

        if (phase && this.vfxRenderer && skill.element && skill.element !== "none" && !isMolongActive && !isJianrenActive) {
          // ★ v4：优先使用 VFXRenderer 绘制水墨特效
          this.vfxRenderer.render(ctx, skill, cast, this.player, progress);

          // 调试模式：叠加碰撞箱可视化
          if (this.hitboxSystem && this.hitboxSystem.debugMode) {
            const hb = this.hitboxSystem.getCurrentHitbox(skill, cast, this.player)
              || this.hitboxSystem.getCurrentFrameData(skill, cast);
            if (hb) {
              const debugHb = hb.isHitFrame ? hb : {
                ...hb,
                isHitFrame: false, damage: 0, knockback: 0,
                frameIndex: cast.frameIndex, element: skill.element, skillId: cast.id
              };
              if (!debugHb.w) { debugHb.w = debugHb.width; debugHb.h = debugHb.height; }
              this.hitboxSystem.drawDebug(ctx, debugHb, this.player, null);
            }
            this.hitboxSystem.drawPlayerAnchor(ctx, this.player);
          }

          // 渲染粒子效果
          this.vfxRenderer.renderParticles(ctx);
        } else if (phase && !isMolongActive && !isJianrenActive) {
          // 向后兼容：旧版占位符渲染（非墨龙冲）
          this._drawPlaceholderLegacy(ctx, phase);
        }
      }

      // ★★★ 荆棘牢笼草对象渲染（在敌人之上）★★★
      //     生长阶段 + 驻留阶段均显示
      if (cast._woodTrapMode && (cast._grassActive || cast._grassDwell)) {
        this._drawThornGrass(ctx, cast);
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

  /**
   * ★ 轻攻击动画触发：type="light" 且非"木行·荆棘牢笼"时，
   *    根据技能 phases 总时长，驱动 attack1/ 序列帧一次性播放。
   */
  _triggerLightAttackAnim(s) {
    if (s.type !== "light" || s.id === "wood_thorn") return;
    if (typeof this.player.startAttackAnim !== 'function') return;
    const totalMs = s.phases.reduce((sum, p) => sum + (p.durationMs || 0), 0);
    this.player.startAttackAnim(totalMs);
  }

  // ★★★ 荆棘牢笼草对象渲染 ★★★
  _drawThornGrass(ctx, cast) {
    if (!this._thornTrapFrames || this._thornTrapFrames.length === 0) return;
    const idx = Math.min(cast._grassFrameIdx, this._thornTrapFrames.length - 1);
    const frame = this._thornTrapFrames[idx];
    if (!frame) return;

    const gw = cast._trapW;
    const gh = cast._trapH;
    // ★ 水平居中，垂直：草底部 = trapY（地面），向上绘制
    const gx = cast._trapX - gw / 2;
    const gy = cast._trapY - gh;

    ctx.save();
    // 半透明 + 淡入效果（前200ms渐显）
    const fadeProgress = Math.min(1, cast._grassTimer / 200);
    ctx.globalAlpha = 0.85 * fadeProgress;
    ctx.drawImage(frame, gx, gy, gw, gh);
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
    if (!this.player) return;

    const p = this.player;
    const progress = Math.min(1, cs.timer / cs.maxMs);
    const barW = 56;                               // 加宽到 56px（原 40）
    const barH = 12;                               // 加高到 12px（原 6）
    const pad  = 2;                                // 外边框间距
    const x = p.x + p.w / 2 - barW / 2;
    const y = p.y - 22;                            // 上移，远离头部

    // ★ 五行元素专属蓄力条配色
    //    每个元素包含：bg(底板暗色) c0(渐变起点) c1(渐变中点) c2(渐变终点) max(满蓄闪白)
    const chargeSkill = this.skills[cs.skillId];
    const elem = chargeSkill ? chargeSkill.element : "none";
    const barPalette = {
      fire:  { bg: "#331010", c0: "#ff4400", c1: "#ff8800", c2: "#ffcc00", max: "#ffffc8" },
      water: { bg: "#0a1a2e", c0: "#1a5cd5", c1: "#3a8bf5", c2: "#7abfff", max: "#d0e8ff" },
      wood:  { bg: "#0a1e10", c0: "#1a7a3a", c1: "#2eaa4a", c2: "#5adb6a", max: "#c8ffd0" },
      metal: { bg: "#1a1a1e", c0: "#7a7a88", c1: "#aaaaaa", c2: "#d8d8e0", max: "#f8f8ff" },
      earth: { bg: "#1a1208", c0: "#8a5a20", c1: "#b8860b", c2: "#daa520", max: "#ffe4a0" }
    };
    const pal = barPalette[elem] || {
      bg: "#151515", c0: "#666", c1: "#999", c2: "#ccc", max: "#fff"
    };

    ctx.save();

    // ── 1. 外发光背景（增强可辨识度）──
    ctx.shadowColor = pal.c0;
    ctx.shadowBlur  = 6 + progress * 4;             // 蓄力越满光晕越大

    // ── 2. 底板 ──
    ctx.fillStyle = pal.bg;
    ctx.strokeStyle = `rgba(180,180,180,${0.35 + progress * 0.2})`;
    ctx.lineWidth = 1;
    this._roundRect(ctx, x - pad, y - pad, barW + pad * 2, barH + pad * 2, 3);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;                             // 复位，只对底板加光晕

    // ── 3. 填充进度条 ──
    const fillW = barW * progress;
    if (fillW > 0) {
      const fillGrad = ctx.createLinearGradient(x, y, x + barW, y);
      fillGrad.addColorStop(0,   pal.c0);
      fillGrad.addColorStop(0.4, pal.c1);
      fillGrad.addColorStop(1,   pal.c2);
      ctx.fillStyle = fillGrad;
      this._roundRect(ctx, x, y, fillW, barH, 2);
      ctx.fill();
    }

    // ── 4. 满蓄力闪光 ──
    if (progress >= 1) {
      const pulse = 0.4 + Math.sin(performance.now() * 0.01) * 0.6;
      ctx.fillStyle = `rgba(255,255,220,${pulse * 0.65})`;
      this._roundRect(ctx, x, y, barW, barH, 2);
      ctx.fill();
      // MAX 标注
      ctx.fillStyle = pal.max;
      ctx.font = 'bold 11px "PingFang SC", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = pal.c0;
      ctx.shadowBlur  = 4;
      ctx.fillText("MAX", p.x + p.w / 2, y - 6);
      ctx.shadowBlur = 0;
    }

    // ── 5. 进度百分比（蓄力到 30% 后显示）──
    if (progress > 0.3) {
      const pct = Math.floor(progress * 100);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(pct + "%", p.x + p.w / 2, y + barH / 2);
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
