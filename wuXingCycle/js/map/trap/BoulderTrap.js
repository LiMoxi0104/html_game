// BoulderTrap：滚石陷阱（水平往复滚动的巨石）
// 使用 xianjingUI/boulder_trap_frame_XX.png 序列帧动画
//
// === 行为循环 ===
//   Phase 0 - SETTLED (frame_01): 静止 1000ms，滚石停稳
//   Phase 1 - PREPARE (frame_02): 蓄力 300ms，即将滚动
//   Phase 2 - ROLLING  (frame_03): 滚石沿图像朝向水平移动 travelDistance px
//           耗时 travelTime ms（即 3→1 的间隔）
//   到达终点 → 镜像翻转所有帧 → 反向重复
//
// === Config 参数 ===
//   travelDistance: 单方向移动距离（px），默认 200
//   travelTime: 滚动移动时长（ms），默认 1500
//   damage / knockback / knockbackX / knockbackY: 继承自 TrapBase
//
// === 碰撞体 ===
//   碰撞矩形实时跟随滚石 x,y 位置，尺寸由 width × height 配置定义
//   伤害和击退逻辑继承 TrapBase，保持不变

class BoulderTrap extends TrapBase {

  // —— 静态缓存：所有实例共享同一套帧图像 ——
  static _images = null;

  constructor(cfg) {
    super(cfg);

    // 滚动参数（可从配置覆盖）
    this.travelDistance = cfg.travelDistance || 200;   // 单方向滚动距离 px
    this.travelTime     = cfg.travelTime     || 1500;  // 滚动总时长 ms

    // 帧阶段时长（毫秒）
    // 阶段0: settled 1000ms, 阶段1: prepare 300ms, 阶段2: rolling travelTime ms
    this._phaseDurations = [1000, 300, this.travelTime];

    // ===== 状态机 =====
    this.phase       = 0;          // 0=settled, 1=prepare, 2=rolling
    this.phaseTimer  = 0;          // 当前阶段已用时间 ms
    this.direction   = -1;         // -1 向左（图像原始朝向）, +1 向右（镜像后）
    this.mirrored    = false;      // 当前是否处于镜像模式

    // 位置追踪
    this.startX      = this.x;     // 本轮滚动起点
    this.originX     = this.x;     // 最初出生位置
    this.originY     = this.y;

    // 预加载帧图像
    this._ensureImages();

    // 滚石始终激活（不做周期性开关）
    this.active = true;
  }

  // 静态方法：仅首次创建实例时加载帧图像
  _ensureImages() {
    if (!BoulderTrap._images) {
      BoulderTrap._images = [];
      const base = "xianjingUI/boulder_trap_frame_";
      for (let i = 1; i <= 3; i++) {
        const img = new Image();
        img.src = base + String(i).padStart(2, "0") + ".png";
        BoulderTrap._images.push(img);
      }
    }
  }

  // ==================== 每帧更新 ====================
  update(dt) {
    this.phaseTimer += dt;
    const duration = this._phaseDurations[this.phase];

    // —— 阶段超时 → 切换 ——
    if (this.phaseTimer >= duration) {
      if (this.phase === 2) {
        // ★ ROLLING 完成：到达终点
        this.x = this.startX + this.direction * this.travelDistance;
        // 镜像翻转 + 反向
        this.mirrored  = !this.mirrored;
        this.direction *= -1;
        this.startX    = this.x;
        this.phase     = 0;
      } else {
        // SETTLED → PREPARE 或 PREPARE → ROLLING
        this.phase++;
        if (this.phase === 2) {
          this.startX = this.x;   // 记录本次滚动起点
        }
      }
      this.phaseTimer = 0;
    }

    // —— ROLLING 阶段：水平位移 ——
    if (this.phase === 2) {
      const progress = this.phaseTimer / this.travelTime;
      this.x = this.startX + this.direction * this.travelDistance * progress;
    }
  }

  // ==================== 碰撞检测 ====================
  // 碰撞矩形实时跟随滚石当前位置
  getRect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  // ★ 仅 ROLLING 阶段（phase===2）产生伤害
  // 静止/蓄力阶段触碰滚石不会受伤
  check(player, dt) {
    if (this.phase !== 2) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 完美闪避检测：同样仅在 ROLLING 阶段判定
  checkAtPosition(rect) {
    if (this.phase !== 2) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return { type: "boulder", damage: this.damage, trap: this };
    }
    return null;
  }

  // 重写：滚石的击退方向应跟随滚石运动方向（推开玩家）
  onTrigger(player) {
    const damageApplied = player.takeDamage(this.damage, this);
    if (!damageApplied) {
      console.log(`[BoulderTrap] ${this.id} 伤害被弹反拦截！`);
      return { type: "boulder", damage: this.damage, _parried: true };
    }

    // —— 特殊行为（减速/致盲）——
    if (this.slow && player.applySlow) {
      player.applySlow(1500);
    }
    if (this.blind && player.applyBlind) {
      player.applyBlind(2000);
    }

    // —— 击退：沿滚石运动方向推开玩家 ——
    const kbTotal = this.knockback;
    if (kbTotal > 0 || this.knockbackX !== 0 || this.knockbackY !== 0) {
      // 水平击退方向 = 滚石当前运动方向（玩家被推向滚石去处）
      const kbx = this.knockbackX || kbTotal || 0;
      const kby = this.knockbackY || (kbTotal > 0 ? Math.min(-kbTotal * 0.5, -6) : 0);

      player.vx = this.direction * Math.abs(kbx);

      if (kby !== 0 && player.onGround) {
        player.vy = kby;
        player.onGround = false;
      }
      console.log(`[BoulderTrap] ${this.id} 击退 → vx:${player.vx.toFixed(1)} vy:${player.vy.toFixed(1)} dir:${this.direction > 0 ? "右" : "左"}`);
    }

    return { type: "boulder", damage: this.damage };
  }

  // ==================== 绘制 ====================
  draw(ctx) {
    ctx.save();

    // 当前帧索引 = 当前阶段索引 (0→01, 1→02, 2→03)
    const frameIdx = this.phase;
    const img = BoulderTrap._images[frameIdx];

    if (img && img.complete && img.naturalWidth > 0) {
      if (this.mirrored) {
        // 镜像翻转：在右边界处做 scale(-1, 1)
        ctx.translate(this.x + this.w, this.y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, this.w, this.h);
      } else {
        ctx.drawImage(img, this.x, this.y, this.w, this.h);
      }
    } else {
      // 图像未加载完成时的回退绘制（圆石）
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const r  = Math.min(this.w, this.h) * 0.45;

      const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      gradient.addColorStop(0,   "#b0a090");
      gradient.addColorStop(0.7, "#706050");
      gradient.addColorStop(1,   "#4a3a2a");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}
