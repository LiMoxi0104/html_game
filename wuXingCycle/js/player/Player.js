// Player：五行传人。
//   idle:       待机静态站立（idle.png 单帧）
//   walk:       地面上用腿奔跑（walk.png 5帧循环，朝右时水平翻转）
//   state:      idle / walk / jump / attack / hurt / dodge / parry / dead
//
// 状态优先级：dead > hurt > parry > dodge > attack > jump > walk > idle
//
// 攻击/受伤/闪避/弹反/跳跃/碰撞系统完整保留。

class Player {
  constructor(x, y, consts) {
    this.consts = consts;
    this.x = x;
    this.y = y;
    this.w = consts.player.width;
    this.h = consts.player.height;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.facing = "left";      // ★ 默认朝向：最后运动方向决定，初始为左
    this.facingLock = false;   // 攻击期间锁定朝向
    this.state = "idle";       // idle | walk | jump | attack | hurt | dodge | parry | dead
    this.hp = 100;
    this.maxHp = 100;
    this.mp = 50;
    this.maxMp = 50;
    this.invuln = 0;           // 受击无敌剩余 ms
    this.skill = null;         // SkillSystem，由外部注入
    this.asset = null;         // AssetManager，由外部注入

    // —— 序列帧动画 FSM ——
    this.animFSM = new PlayerAnimFSM();

    // —— 奔跑动画 FSM ——
    this.runFSM  = new PlayerRunFSM();

    // —— 多段跳系统 ——
    this.jumpCount     = 0;
    this.maxJumps      = 2;
    this.isJumpHolding = false;
    this.minJumpTime   = 120;              // 矮跳判定阈值 ms
    this.jumpHoldTimer = 0;
    this.jumpCutSpeed  = 0.5;

    // —— 跳跃序列帧 ——
    this._jumpFrames    = [];              // HTMLImageElement[]
    this._jumpFrameIdx  = 0;              // 浮点索引（支持平滑过渡）
    this._jumpAdvTimer  = 0;              // 帧推进累加器(ms)
    this._jumpAnimDone  = false;          // ★ 本轮跳跃动画是否已完成（防重复播放）

    // —— 闪避系统 ——
    this.dodgeTimer        = 0;       // 闪避持续计时器 (ms)
    this.dodgeCooldown     = 0;       // 闪避冷却剩余 (ms)
    this.dodgeDistance     = 140;     // 闪避移动总距离 (px)
    this.dodgeDuration     = 250;     // 闪避持续时长 (ms) — 延长以保证平滑位移
    this.dodgeCooldownMax  = 800;     // 闪避最大冷却 (ms)
    this.dodgeDir          = 0;       // ★ 闪避方向 (-1 左 / 1 右)
    this.dodgeStartX       = 0;       // ★ 闪避起始 X
    this.dodgeTargetX      = 0;       // ★ 闪避目标 X
    this.dodgeSpeed        = 0;       // ★ 闪避速度 (px/s) = distance / (duration/1000)

    // —— 完美闪避碰撞箱（独立于视觉残影）——
    this.ghostRect         = null;    // 残留碰撞箱，用于完美闪避检测
    this.ghostTimer        = 0;       // 碰撞箱有效期 (ms)

    // —— ★ 视觉残影拖尾系统 ——
    this._ghostSnapshots   = [];      // [{x, y, image, timer, lifetime}] 多残影
    this._ghostInterval    = 45;      // 残影捕获间隔 (ms)
    this._ghostLifetime    = 450;     // 单个残影寿命 (ms)
    this._ghostMaxAlpha    = 0.55;    // 残影最大透明度
    this._ghostCaptureAcc  = 0;       // 残影捕获累加器 (ms)

    // —— ★ 轻攻击动画系统 ——
    this._attackFrames      = [];     // HTMLImageElement[]，attack1/ 序列帧（默认朝左）
    this._attackFrameIdx    = 0;      // 当前帧浮点索引（支持平滑过渡）
    this._attackFrameTotalMs = 0;     // 动画总时长(ms)，>0 表示正在播放
    this._attackFrameCount   = 0;     // 帧总数（帧间间隔 = totalMs / count）

    // —— ★ 荆棘牢笼专用攻击动画（attack3/）——
    this._attack3Frames      = [];    // HTMLImageElement[]，attack3/ 序列帧
    this._attack3Active      = false; // 是否使用 attack3 帧集
    this._attack3FrameIdx    = 0;
    this._attack3TotalMs     = 0;
    this._attack3FrameCount  = 0;

    // —— 战斗标记 ——
    this.canCounter = false;
    this.canExecute = false;

    // —— 弹反系统引用（由 GameMain 注入）——
    this.parrySystem = null;

    // —— 墨龙冲动画引用（由 GameMain 注入）——
    this._molongAnim = null;

    // —— 空闲动画（stop/ 文件夹，106 帧，2 秒无操作后循环播放）——
    this._stopFrames = [];
    this._idleTimer = 0;
    this._idleAnimActive = false;
    this._idleFrameIdx = 0;           // 浮点索引，循环推进

    // 状态效果计时器
    this.slowTimer = 0;               // 减速剩余 ms
    this.blindTimer = 0;              // 致盲剩余 ms
    this.speedMultiplier = 1;         // 速度倍率，默认 1

    // —— 死亡视觉效果 ——
    this._deathTimer = 0;             // 死亡计时器(ms): >0=尸体, ≤0且> -500=淡出, ≤ -500=移除
    this._deathCorpseMs = 2000;       // 尸体存留时长
    this._deathFadeMs = 500;          // 淡出时长
    this._deathRemoved = false;       // 是否已从场景移除

    // —— 弹反精灵图（单帧，由 GameMain 注入）——
    this._parryImage = null;

    // —— 天剑坠专用：jian.png 替换精灵图 ——
    this._skillJianImage = null;
    this.useSkillJianSprite = false;

    // —— 天剑坠 旋转动画状态机（由 GameMain 注入）——
    this._jianrenAnim = null;

    // —— ★ 技能后硬直（荆棘牢笼等，ms）——
    this._hardRecovery = 0;
  }

  // ═══════ 依赖注入 ═══════

  setSkillSystem(ss) { this.skill = ss; }

  setParrySystem(ps) { this.parrySystem = ps; }

  setAssetManager(asset) { this.asset = asset; }

  /** ★ 注入墨龙冲动画状态机 */
  setMolongAnim(molong) { this._molongAnim = molong; }

  /** ★ 注入弹反精灵图（单帧静态） */
  setParryImage(img) { this._parryImage = img; }

  /** ★ 注入天剑坠 旋转状态机 */
  setJianrenAnim(anim) { this._jianrenAnim = anim; }

  /** ★ 注入天剑坠 角色替换精灵 */
  setSkillJianImage(img) { this._skillJianImage = img; }

  /** ★ 注入弹反精灵图（单帧静态） */

  setAnimFrames(frames) { this.animFSM.setFrames(frames); }
  setJumpFrames(frames) { this._jumpFrames = frames || []; }
  setRunStartupFrames(frames) { this.runFSM.setStartupFrames(frames); }
  setRunLoopFrames(frames)    { this.runFSM.setRunFrames(frames); }
  setAttackFrames(frames) { this._attackFrames = frames || []; }
  setAttack3Frames(frames) { this._attack3Frames = frames || []; }
  setStopFrames(frames) { this._stopFrames = frames || []; }

  startAttackAnim(totalMs) {
    if (!this._attackFrames || this._attackFrames.length === 0) return;
    this._attackFrameIdx    = 0;
    this._attackFrameTotalMs = totalMs;
    this._attackFrameCount   = this._attackFrames.length;
  }

  startAttack3Anim(totalMs) {
    if (!this._attack3Frames || this._attack3Frames.length === 0) return;
    this._attack3Active      = true;
    this._attack3FrameIdx    = 0;
    this._attack3TotalMs     = totalMs;
    this._attack3FrameCount  = this._attack3Frames.length;
  }
  getAttack3FrameIdx() { return Math.floor(this._attack3FrameIdx); }
  stopAttack3Anim() {
    this._attack3Active = false;
    this._attack3FrameIdx = 0;
    this._attack3TotalMs = 0;
    this._attack3FrameCount = 0;
  }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  getGhostRect() {
    if (!this.ghostRect || this.ghostTimer <= 0) return null;
    return this.ghostRect;
  }

  clearCombatMarks() {
    this.canCounter = false;
    this.canExecute = false;
  }

  // ==================== 跳跃系统 ====================

  startJump() {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack" || this.state === "charge") return false;
    if (this.jumpCount >= this.maxJumps) return false;

    this.jumpCount++;
    this.vy = -this.consts.player.jumpForce;
    this.onGround = false;
    this.isJumpHolding = true;
    this.jumpHoldTimer = 0;

    // ★ 跳跃序列帧重置（二段跳也从第0帧开始）
    this._jumpFrameIdx = 0;
    this._jumpAdvTimer = 0;
    this._jumpAnimDone = false;

    if (this.state !== "dodge") {
      this.state = "jump";
    }

    AudioManager.play && AudioManager.play("jump");
    return true;
  }

  // ==================== 闪避 ====================

  startDodge(input, mapWidth) {
    if (this.state === "dead" || this.state === "hurt" || this.state === "attack" || this.state === "parry" || this.state === "charge") return false;
    if (this.dodgeCooldown > 0) return false;
    if (this._hardRecovery > 0) return false;  // ★ 技能后硬直中不可闪避

    // ■ 闪避方向判定
    //   D+Shift → 向右闪避；A+Shift → 向左闪避；原地站立 → 向朝向反方向闪避
    let dir;
    if (input.moveRight()) {
      dir = 1;   // 按 D → 右闪
    } else if (input.moveLeft()) {
      dir = -1;  // 按 A → 左闪
    } else {
      dir = this.facing === "right" ? -1 : 1;  // 朝向反方向
    }

    // ■ 完美闪避碰撞箱：记录闪避前位置，供 GameMain 检测"本该命中"
    this.ghostRect  = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.ghostTimer = 200;  // 碰撞箱有效期 200ms

    // ■ 计算平滑位移参数（不再瞬移）
    this.dodgeDir     = dir;
    this.dodgeStartX  = this.x;
    let targetX = this.x + dir * this.dodgeDistance;
    const pad = this.consts.world.boundaryPadding || 24;
    targetX = Math.max(pad, Math.min(targetX, mapWidth - this.w - pad));
    this.dodgeTargetX = targetX;
    this.dodgeSpeed   = this.dodgeDistance / (this.dodgeDuration / 1000);  // px/s

    // ■ 清空旧残影，立即捕获起始位置第一帧
    this._ghostSnapshots  = [];
    this._ghostCaptureAcc = 0;
    this._captureGhostAtCurrentPos();

    this.vx = 0;
    this.vy = 0;

    this.state          = "dodge";
    this.dodgeTimer     = this.dodgeDuration;
    this.invuln         = this.dodgeDuration;
    this.dodgeCooldown  = this.dodgeCooldownMax;

    return true;
  }

  /** 捕获当前角色精灵帧到离屏 canvas，作为闪避残留快照 */
  _captureGhostSnapshot() {
    const frame = this.animFSM.hasFrames ? this.animFSM.getCurrentFrame() : null;
    if (!frame) return null;

    const canvas = document.createElement("canvas");
    canvas.width  = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext("2d");

    // 原图朝左；快照需按当前 facing 翻转到正确方向
    if (this.facing === "right") {
      ctx.translate(this.w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(frame, 0, 0, this.w, this.h);
    return canvas;
  }

  /** ★ 在当前位置捕获一个残影快照，加入拖尾队列 */
  _captureGhostAtCurrentPos() {
    const snapshot = this._captureGhostSnapshot();
    if (!snapshot) return;

    this._ghostSnapshots.push({
      x: this.x,
      y: this.y,
      image: snapshot,
      timer: this._ghostLifetime,
      lifetime: this._ghostLifetime
    });

    // 限制最大残影数量，避免性能问题
    const MAX_GHOSTS = 8;
    while (this._ghostSnapshots.length > MAX_GHOSTS) {
      this._ghostSnapshots.shift();
    }
  }

  // ==================== 主更新循环 ====================

  update(dt, input, map) {
    const c = this.consts;

    // —— ★ 死亡视觉：推进计时器，尸体 → 淡出 → 移除 ——
    if (this.state === "dead") {
      if (this._deathTimer > 0) {
        // 尸体阶段
        this._deathTimer -= dt;
      } else if (this._deathTimer > -this._deathFadeMs) {
        // 淡出阶段
        this._deathTimer -= dt;
      } else {
        // 完全移除
        this._deathRemoved = true;
      }
      return;
    }

    // —— 计时器递减 ——
    if (this.invuln > 0)        this.invuln -= dt;
    if (this.dodgeCooldown > 0) this.dodgeCooldown -= dt;
    if (this.ghostTimer > 0)    this.ghostTimer -= dt;
    if (this._hardRecovery > 0) this._hardRecovery -= dt;  // ★ 技能后硬直
    else this.ghostRect = null;

    // ★ 残影寿命递减（过期的自动清除）
    for (let i = this._ghostSnapshots.length - 1; i >= 0; i--) {
      this._ghostSnapshots[i].timer -= dt;
      if (this._ghostSnapshots[i].timer <= 0) {
        this._ghostSnapshots.splice(i, 1);
      }
    }

    // —— 状态效果计时器 ——
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      this.speedMultiplier = 0.4;   // 减速至 40%
    } else {
      this.speedMultiplier = 1;
    }
    if (this.blindTimer > 0) this.blindTimer -= dt;

    // ★ 轻攻击动画帧推进：仅在 state="attack" 且动画已激活时运行
    if (this.state === "attack" && this._attackFrameTotalMs > 0 && this._attackFrameCount > 0) {
      const interval = this._attackFrameTotalMs / this._attackFrameCount;
      this._attackFrameIdx += dt / interval;
      // 不循环，播完定格在末帧
      if (this._attackFrameIdx >= this._attackFrameCount) {
        this._attackFrameIdx = this._attackFrameCount - 1;
      }
    }
    // ★ attack3 动画帧推进（荆棘牢笼专用）
    if (this._attack3Active && this._attack3TotalMs > 0 && this._attack3FrameCount > 0) {
      const interval = this._attack3TotalMs / this._attack3FrameCount;
      this._attack3FrameIdx += dt / interval;
      if (this._attack3FrameIdx >= this._attack3FrameCount) {
        this._attack3FrameIdx = this._attack3FrameCount - 1;
      }
    }
    // 非攻击/蓄力状态时重置动画状态，避免下次误播
    if (this.state !== "attack" && this.state !== "charge") {
      this._attackFrameTotalMs = 0;
      this._attackFrameIdx = 0;
      this._attack3Active = false;
      this._attack3FrameIdx = 0;
    }

    // —— FSM 动画更新 ——
    if (this.state === "idle" || this.state === "walk") {
      this.animFSM.update(dt, input);

      // ★ 起跑→奔跑：检测到移动立即启动 runFSM（不再等待 animDone）
      const moving = input.moveLeft() || input.moveRight();
      if (this.state === "walk" && moving && !this.runFSM.isActive) {
        this.runFSM.start();
      }
      // 停止移动或状态退出 → 停止奔跑
      if ((!moving || this.state !== "walk") && this.runFSM.isActive) {
        this.runFSM.stop();
      }
      // 奔跑 FSM 帧推进
      if (this.runFSM.isActive) {
        this.runFSM.update(dt);
      }
    } else {
      // 离开行走状态（攻击/跳跃/受击等）→ 停止奔跑
      if (this.runFSM.isActive) {
        this.runFSM.stop();
      }
    }

    // —— 受伤恢复 ——
    if (this.state === "hurt" && this.invuln <= 0) {
      this.state = this.onGround ? "idle" : "jump";
      this.vx = 0;
    }

    // —— 弹反恢复 ——
    if (this.state === "parry") {
      if (!this.parrySystem || !this.parrySystem.active) {
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
      }
    }

    // —— ★ 闪避：残影捕获 + 状态恢复 ——
    if (this.state === "dodge") {
      this.dodgeTimer -= dt;

      // ★ 沿位移路径均匀采样，捕获残影快照
      this._ghostCaptureAcc += dt;
      while (this._ghostCaptureAcc >= this._ghostInterval) {
        this._ghostCaptureAcc -= this._ghostInterval;
        this._captureGhostAtCurrentPos();
      }

      if (this.dodgeTimer <= 0) {
        // 闪避结束：确保到达目标位置
        this.x = this.dodgeTargetX;
        this.state = this.onGround ? "idle" : "jump";
        this.vx = 0;
      }
    }

    const casting  = this.skill && this.skill.isCasting();
    const hurt     = this.state === "hurt";
    const dodging  = this.state === "dodge";
    const parrying = this.state === "parry";
    const recovery = this._hardRecovery > 0;   // ★ 技能后硬直

    // —— 水平移动（地面上用腿奔跑）——
    let mx = 0;
    if (!casting && !hurt && !dodging && !parrying && !recovery) {
      if (input.moveLeft())  mx -= 1;
      if (input.moveRight()) mx += 1;
      if (mx > 0)      this.facing = "right";
      else if (mx < 0) this.facing = "left";
    }
    // 同步 FSM 朝向
    if (this.animFSM.hasFrames) {
      const f = this.animFSM.getFacing();
      if (f) this.facing = f;
    }
    this.vx = (casting || hurt || dodging || parrying || recovery) ? 0 : mx * c.player.moveSpeed * this.speedMultiplier;

    // —— 跳跃 ——
    if (input.jumpPressed()) {
      if (this.jumpCount < this.maxJumps && !casting && !hurt && !dodging && !parrying && !recovery) {
        this.startJump();
      }
    }

    // —— 蓄力跳 / 矮跳 ——
    if (this.isJumpHolding) {
      this.jumpHoldTimer += dt;
      if (!input.jumpDown() || input.jumpReleased()) {
        if (this.jumpHoldTimer < this.minJumpTime && this.vy < 0) {
          this.vy *= this.jumpCutSpeed;
        }
        this.isJumpHolding = false;
      }
    }

    // —— 重力与位移积分 ——
    if (!dodging) {
      this.vy += c.player.gravity;
      if (this.vy > c.player.maxFallSpeed) this.vy = c.player.maxFallSpeed;
      this.x += this.vx;
      this.y += this.vy;
    } else {
      // ★ 闪避期间：x 方向平滑位移，每帧推进 speed * dt，到达目标时定格
      const dodgeStep = this.dodgeSpeed * (dt / 1000);
      const remaining = Math.abs(this.dodgeTargetX - this.x);
      if (remaining <= dodgeStep) {
        this.x = this.dodgeTargetX;
      } else {
        this.x += this.dodgeDir * dodgeStep;
      }
      this.y += this.vy;
      this.vy *= 0.85;  // 垂直速度快速衰减
    }

    // —— 地面与边界（★ v3 多平台碰撞）——
    const groundY = map.groundY - this.h;  // 底部地面（坠落线）

    // 先检测平台碰撞（优先级高于地面）
    const platformResult = MapLoader.checkPlatformCollision(this, map);

    if (platformResult.onPlatform) {
      // 站在平台上
      this.y = platformResult.platformY - this.h;  // 脚底贴平台表面
      this.vy = 0;
      if (!this.onGround) {
        this.jumpCount = 0;
        this.isJumpHolding = false;
        this.jumpHoldTimer = 0;
      }
      this.onGround = true;
    } else if (this.y >= groundY) {
      // 无平台 → 落到底层地面
      this.y = groundY;
      this.vy = 0;
      if (!this.onGround) {
        this.jumpCount = 0;
        this.isJumpHolding = false;
        this.jumpHoldTimer = 0;
      }
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // ★ 跳跃时头部碰撞平台底部（穿顶修正）
    if (this.vy < 0) {
      const ceilY = MapLoader.checkPlatformCeiling(this, map);
      if (ceilY !== null) {
        this.y = ceilY;
        this.vy = 0;
      }
    }

    // 顶部边界
    if (this.y < 0) { this.y = 0; this.vy = 0; }

    const pad = c.world.boundaryPadding;
    if (this.x < pad) this.x = pad;
    if (this.x > map.width - this.w - pad) this.x = map.width - this.w - pad;

    // ★ 坠落死亡检测：掉出所有平台 + 超过底部地面
    if (this.y > map.height) {
      this.hp = 0;
      this.state = "dead";
    }

    // —— ★ 跳跃序列帧推进 ——
    this._updateJumpAnim(dt, map);

    // —— 状态机 ——
    if (!casting && this.state !== "hurt" && this.state !== "dodge" && this.state !== "parry" && this.state !== "charge") {
      if (!this.onGround) {
        this.state = "jump";
      } else if (mx !== 0) {
        this.state = "walk";
      } else {
        this.state = "idle";
      }
    }

    // ★ 空闲动画检测：state="idle" 且无任何按键 → 2 秒后循环播放 stop/ 帧
    //   任何输入（方向/跳跃/攻击/闪避/弹反）立即中断并重置计时
    if (this.state === "idle" && this._stopFrames.length > 0) {
      const hasInput = mx !== 0
        || input.moveUp() || input.moveDown()
        || input.jumpDown()
        || input.isDown("j") || input.isDown("k") || input.isDown("l")
        || input.isDown("shift");
      if (!hasInput) {
        this._idleTimer += dt;
        if (this._idleTimer >= 2000) {
          if (!this._idleAnimActive) {
            this._idleFrameIdx = 0;
            this._idleAnimActive = true;
          }
          // 循环推进帧索引
          const IDLE_INTERVAL = 50;  // 50ms/帧 ≈ 5.3s 循环一次
          this._idleFrameIdx += dt / IDLE_INTERVAL;
          while (this._idleFrameIdx >= this._stopFrames.length) {
            this._idleFrameIdx -= this._stopFrames.length;
          }
        }
      } else {
        this._idleTimer = 0;
        this._idleAnimActive = false;
      }
    } else if (this.state !== "idle") {
      this._idleTimer = 0;
      this._idleAnimActive = false;
    }

    // —— 攻击推进 + 命中判定 ——
    if (this.skill) {
      this.skill.update(dt);
      // ★ 冲刺位移后重新钳制边界（fire_dragon 等技能会在 active 阶段移动角色）
      const pad2 = c.world.boundaryPadding;
      if (this.x < pad2) this.x = pad2;
      if (this.x > map.width - this.w - pad2) this.x = map.width - this.w - pad2;
      const hb = this.skill.getActiveHitbox();
      if (hb) {
        this.applyHit(hb, map.enemies);
        this.clearCombatMarks();
      }
    }
  }

  applyHit(hb, enemies) {
    for (const e of enemies) {
      if (!e.alive) continue;
      // ★ 冲刺/锁定技能去重：同一次施放中已被命中的敌人不再重复受伤
      if (hb.hitEnemies && hb.hitEnemies.has(e)) continue;

      // ★ 圆形碰撞检测（陨星震等范围技）
      let hit;
      if (hb.shape === "circle") {
        hit = Collision.circleRect(hb.cx, hb.cy, hb.radius, e.getRect());
      } else {
        hit = Collision.rectOverlap(hb, e.getRect());
      }

      if (hit) {
        e.takeDamage(hb.damage);
        // 击退方向：圆形技从圆心向外推开；矩形技按玩家朝向
        if (hb.shape === "circle") {
          const ecx = e.x + e.w / 2;
          const ecy = e.y + e.h / 2;
          const dx = ecx - hb.cx;
          const dy = ecy - hb.cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          e.x += (dx / dist) * (hb.knockback || 0);
          e.y += (dy / dist) * (hb.knockback || 0) * 0.5;
        } else {
          const dir = this.facing === "right" ? 1 : -1;
          e.x += dir * (hb.knockback || 0);
        }
        AudioManager.play && AudioManager.play("hit");
        if (hb.hitEnemies) hb.hitEnemies.add(e);
      }
    }
  }

  takeDamage(d, attacker) {
    if (this.invuln > 0 || this.state === "dead") return true;

    if (this.parrySystem && this.parrySystem.active) {
      const parried = this.parrySystem.checkParryHit(attacker);
      if (parried) {
        return false;
      }
    }

    this.hp -= d;
    this.invuln = this.consts.player.invulnMs;
    this.state = "hurt";
    this.clearCombatMarks();
    this.ghostRect = null;
    this.ghostTimer = 0;
    this._ghostSnapshots = [];
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.vx = 0;
      this.vy = 0;
      this._deathTimer = this._deathCorpseMs;  // ★ 启动死亡视觉计时
    }
    return true;
  }

  // ==================== 跳跃序列帧动画 ====================

  /**
   * 跳跃动画推进逻辑：
   *   - _jumpAnimDone=true 时直接返回，确保单跳不重复播放
   *   - 基础速率：5ms/帧 → 139帧≈695ms
   *   - 落地前未播完：动态加速补齐剩余帧（缩短间隔至2ms/帧）
   *   - 提前播完：定格末帧，设 _jumpAnimDone=true
   *   - 二段跳：startJump() 重置 _jumpAnimDone=false → 重新播放
   */
  _updateJumpAnim(dt, map) {
    if (this.state !== "jump" || !this._jumpFrames || this._jumpFrames.length === 0) return;
    // ★ 本轮已完成 → 冻结末帧，禁止任何续播
    if (this._jumpAnimDone) return;

    const total = this._jumpFrames.length;
    const BASE_MS = 5;
    const FAST_MS = 2;

    // 即将触地检测
    let nearGround = false;
    if (this.vy >= 0) {
      const feetY = this.y + this.h;
      let surfaceY = map.groundY;
      if (map.platforms) {
        const fx = this.x + this.w / 2;
        for (const p of map.platforms) {
          if (fx >= p.x && fx <= p.x + p.w && p.y >= feetY && p.y < surfaceY) {
            surfaceY = p.y;
          }
        }
      }
      nearGround = (surfaceY - feetY) < 60;
    }

    const interval = nearGround ? FAST_MS : BASE_MS;
    this._jumpAdvTimer += dt;

    while (this._jumpAdvTimer >= interval && this._jumpFrameIdx < total - 1) {
      this._jumpAdvTimer -= interval;
      this._jumpFrameIdx++;
    }

    // 到达末帧 → 标记完成，定格
    if (this._jumpFrameIdx >= total - 1) {
      this._jumpFrameIdx = total - 1;
      this._jumpAnimDone = true;
    }
  }

  // ==================== 特殊状态效果 ====================

  applySlow(ms) {
    this.slowTimer = Math.max(this.slowTimer, ms);
  }

  applyBlind(ms) {
    this.blindTimer = Math.max(this.blindTimer, ms);
  }

  // ==================== 渲染 ====================

  draw(ctx) {
    // —— ★ 死亡视觉：已完全移除 → 不绘制 ——
    if (this._deathRemoved) return;

    // ★ 天剑坠期间：替换角色精灵为 jian.png
    if (this.useSkillJianSprite && this._skillJianImage) {
      ctx.save();
      this._drawSkillJianSprite(ctx);
      // 蓄力/旋转期间仍绘制闪避残影
      if (this._ghostSnapshots.length > 0) {
        this._drawGhostSnapshots(ctx);
      }
      // ★ 在角色精灵之上叠加绘制剑身
      if (this._jianrenAnim && this._jianrenAnim.isActive) {
        this._jianrenAnim.drawBlade(ctx, this);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    // ★ 墨龙冲动画渲染（优先级最高，替换角色精灵）
    if (this._molongAnim && this._molongAnim.isActive) {
      ctx.save();
      this._drawMolongFrame(ctx);
      // 闪避残影
      if (this._ghostSnapshots.length > 0) {
        this._drawGhostSnapshots(ctx);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    const c = this.consts;

    // —— ★ 死亡尸体 + 淡出 ——
    if (this.state === "dead" && this._deathTimer > -this._deathFadeMs) {
      const frame = this.animFSM.hasFrames ? this.animFSM.getCurrentFrame() : null;
      if (!frame) { this._drawFallback(ctx, c); return; }

      // 淡出阶段：alpha 从 1 线性降至 0
      let deathAlpha = 1;
      if (this._deathTimer <= 0) {
        deathAlpha = Math.max(0, 1 + this._deathTimer / this._deathFadeMs);
      }

      ctx.save();
      ctx.globalAlpha = deathAlpha;
      if (this.facing === "right") {
        ctx.translate(this.x + this.w, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(frame, 0, 0, this.w, this.h);
      } else {
        ctx.drawImage(frame, this.x, this.y, this.w, this.h);
      }
      ctx.restore();
      return;
    }

    ctx.save();

    let alpha = 1;

    // —— 状态透明度 ——
    if (this.state === "dodge") {
      // ★ 增强透明度对比：0.15 ~ 0.70，闪烁更快更明显
      alpha = 0.15 + Math.abs(Math.sin(performance.now() / 35)) * 0.55;
    } else if (this.state === "parry") {
      alpha = 0.7 + Math.abs(Math.sin(performance.now() / 50)) * 0.25;
    }

    ctx.globalAlpha = alpha;

    // —— 精灵图渲染 ——
    if (this.animFSM.hasFrames && (this.state === "idle" || this.state === "walk")) {
      // ★ 奔跑 FSM 激活时优先绘制奔跑帧
      if (this.state === "walk" && this.runFSM.isActive && this.runFSM.hasFrames) {
        const frame = this.runFSM.getCurrentFrame();
        if (frame) {
          if (this.facing === "right") {
            ctx.translate(this.x + this.w, this.y);
            ctx.scale(-1, 1);
            ctx.drawImage(frame, 0, 0, this.w, this.h);
          } else {
            ctx.drawImage(frame, this.x, this.y, this.w, this.h);
          }
        } else {
          this.animFSM.draw(ctx, this.x, this.y, this.w, this.h);
        }
      // ★ idle：用 Player.facing 翻转（保持最后运动方向），非 FSM 内部状态
      } else if (this.state === "idle") {
        // ★ 空闲动画优先：2 秒无操作后循环播放 stop/ 帧
        if (this._idleAnimActive && this._stopFrames.length > 0) {
          const idx = Math.floor(this._idleFrameIdx);
          const frame = this._stopFrames[idx];
          if (frame) {
            if (this.facing === "right") {
              ctx.translate(this.x + this.w, this.y);
              ctx.scale(-1, 1);
              ctx.drawImage(frame, 0, 0, this.w, this.h);
            } else {
              ctx.drawImage(frame, this.x, this.y, this.w, this.h);
            }
          }
        } else {
          const frame = this.animFSM.getCurrentFrame();
          if (frame) {
            if (this.facing === "right") {
              ctx.translate(this.x + this.w, this.y);
              ctx.scale(-1, 1);
              ctx.drawImage(frame, 0, 0, this.w, this.h);
            } else {
              ctx.drawImage(frame, this.x, this.y, this.w, this.h);
            }
          }
        }
      } else {
        this.animFSM.draw(ctx, this.x, this.y, this.w, this.h);
      }
    } else if (this.state === "attack" && this._attack3Active && this._attack3Frames.length > 0) {
      // ★ 荆棘牢笼攻击动画（attack3/）：按 facing 翻转
      const idx = Math.min(Math.floor(this._attack3FrameIdx), this._attack3Frames.length - 1);
      const frame = this._attack3Frames[idx];
      if (frame) {
        if (this.facing === "right") {
          ctx.translate(this.x + this.w, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0, this.w, this.h);
        } else {
          ctx.drawImage(frame, this.x, this.y, this.w, this.h);
        }
      }
    } else if (this.state === "attack" && this._attackFrames.length > 0) {
      // ★ 轻攻击帧动画：默认朝左，右朝向时镜像翻转
      const idx = Math.min(Math.floor(this._attackFrameIdx), this._attackFrames.length - 1);
      const frame = this._attackFrames[idx];
      if (frame) {
        if (this.facing === "right") {
          ctx.translate(this.x + this.w, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0, this.w, this.h);
        } else {
          ctx.drawImage(frame, this.x, this.y, this.w, this.h);
        }
      }
    } else if ((this.state === "dodge" || this.state === "hurt") && this.animFSM.hasFrames) {
      // 闪避/受击：冻结当前帧，按 Player.facing 翻转
      const frame = this.animFSM.getCurrentFrame();
      if (frame) {
        if (this.facing === "right") {
          ctx.translate(this.x + this.w, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0, this.w, this.h);
        } else {
          ctx.drawImage(frame, this.x, this.y, this.w, this.h);
        }
      }
    } else if (this.state === "jump" && this._jumpFrames.length > 0) {
      // ★ 跳跃序列帧：按 facing 翻转绘制
      const idx = Math.min(Math.floor(this._jumpFrameIdx), this._jumpFrames.length - 1);
      const frame = this._jumpFrames[idx];
      if (frame) {
        if (this.facing === "right") {
          ctx.translate(this.x + this.w, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0, this.w, this.h);
        } else {
          ctx.drawImage(frame, this.x, this.y, this.w, this.h);
        }
      } else {
        this._drawFallback(ctx, c);
      }
    } else if (this.state === "parry" && this._parryImage) {
      // ★ 弹反：单帧静态精灵图，按 facing 翻转，保持视觉中心
      this._drawParryFrame(ctx);
    } else if (this.state === "charge" && this._attack3Active && this._attack3Frames.length > 0) {
      // ★ 陨星震蓄力动画（attack3/ 序列帧）：按 facing 翻转
      const idx = Math.min(Math.floor(this._attack3FrameIdx), this._attack3Frames.length - 1);
      const frame = this._attack3Frames[idx];
      if (frame) {
        ctx.save();
        if (this.facing === "right") {
          ctx.translate(this.x + this.w, this.y);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0, this.w, this.h);
        } else {
          ctx.drawImage(frame, this.x, this.y, this.w, this.h);
        }
        ctx.restore();
      }
    } else {
      const sprite = this._getCurrentSprite();
      if (sprite) this._drawSprite(ctx, sprite);
      else this._drawFallback(ctx, c);
    }

    // 受击红色视觉特效已移除

    // —— 蓄力环绕光晕（按技能元素着色，火≠土）——
    if (this.state === "charge") {
      const chargeProgress = this.skill ? this.skill.getChargeProgress() : 0;
      const chargeSkillId = this.skill ? this.skill.getChargeSkillId() : null;
      const chargeSkill = chargeSkillId ? (this.skill.skills[chargeSkillId] || {}) : {};
      const elem = chargeSkill.element || "fire";

      // ★ 按元素选择配色（五行全覆盖）
      const elemColors = {
        fire:  { inner: "rgba(255,100,20,0)", mid: "rgba(255,60,10,#)", outer: "rgba(200,30,5,#)" },
        water: { inner: "rgba(30,120,220,0)", mid: "rgba(20,90,190,#)", outer: "rgba(10,60,150,#)" },
        wood:  { inner: "rgba(30,160,60,0)", mid: "rgba(20,130,50,#)", outer: "rgba(10,90,30,#)" },
        metal: { inner: "rgba(190,190,210,0)", mid: "rgba(160,160,180,#)", outer: "rgba(120,120,150,#)" },
        earth: { inner: "rgba(180,140,70,0)", mid: "rgba(150,100,40,#)", outer: "rgba(100,60,30,#)" }
      };
      const pal = elemColors[elem] || elemColors.fire;

      const pulse = 0.7 + Math.sin(performance.now() * 0.015) * 0.3;
      const auraAlpha = 0.15 + chargeProgress * 0.4;
      ctx.globalAlpha = auraAlpha * pulse;
      const auraGrad = ctx.createRadialGradient(
        this.x + this.w / 2, this.y + this.h / 2, this.w * 0.4,
        this.x + this.w / 2, this.y + this.h / 2, this.w * 1.2 + chargeProgress * 30
      );
      auraGrad.addColorStop(0, pal.inner);
      auraGrad.addColorStop(0.3, pal.mid.replace("#", `${0.5 * chargeProgress}`));
      auraGrad.addColorStop(0.7, pal.outer.replace("#", `${0.3 * chargeProgress}`));
      auraGrad.addColorStop(1, pal.outer.replace("#", "0"));
      ctx.fillStyle = auraGrad;
      ctx.fillRect(this.x - 40, this.y - 40, this.w + 80, this.h + 80);
    }

    // —— ★ 多残影拖尾渲染（按寿命从旧到新绘制，越旧越透明）——
    if (this._ghostSnapshots.length > 0) {
      for (const ghost of this._ghostSnapshots) {
        const progress = ghost.timer / ghost.lifetime;
        // 缓出曲线 progress²：初期衰减快、末期缓慢，层次分明
        const ghostAlpha = progress * progress * this._ghostMaxAlpha;
        ctx.globalAlpha = ghostAlpha;
        ctx.drawImage(ghost.image, ghost.x, ghost.y, this.w, this.h);
      }
    }

    // —— 致盲效果：视野遮罩 ——
    if (this.blindTimer > 0) {
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 120) * 0.15;
      ctx.fillStyle = "#000022";
      ctx.fillRect(this.x - 300, this.y - 200, this.w + 600, this.h + 400);
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ═══════ 渲染辅助 ═══════

  /**
   * ★ 绘制墨龙冲当前帧精灵图。
   *    molong 帧图默认朝右，左朝向时水平翻转。
   *    蓄力缩放 1x→4x 通过 displayScale 动态应用。
   */
  _drawMolongFrame(ctx) {
    const frame = this._molongAnim.currentFrame;
    if (!frame) return;

    const chargeScale = this._molongAnim.displayScale;

    const frameW = frame.width;
    const frameH = frame.height;
    const scale = Math.min(this.w / frameW, this.h / frameH) * chargeScale;
    const drawW = frameW * scale;
    const drawH = frameH * scale;
    // 居中绘制（缩小时保持视觉中心不变）
    const drawX = this.x + (this.w - drawW) / 2;
    const drawY = this.y + (this.h - drawH) / 2;

    // ★ 帧图默认朝右，只有左朝向时才翻转
    if (this.facing === "left") {
      ctx.translate(drawX + drawW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(frame, drawX, drawY, drawW, drawH);
    }
  }

  /**
   * ★ 绘制闪避残影拖尾（从 _ghostSnapshots 提取复用）
   */
  _drawGhostSnapshots(ctx) {
    for (const ghost of this._ghostSnapshots) {
      const progress = ghost.timer / ghost.lifetime;
      const ghostAlpha = progress * progress * this._ghostMaxAlpha;
      ctx.globalAlpha = ghostAlpha;
      ctx.drawImage(ghost.image, ghost.x, ghost.y, this.w, this.h);
    }
  }

  /**
   * ★ 绘制弹反精灵图（单帧静态）。
   *    帧图默认朝右（匕首向右伸展），左朝向时水平翻转。
   *    按比例缩放适应角色碰撞箱，保持视觉中心与脚底锚点。
   */
  _drawParryFrame(ctx) {
    const img = this._parryImage;
    if (!img) return;

    const frameW = img.width;
    const frameH = img.height;
    // ★ 等比缩放适应角色框
    const scale = Math.min(this.w / frameW, this.h / frameH);
    const drawW = frameW * scale;
    const drawH = frameH * scale;
    // ★ 脚底锚点：脚底水平居中（避免浮空）
    const drawX = this.x + (this.w - drawW) / 2;
    const drawY = this.y + this.h - drawH;

    if (this.facing === "left") {
      ctx.translate(drawX + drawW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, drawW, drawH);
    } else {
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
  }

  /**
   * ★ 天剑坠期间绘制 jian.png 替换精灵（双手合十祈祷姿势）。
   *   - 绘制区域 = 角色碰撞箱 (this.x, this.y, this.w, this.h)，零偏移、零变形
   *   - 图片自动拉伸填充，与原 idle/walk 帧渲染方式完全一致
   *   - 角色 x / y / w / h 属性不变，碰撞边界严格对齐
   */
  _drawSkillJianSprite(ctx) {
    const img = this._skillJianImage;
    if (!img) return;

    // ★ 隔离变换，避免污染后续 drawBlade 的 CTM
    ctx.save();
    if (this.facing === "right") {
      ctx.translate(this.x + this.w, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, this.x, this.y, this.w, this.h);
    }
    ctx.restore();
  }

  // 根据当前状态获取精灵图与源裁剪区域
  // 返回 { img, sx, sy, sw, sh } 或 null
  _getCurrentSprite() {
    if (!this.asset) return null;

    switch (this.state) {
      case "idle": {
        const img = this.asset.getImage("player_idle");
        if (!img) return null;
        return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
      }
      case "walk": return null;  // 已由 FSM 渲染
      default:
        return null;
    }
  }

  // 绘制精灵图，朝左时水平翻转（原图面向右）
  _drawSprite(ctx, { img, sx, sy, sw, sh }) {
    const needFlip = this.facing === "left";

    if (needFlip) {
      ctx.translate(this.x + this.w, this.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.w, this.h);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, this.x, this.y, this.w, this.h);
    }
  }

  // 回退：无精灵图时用程序化矩形绘制
  _drawFallback(ctx, c) {
    let body = c.colors.player;

    if (this.state === "parry") {
      body = "#c8d4e8";
    }

    ctx.fillStyle = body;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    // 面部朝向标识
    ctx.fillStyle = c.colors.playerFace;
    const eyeX = this.facing === "right" ? this.x + this.w - 10 : this.x + 8;
    ctx.fillRect(eyeX, this.y + 12, 6, 6);
  }

}
