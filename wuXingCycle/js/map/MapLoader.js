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

    // 敌人（按 type 工厂创建，扩展新敌人类型在此登记）
    (cfg.enemies || []).forEach(e => {
      switch (e.type) {
        case "rockArmor":    map.enemies.push(new EnemyRockArmor(e));    break;
        case "ironSoldier":  map.enemies.push(new EnemyIronSoldier(e));  break;
        default:             map.enemies.push(new EnemyBase(e));         break;
      }
    });

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
    map.drawGround    = (ctx, camX) => MapLoader.drawGround(ctx, consts, map, camX, asset);
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

  // ★ v5 地面精灵图无缝平铺：用 dimain.png 横向重复覆盖地面区域。
  // 物理碰撞仍由 map.groundY 与 platforms 决定（渲染与物理解耦）。
  // 滚动速度 = 1.0x 相机速度（即"贴地"滚动），最右与最左之间做边缘 alpha 融合以消除接缝。
  static _groundSeamMask = null;   // 缓存的左右接缝 mask（横向渐变）

  static _buildGroundSeamMask(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const cx = c.getContext("2d");
    // 渐变：左侧 alpha 从 0 升到 1，右侧从 1 降到 0 —— 让首尾相接时无可见缝隙
    const grad = cx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.0,  "rgba(0,0,0,0)");
    grad.addColorStop(0.5,  "rgba(0,0,0,1)");
    grad.addColorStop(1.0,  "rgba(0,0,0,0)");
    cx.fillStyle = grad;
    cx.fillRect(0, 0, w, h);
    return c;
  }

  static drawGround(ctx, c, map, camX = 0, asset = null) {
    // —— 有 platforms 的地图：地面纹理只画最低坠落线区域（角色脚底以下）
    const groundTopY = map.groundY;
    const groundH    = map.height - groundTopY;
    if (groundH <= 0) return;

    // 1) 底色兜底（防止图片未加载完时黑屏）
    ctx.fillStyle = "#1a1814";
    ctx.fillRect(0, groundTopY, map.width, groundH);

    // 2) 精灵图平铺
    const img = asset ? asset.getImage("ground_tile") : null;
    if (!img || !img.complete || img.naturalWidth <= 0) {
      // 回退：原色块渲染
      ctx.fillStyle = "#6b5b4a";
      ctx.fillRect(0, groundTopY, map.width, groundH);
      ctx.fillStyle = "#4f4234";
      ctx.fillRect(0, groundTopY, map.width, 6);
      return;
    }

    // 地面区域高 = map.height - groundY（用此高度做贴图高度，保持宽高比）
    const drawH = groundH;
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);
    if (drawW <= 0) return;

    // ★ 无缝拼接：横向滚动时使用相位偏移，首尾通过 alpha mask 融合
    // 3) 缓存接缝 mask
    if (!this._groundSeamMask || this._groundSeamMask.width !== Math.ceil(drawW)) {
      this._groundSeamMask = this._buildGroundSeamMask(Math.ceil(drawW), drawH);
    }
    const mask = this._groundSeamMask;

    // 4) 离屏 canvas：先把整张图绘制，再叠 mask 乘到 alpha
    const tile = document.createElement("canvas");
    tile.width = Math.ceil(drawW); tile.height = drawH;
    const tctx = tile.getContext("2d");
    tctx.drawImage(img, 0, 0, drawW, drawH);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(mask, 0, 0, drawW, drawH);
    tctx.globalCompositeOperation = "source-over";

    // 5) 平铺：横向 count 张，速度 1.0x 相机（贴地）
    const W = c.canvas.width;
    const count = Math.ceil(W / drawW) + 2;
    const baseOffset = -(camX * 1.0) % drawW;
    const startX = baseOffset - drawW;
    for (let i = 0; i < count; i++) {
      ctx.drawImage(tile, startX + i * drawW, groundTopY, drawW, drawH);
    }

    // 6) 顶部接缝暗线（视觉强化地表边界）
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, groundTopY, map.width, 2);
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

  // ═══════════════ 四层视差背景图片渲染 ═══════════════
  // Z序（后画盖前画）：天空色底 → 1.png → 2.png → 3.png(背景) → 地面+角色+敌人 → 4.png(前景遮罩)
  // 3.png 在背景层最上方但不遮挡游戏对象

  static _parallaxLayers = {
    woodValley: [
      { key: "bg_parallax_far",  speed: 0.18, drawH: 0.72, align: "bottom", alpha: 1.0 },
      { key: "bg_parallax_mid",  speed: 0.45, drawH: 0.78, align: "bottom", alpha: 1.0 },
      { key: "bg_parallax_near", speed: 0.80, drawH: 0.82, align: "bottom", alpha: 1.0 }
    ],
    _foreground: { key: "bg_parallax_fore", speed: 1.25, drawH: 0.55, alpha: 1.0, align: "top" }
  };

  static drawParallaxImages(ctx, c, camX, map, asset) {
    const layers = this._parallaxLayers[map.id];
    if (!layers || !asset) return;
    const W = c.canvas.width, H = c.canvas.height;
    for (const lay of layers) {
      const img = asset.getImage(lay.key);
      if (!img || !img.complete || img.naturalWidth <= 0) continue;
      const drawH = H * lay.drawH;
      const drawW = drawH * (img.naturalWidth / img.naturalHeight);
      if (drawW <= 0) continue;
      const count = Math.ceil(W / drawW) + 2;
      const baseOffset = -(camX * lay.speed) % drawW;
      const startX = baseOffset - drawW;
      ctx.save();
      ctx.globalAlpha = lay.alpha || 1;
      const y = lay.align === "top" ? 0 : H - drawH;
      for (let i = 0; i < count; i++) ctx.drawImage(img, startX + i * drawW, y, drawW, drawH);
      ctx.restore();
    }
  }

  static drawForegroundOverlay(ctx, c, camX, map, asset) {
    const fg = this._parallaxLayers._foreground;
    const layers = this._parallaxLayers[map.id];
    if (!layers || !asset) return;
    const img = asset.getImage(fg.key);
    if (!img || !img.complete || img.naturalWidth <= 0) return;
    const W = c.canvas.width, H = c.canvas.height;
    const drawH = H * fg.drawH;
    const drawW = drawH * (img.naturalWidth / img.naturalHeight);
    if (drawW <= 0) return;
    const count = Math.ceil(W / drawW) + 2;
    const baseOffset = -(camX * fg.speed) % drawW;
    const startX = baseOffset - drawW;
    ctx.save();
    ctx.globalAlpha = fg.alpha;
    for (let i = 0; i < count; i++) ctx.drawImage(img, startX + i * drawW, -drawH * 0.1, drawW, drawH);
    ctx.restore();
  }

  // ★ v4 传送门碰撞检测：圆形碰撞体（圆心=视觉中心，半径=min(w,h)/2）
  // 返回 portal 对象 {x,y,w,h,targetMap,targetX,targetY,label} 或 null
  static checkPortalCollision(player, map) {
    if (!map.portals || map.portals.length === 0) return null;
    const pr = player.getRect();
    for (const p of map.portals) {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const r  = Math.min(p.w, p.h) / 2;
      if (Collision.circleRect(cx, cy, r, pr)) {
        return p;
      }
    }
    return null;
  }
}
