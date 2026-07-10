// MapLoader：横版卷轴地图加载 + 视差滚动框架（阶段1 单地图占位）。
// 从 config/mapConfig.json 读取地图数据，构建 enemies，并提供分层绘制方法。
class MapLoader {
  // cfg 为 mapConfig.json 中对应地图节点
  static load(mapId, consts, cfg, asset) {
    const map = {
      id: mapId,
      name: cfg.name,
      width: cfg.width,
      height: cfg.height,
      groundY: cfg.groundY,
      spawn: cfg.spawn,
      cfg: cfg,
      enemies: []
    };
    (cfg.enemies || []).forEach(e => map.enemies.push(new EnemyBase(e)));

    map.drawBackground = (ctx, camX) => MapLoader.drawParallax(ctx, consts, camX, map);
    map.drawGround = (ctx) => MapLoader.drawGround(ctx, consts, map);
    return map;
  }

  // 分层视差背景：远景/近景以不同速率随相机平移（程序化贝塞尔山峦）
  static drawParallax(ctx, c, camX, map) {
    const W = c.canvas.width, H = c.canvas.height;
    ctx.fillStyle = c.colors.paper;
    ctx.fillRect(camX, 0, W, H);

    // 远山（慢速视差）
    ctx.fillStyle = c.colors.mountainFar;
    const off1 = (camX * 0.2) % W;
    MapLoader.hills(ctx, camX - off1 - W, H, 130, 6);
    MapLoader.hills(ctx, camX - off1, H, 130, 6);

    // 近山（快速视差）
    ctx.fillStyle = c.colors.mountain;
    const off2 = (camX * 0.45) % W;
    MapLoader.hills(ctx, camX - off2 - W, H, 86, 8);
    MapLoader.hills(ctx, camX - off2, H, 86, 8);
  }

  static hills(ctx, x, H, height, count) {
    const span = 960;
    ctx.beginPath();
    ctx.moveTo(x, H);
    const step = span / count;
    for (let i = 0; i <= count; i++) {
      const bx = x + i * step;
      const peak = H - height * (0.6 + 0.4 * Math.sin(i * 1.7));
      ctx.quadraticCurveTo(bx - step / 2, peak, bx, H - height * 0.4 * Math.abs(Math.sin(i)));
    }
    ctx.lineTo(x + span, H);
    ctx.closePath();
    ctx.fill();
  }

  static drawGround(ctx, c, map) {
    ctx.fillStyle = "#6b5b4a";
    ctx.fillRect(0, map.groundY, map.width, map.height - map.groundY);
    ctx.fillStyle = "#4f4234";
    ctx.fillRect(0, map.groundY, map.width, 6);
  }
}
