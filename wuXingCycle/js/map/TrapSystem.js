// TrapSystem：地图陷阱系统管理器。读取地图配置中的 traps 列表，按 type 实例化对应陷阱对象，
// 每帧推进陷阱状态并与玩家做 Collision 对接触发效果。新增陷阱类型只需在 js/map/trap/ 下扩展，
// 并在 create() 中登记，无需改动核心逻辑（符合拓展预留规范）。
class TrapSystem {
  constructor(mapConfig, collision) {
    this.collision = collision;
    this.traps = (mapConfig.traps || [])
      .map(cfg => TrapSystem.create(cfg))
      .filter(Boolean);  // 过滤掉 create() 返回的 falsy 值
  }

  // 按 type/variant 工厂创建陷阱实例（预留扩展点）
  // cfg.type 为顶层分类（spike/poison/electricGrid 等），cfg.variant 为具体变体名
  static create(cfg) {
    // 优先使用 variant（精灵动画陷阱），其次使用 type（通用类陷阱）
    const lookup = cfg.variant || cfg.type;

    switch (lookup) {
      case "boulder":        return new BoulderTrap(cfg);
      case "dragon":         return new DragonTrap(cfg);
      case "thorn":          return new ThornTrap(cfg);
      case "icegate":        return new IceGateTrap(cfg);
      case "firewall":       return new FireWallTrap(cfg);
      case "lava":           return new LavaTrap(cfg);
      case "pillar":         return new PillarTrap(cfg);
      case "thorn_vine":     return new ThornVineTrap(cfg);
      default:
        console.warn(`[TrapSystem] 未识别的陷阱类型 "${cfg.type}" (variant="${cfg.variant}")，已忽略`);
        return null;
    }
  }

  // dt: 帧间隔 ms；player: 玩家对象（需实现 getRect() 与 takeDamage(d)）；onTrigger: 触发回调
  update(dt, player, onTrigger) {
    for (const t of this.traps) {
      if (!t) continue;
      t.update(dt, player);
      const result = t.check(player, dt);
      if (result && onTrigger) onTrigger(result, t);
    }
  }

  // 检测指定矩形区域是否被任何陷阱命中（完美闪避用）
  // 返回第一个命中的陷阱结果，无命中返回 null
  checkAtPosition(rect) {
    for (const t of this.traps) {
      const hit = t.checkAtPosition(rect);
      if (hit) return hit;
    }
    return null;
  }

  draw(ctx) {
    for (const t of this.traps) t.draw(ctx);
  }
}
