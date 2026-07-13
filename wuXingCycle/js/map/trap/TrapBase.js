// TrapBase：陷阱父类（v2 增加击退弹开）。
// 所有地图陷阱继承此类，统一包含：
//   触发区矩形、update 状态推进、check 与玩家 Collision 对接、onTrigger 效果结算、draw 绘制。
//
// 击退系统（v2）：
//   从配置读取 knockback / knockbackX / knockbackY 参数。
//   弹开方向以陷阱中心为参考：玩家在左侧→向右弹，在右侧→向左弹。
//   地面受击时额外叠加垂直初速度（挑飞），确保脱离伤害区。
//   子类无需修改代码，仅在 mapConfig.json 中添加参数即自动获得击退能力。
class TrapBase {
  constructor(cfg) {
    this.id = cfg.id;
    this.type = cfg.type || "unknown";
    this.x = cfg.x;
    this.y = cfg.y;
    this.w = cfg.width;
    this.h = cfg.height;
    this.damage = cfg.damage || 0;
    this.active = true;      // 是否启用
    this.timer = 0;

    // 击退参数（配置层可选）
    this.knockback = cfg.knockback || 0;          // 总击退力度（px），兼容简写模式
    this.knockbackX = cfg.knockbackX || 0;        // 水平击退 px
    this.knockbackY = cfg.knockbackY || 0;        // 垂直弹起 px/s（负值=向上）

    // 特殊行为标记（v3）
    this.slow = cfg.slow || false;                // 触发后减速玩家
    this.blind = cfg.blind || false;              // 触发后致盲玩家

    // 子形态标记（v5）：用于在同类型下区分不同视觉母题
    this.variant = cfg.variant || null;
  }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  // 陷阱中心 X 坐标（用于方向计算）
  getCenterX() { return this.x + this.w / 2; }

  update(dt) { this.timer += dt; }

  // 与玩家矩形做 Collision 对接；重叠则返回效果描述，否则 null
  check(player, dt) {
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 默认效果：造成伤害 + 击退弹开。子类可重写 onTrigger 自定义行为。
  // ★ v4 增强：takeDamage 返回 false 表示被弹反拦截，跳过后续击退
  onTrigger(player) {
    // ★ v4 调用新版 takeDamage（传入 trap 引用供弹反反伤/日志用）
    const damageApplied = player.takeDamage(this.damage, this);

    if (!damageApplied) {
      // 弹反成功！伤害被拦截，跳过击退
      console.log(`[TrapBase] ${this.id} 伤害被弹反拦截！`);
      return { type: this.type, damage: this.damage, _parried: true };
    }

    // —— 特殊行为：减速 / 致盲 ——
    if (this.slow && player.applySlow) {
      player.applySlow(1500);  // 减速持续 1.5 秒
    }
    if (this.blind && player.applyBlind) {
      player.applyBlind(2000); // 致盲持续 2 秒
    }

    // —— 击退逻辑 ——
    const kbTotal = this.knockback;
    if (kbTotal > 0) {
      // 简写模式：未分别指定 X/Y 时自动拆分
      const kbx = this.knockbackX || kbTotal;
      const kby = this.knockbackY || Math.min(-kbTotal * 0.5, -6);  // 默认向上弹起
      this._applyKnockback(player, kbx, kby);
    } else if (this.knockbackX !== 0 || this.knockbackY !== 0) {
      // 独立 X/Y 模式
      this._applyKnockback(player, this.knockbackX, this.knockbackY);
    }

    return { type: this.type, damage: this.damage };
  }

  // 核心击退实现：方向计算 + 施加速度 + 边界钳制
  _applyKnockback(player, forceX, forceY) {
    if (forceX === 0 && forceY === 0) return;

    const trapCx = this.getCenterX();
    const playerCx = player.x + player.w / 2;

    // 水平方向：远离陷阱中心
    const dir = (playerCx >= trapCx) ? 1 : -1;
    player.vx = dir * Math.abs(forceX);

    // 垂直方向：若在地面上则叠加向上速度（挑飞效果）
    if (forceY !== 0 && player.onGround) {
      player.vy = forceY;     // 通常为负值（向上）
      player.onGround = false;
    }

    console.log(`[TrapBase] ${this.id} 击退 → vx:${player.vx.toFixed(1)} vy:${player.vy.toFixed(1)} dir:${dir > 0 ? "右" : "左"}`);
  }

  // ==================== 完美闪避检测接口 ====================

  // 检测指定矩形区域是否与本陷阱的伤害判定区重叠。
  // 用于完美闪避系统：传入玩家闪避前的残留碰撞箱，若重叠则说明"本该命中但被闪避躲掉"。
  // 返回：{ type, damage, trap: this } 表示会命中；null 表示安全。
  checkAtPosition(rect) {
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), rect)) {
      return { type: this.type, damage: this.damage, trap: this };
    }
    return null;
  }

  // 默认绘制（子类有 sprite 的应该 override 此方法）
  draw(ctx) { /* no-op — 有 sprite 的子类自行绘制 */ }

}
