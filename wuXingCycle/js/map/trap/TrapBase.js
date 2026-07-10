// TrapBase：陷阱父类（预留扩展）。所有地图陷阱继承此类，统一包含：
//   触发区矩形、update 状态推进、check 与玩家 Collision 对接、onTrigger 效果结算、draw 占位绘制。
// 新增陷阱类型（如毒雾、落石、时序禁制）仅需新建子类并到 TrapSystem.create 登记。
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
  }

  getRect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt) { this.timer += dt; }

  // 与玩家矩形做 Collision 对接；重叠则返回效果描述，否则 null
  check(player, dt) {
    if (!this.active) return null;
    if (Collision.rectOverlap(this.getRect(), player.getRect())) {
      return this.onTrigger(player);
    }
    return null;
  }

  // 默认效果：直接造成伤害。子类可重写（如持续伤害、减速、击退）
  onTrigger(player) {
    player.takeDamage(this.damage);
    return { type: this.type, damage: this.damage };
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(122,31,31,0.35)";
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}
