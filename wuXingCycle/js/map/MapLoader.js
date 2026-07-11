// MapLoader：横版卷轴地图加载 + 视差滚动框架。
// v3 升级：支持多平台（platforms）碰撞体，替代单一 groundY。
// v4 升级：多传送门数组（portals），五行主题背景/平台渲染。
// 从 config/mapConfig.json 读取地图数据，构建 enemies/platforms，并提供分层绘制方法。
class MapLoader {
  // cfg 为 mapConfig.json 中对应地图节点
  static load(mapId, consts, cfg, asset) {
    const map = {
      id: mapId,
      name: cfg.name,
      width: cfg.width,
      height: cfg.height,
      groundY: cfg.groundY,       // 全局最低地面 Y（死亡线/坠落线）
      spawn: cfg.spawn,
      cfg: cfg,
      enemies: [],
      platforms: [],               // ★ v3 多平台碰撞体 [{x,y,w,h,type}]
      portals: []                  // ★ v4 传送门数组 [{x,y,w,h,targetMap,targetX,targetY,label}]
    };

    // 敌人
    (cfg.enemies || []).forEach(e => map.enemies.push(new EnemyBase(e)));

    // ★ v3 平台碰撞体：用于玩家站立检测 + 渲染
    if (cfg.platforms && cfg.platforms.length > 0) {
      map.platforms = cfg.platforms.map(p => ({
        x: p.x, y: p.y, w: p.w, h: p.h, type: p.type || "default"
      }));
      map.hasPlatforms = true;
    }

    // ★ v4 传送门数据（portals 数组 + 旧格式兼容）
    if (cfg.portals && cfg.portals.length > 0) {
      map.portals = cfg.portals;
    } else if (cfg.portal) {
      // 旧版单传送门 → 自动升级为数组
      map.portals = [cfg.portal];
    }

    map.drawBackground = (ctx, camX) => MapLoader.drawParallax(ctx, consts, camX, map);
    map.drawGround    = (ctx)       => MapLoader.drawGround(ctx, consts, map);
    map.drawPlatforms = (ctx)       => MapLoader.renderPlatforms(ctx, consts, map);
    map.drawPortals   = (ctx, t)    => MapLoader.renderPortals(ctx, map, t);  // ★ v4
    return map;
  }

  // ★ v3 平台碰撞检测：检测玩家矩形是否站在某个平台上。
  // 返回 { onPlatform: bool, platformY: number|null } —— 平台表面 Y（即站上去的 Y 坐标）
  static checkPlatformCollision(player, map) {
    if (!map.hasPlatforms) return { onPlatform: false, platformY: null };

    const px = player.x, py = player.y, pw = player.w, ph = player.h;
    const feetY = py + ph;           // 玩家脚底
    const feetCenterX = px + pw / 2;
    const tolerance = 4;             // 允许微穿透容差

    let bestPlatformY = null;
    for (const p of map.platforms) {
      if (feetCenterX >= p.x && feetCenterX <= p.x + p.w) {
        if (feetY >= p.y && feetY <= p.y + tolerance) {
          if (bestPlatformY === null || p.y < bestPlatformY) {
            bestPlatformY = p.y;
          }
        }
      }
    }
    return {
      onPlatform: bestPlatformY !== null,
      platformY: bestPlatformY
    };
  }

  // ★ v3 平台碰撞检测（泛用）
  static isOnAnyPlatform(rect, map) {
    if (!map.hasPlatforms) return false;
    const feetY = rect.y + rect.h;
    const feetCX = rect.x + rect.w / 2;
    const tolerance = 4;
    for (const p of map.platforms) {
      if (feetCX >= p.x && feetCX <= p.x + p.w &&
          feetY >= p.y && feetY <= p.y + tolerance) {
        return true;
      }
    }
    return false;
  }

  // ★ v3 平台碰撞（底部碰撞）：检测玩家跳起时头部是否撞到平台底部
  static checkPlatformCeiling(player, map) {
    if (!map.hasPlatforms) return null;
    const headY = player.y;
    const headCX = player.x + player.w / 2;
    const tolerance = 3;
    let ceilingY = null;
    for (const p of map.platforms) {
      if (headCX >= p.x && headCX <= p.x + p.w) {
        if (headY >= p.y + p.h - tolerance && headY <= p.y + p.h) {
          if (ceilingY === null || p.y + p.h < ceilingY) {
            ceilingY = p.y + p.h;
          }
        }
      }
    }
    return ceilingY;
  }

  // —— 渲染 ——

  // 分层视差背景：远景/近景以不同速率随相机平移（★ v4 五行主题）
  static drawParallax(ctx, c, camX, map) {
    const W = c.canvas.width, H = c.canvas.height;
    const id = map.id;

    // 主题背景色
    const bgColors = {
      jinDomain:  "#d4cfc4",    // 金属灰
      muDomain:   "#d4e8cc",    // 林木绿
      shuiDomain: "#c8dced",    // 冰湖蓝
      huoDomain:  "#ead8c8",    // 熔岩橙
      tuDomain:   "#e8dfc8",    // 沙漠黄
    };
    ctx.fillStyle = bgColors[id] || c.colors.paper;
    ctx.fillRect(camX, 0, W, H);

    // 远山颜色
    const farColors = {
      jinDomain: "#a8a49b", muDomain: "#9ab89a", shuiDomain: "#90b4c8",
      huoDomain: "#c89070", tuDomain: "#c8b898",
    };
    ctx.fillStyle = farColors[id] || c.colors.mountainFar;
    const off1 = (camX * 0.2) % W;
    MapLoader.hills(ctx, camX - off1 - W, H, 130, 6);
    MapLoader.hills(ctx, camX - off1, H, 130, 6);

    // 近山
    const nearColors = {
      jinDomain: "#7a7672", muDomain: "#6a8e5a", shuiDomain: "#5a8498",
      huoDomain: "#986050", tuDomain: "#987858",
    };
    ctx.fillStyle = nearColors[id] || c.colors.mountain;
    const off2 = (camX * 0.45) % W;
    MapLoader.hills(ctx, camX - off2 - W, H, 86, 8);
    MapLoader.hills(ctx, camX - off2, H, 86, 8);

    // 地图专属装饰纹理
    if (id === "jinDomain") {
      ctx.fillStyle = "rgba(100,95,88,0.12)";
      for (let bx = 0; bx < map.width; bx += 120)
        ctx.fillRect(bx - camX * 0.15, H - 160, 8, 160);
    } else if (id === "muDomain") {
      ctx.fillStyle = "rgba(50,120,50,0.06)";
      for (let bx = 0; bx < map.width; bx += 160)
        ctx.fillRect(bx - camX * 0.12, H - 180, 6, 180);
    } else if (id === "shuiDomain") {
      ctx.fillStyle = "rgba(40,100,160,0.06)";
      for (let bx = 0; bx < map.width; bx += 100)
        ctx.fillRect(bx - camX * 0.1, H - 140, 4, 140);
    } else if (id === "huoDomain") {
      ctx.fillStyle = "rgba(180,80,20,0.06)";
      for (let bx = 0; bx < map.width; bx += 140)
        ctx.fillRect(bx - camX * 0.14, H - 200, 5, 200);
    } else if (id === "tuDomain") {
      ctx.fillStyle = "rgba(140,110,50,0.07)";
      for (let bx = 0; bx < map.width; bx += 110)
        ctx.fillRect(bx - camX * 0.13, H - 150, 5, 150);
    }
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

  // 单层地面（木幽谷用）
  static drawGround(ctx, c, map) {
    // 五行地图使用平台系统，地面仅作坠落线填充
    if (map.hasPlatforms) {
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(0, map.groundY, map.width, map.height - map.groundY);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(0, map.groundY, map.width, 4);
      return;
    }
    ctx.fillStyle = "#6b5b4a";
    ctx.fillRect(0, map.groundY, map.width, map.height - map.groundY);
    ctx.fillStyle = "#4f4234";
    ctx.fillRect(0, map.groundY, map.width, 6);
  }

  // ★ v4 多主题平台渲染（覆盖在地面之上）
  static renderPlatforms(ctx, c, map) {
    if (!map.hasPlatforms) return;

    for (const p of map.platforms) {
      let fill, stroke;

      const t = p.type || "";
      if (t.startsWith("metal_"))        { fill = "#6b6b70"; stroke = "#4a4a4f"; }
      else if (t === "bridge" || t === "bridge_break") { fill = "#8b6914"; stroke = "#5c4510"; }
      else if (t === "gear_floor")       { fill = "#8a7d50"; stroke = "#5c5436"; }
      else if (t.startsWith("glass_"))    { fill = "rgba(160,200,220,0.65)"; stroke = "rgba(120,160,180,0.8)"; }
      else if (t.startsWith("floating_")) { fill = "#7a7664"; stroke = "#555248"; }
      else if (t === "small_block")      { fill = "#8c8c92"; stroke = "#5e5e64"; }
      else if (t === "pipe_floor")       { fill = "#5a5a5e"; stroke = "#3a3a3e"; }
      // —— 木之域 ——
      else if (t === "wood_floor")       { fill = "#8b7355"; stroke = "#5c4836"; }
      else if (t === "log_bridge")        { fill = "#6b5a3a"; stroke = "#4a3a20"; }
      else if (t === "leaf_platform")     { fill = "#6aaa50"; stroke = "#4a8a30"; }
      else if (t.startsWith("vine_"))     { fill = "#5a9040"; stroke = "#3a6820"; }
      else if (t === "root_floor" || t === "root_step") { fill = "#7a5a3a"; stroke = "#5a3a20"; }
      else if (t === "hollow_log_floor") { fill = "#8a6a4a"; stroke = "#6a4a2a"; }
      else if (t.startsWith("mushroom_")) { fill = "#c8a060"; stroke = "#a08040"; }
      else if (t === "thin_log_bridge")   { fill = "#6a5a38"; stroke = "#4a3a20"; }
      // —— 水之域 ——
      else if (t.startsWith("ice_"))      { fill = "rgba(180,220,240,0.85)"; stroke = "rgba(140,190,220,0.9)"; }
      else if (t === "ice_pillar")        { fill = "rgba(170,215,235,0.9)"; stroke = "#80b0c8"; }
      else if (t === "stalagmite")        { fill = "#8098a8"; stroke = "#587080"; }
      // —— 火之域 ——
      else if (t === "basalt_floor")      { fill = "#484448"; stroke = "#302830"; }
      else if (t === "firebrick")         { fill = "#9a5030"; stroke = "#6a3020"; }
      else if (t === "obsidian_ridge")    { fill = "#282028"; stroke = "#181018"; }
      else if (t.startsWith("charred_"))  { fill = "#3a2820"; stroke = "#201810"; }
      else if (t === "sliding_slope")     { fill = "#6a4028"; stroke = "#4a2818"; }
      else if (t === "metal_grate")       { fill = "#58585c"; stroke = "#38383c"; }
      else if (t === "volcanic_step")     { fill = "#5a3830"; stroke = "#3a2018"; }
      // —— 土之域 ——
      else if (t === "sand_floor")        { fill = "#c8b898"; stroke = "#a89868"; }
      else if (t.startsWith("sandstone_")) { fill = "#b8a878"; stroke = "#887858"; }
      else if (t === "ruin_step")         { fill = "#a89878"; stroke = "#787868"; }
      else if (t === "clay_floor")        { fill = "#a88860"; stroke = "#806840"; }
      else if (t === "buried_floor")      { fill = "#988868"; stroke = "#786850"; }
      else if (t.startsWith("crack_"))    { fill = "#b09870"; stroke = "#887050"; }
      else if (t === "sandstone_slope")   { fill = "#c0a880"; stroke = "#988860"; }
      else if (t === "stone_slab")        { fill = "#a09888"; stroke = "#787868"; }
      else if (t === "earth_platform")    { fill = "#988060"; stroke = "#706050"; }
      // 默认
      else                                { fill = "#6b6b70"; stroke = "#4a4a4f"; }

      ctx.fillStyle = fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = stroke;
      ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
    }
  }

  // ★ v4 多传送门渲染：遍历 portals 数组，每个门独立脉冲光环 + 标签
  static renderPortals(ctx, map, now = performance.now()) {
    if (!map.portals || map.portals.length === 0) return;
    const t = now / 1000;

    for (const p of map.portals) {
      ctx.save();
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;

      // 1. 外圈脉冲光环（3层）
      for (let ring = 0; ring < 3; ring++) {
        const phase  = t * 1.2 + ring * 2.1;
        const radius = 24 + ring * 8 + Math.sin(phase) * 5;
        const alpha  = 0.18 + Math.sin(phase * 1.3) * 0.08;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(202,166,74,${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 2. 漩涡核心弧
      for (let arc = 0; arc < 3; arc++) {
        const a0 = t * 2 + arc * 2.09;
        ctx.beginPath();
        ctx.arc(cx, cy, 13 + arc * 5, a0, a0 + 4.2);
        ctx.strokeStyle = `rgba(255,230,180,${0.5 + arc * 0.1})`;
        ctx.lineWidth = 3 - arc * 0.5;
        ctx.stroke();
      }

      // 3. 中心光球
      const glowGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
      glowGrad.addColorStop(0, "rgba(255,240,200,0.85)");
      glowGrad.addColorStop(0.5, "rgba(202,166,74,0.35)");
      glowGrad.addColorStop(1, "rgba(202,166,74,0)");
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();

      // 4. 浮动标签文字
      const labelY = p.y - 12 + Math.sin(t * 2.5 + p.x * 0.01) * 3;
      ctx.fillStyle = "#caa64a";
      ctx.font = "bold 11px 'Microsoft YaHei', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.label || "传送门", cx, labelY);

      ctx.restore();
    }
  }

  // ★ v4 传送门碰撞检测：遍历所有传送门，返回第一个碰撞到的
  // 返回 portal 对象 {x,y,w,h,targetMap,targetX,targetY,label} 或 null
  static checkPortalCollision(player, map) {
    if (!map.portals || map.portals.length === 0) return null;
    for (const p of map.portals) {
      if (player.x < p.x + p.w &&
          player.x + player.w > p.x &&
          player.y < p.y + p.h &&
          player.y + player.h > p.y) {
        return p;
      }
    }
    return null;
  }
}
