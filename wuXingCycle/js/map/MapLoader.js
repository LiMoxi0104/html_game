// MapLoader：横版卷轴地图加载。
// v3 升级：支持多平台（platforms）碰撞体，替代单一 groundY。
// v4 升级：多传送门数组（portals），zhuling 图像无缝平铺背景。
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

    // 地图 → 背景 key 映射
    const BG_MAP = {
      woodValley: "bg_zhuling",
      jinDomain:  "bg_metal",
      muDomain:   "bg_wood",
      shuiDomain: "bg_water",
      huoDomain:  "bg_fire",
      tuDomain:   "bg_earth"
    };
    map.bgKey = BG_MAP[mapId] || "bg_zhuling";

    map.drawBackground = (ctx, camX) => MapLoader.drawZhulingBg(ctx, consts, camX, map, asset);
    map.drawGround    = (ctx, camX) => MapLoader.drawGround(ctx, consts, map, camX, asset);
    map.drawPlatforms = (ctx)       => MapLoader.renderPlatforms(ctx, consts, map, asset);
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

  // zhuling 渐显式整图平铺背景
  static _bgFadeAlpha = 0;        // 背景透明度（0→1 渐显）
  static _bgFadeSpeed = 0.015;    // 每帧增量（约 67 帧 ≈ 1.1 秒完成渐显）

  // 图片高度适配画布、宽度保持宽高比，从 x=0 起紧密排列填满地图全宽
  static drawZhulingBg(ctx, c, camX, map, asset) {
    const H = c.canvas.height;
    const mapW = map.width;
    const img = asset ? asset.getImage(map.bgKey) : null;

    // 底色兜底（始终不透明，杜绝白屏）
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(0, 0, mapW, H);

    // 图片未就绪：保持纯色底，alpha 归零等待下次
    if (!img || !img.complete || img.naturalWidth <= 0) {
      this._bgFadeAlpha = 0;
      return;
    }

    // 图片已就绪，计算渐变
    if (this._bgFadeAlpha < 1) {
      this._bgFadeAlpha = Math.min(1, this._bgFadeAlpha + this._bgFadeSpeed);
    }
    if (this._bgFadeAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = this._bgFadeAlpha;

    if (map.bgKey === "bg_zhuling") {
      // 木幽谷竹林图：保持平铺
      const tileH = H;
      const tileW = tileH * (img.naturalWidth / img.naturalHeight);
      if (tileW <= 0) { ctx.restore(); return; }
      const count = Math.ceil(mapW / tileW);
      for (let i = 0; i < count; i++) {
        ctx.drawImage(img, i * tileW, 0, tileW, tileH);
      }
    } else {
      // 五行域长图：一次性拉伸适配全图
      ctx.drawImage(img, 0, 0, mapW, H);
    }

    ctx.restore();
  }

  // mud_road 地面贴图：铺满地图全宽，1px重叠消黑缝
  static drawGround(ctx, c, map, camX = 0, asset = null) {
    const groundTopY = map.groundY;
    const groundH    = map.height - groundTopY;
    if (groundH <= 0) return;

    // 底色兜底
    ctx.fillStyle = "#1a1814";
    ctx.fillRect(0, groundTopY, map.width, groundH);

    const img = asset ? asset.getImage("ground_tile") : null;
    if (!img || !img.complete || img.naturalWidth <= 0) {
      ctx.fillStyle = "#6b5b4a";
      ctx.fillRect(0, groundTopY, map.width, groundH);
      ctx.fillStyle = "#4f4234";
      ctx.fillRect(0, groundTopY, map.width, 6);
      return;
    }

    // 单张瓦片：高度 = 地面区域高，宽度按宽高比自动计算
    const tileH = groundH;
    const tileW = tileH * (img.naturalWidth / img.naturalHeight);
    if (tileW <= 0) return;

    // 铺满整张地图，相邻 1px 重叠消除接缝
    const count = Math.ceil(map.width / (tileW - 1));
    for (let i = 0; i < count; i++) {
      ctx.drawImage(img, i * (tileW - 1), groundTopY, tileW, tileH);
    }

    // 顶部边界暗线
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, groundTopY, map.width, 2);
  }

  // ★ v4 多主题平台渲染（覆盖在地面之上）—— 优先使用精灵图，图片未就绪时回退纯色
  static renderPlatforms(ctx, c, map, asset) {
    if (!map.hasPlatforms) return;

    for (const p of map.platforms) {
      const t = p.type || "";
      const img = asset ? asset.getImage("plat_" + t) : null;

      if (img && img.complete && img.naturalWidth > 0) {
        // 精灵图：高度 = 平台高，宽度按比例自动计算，平铺覆盖全宽
        const tileH = p.h;
        const tileW = tileH * (img.naturalWidth / img.naturalHeight);
        if (tileW > 0) {
          const count = Math.ceil(p.w / tileW);
          for (let i = 0; i < count; i++) {
            ctx.drawImage(img, p.x + i * tileW, p.y, tileW, tileH);
          }
        }
      } else {
        // 回退纯色方块
        let fill, stroke;

        if (t.startsWith("metal_"))        { fill = "#6b6b70"; stroke = "#4a4a4f"; }
        else if (t === "pipe_floor")       { fill = "#5a5a5e"; stroke = "#3a3a3e"; }
        // —— 木之域 ——
        else if (t === "wood_floor")       { fill = "#8b7355"; stroke = "#5c4836"; }
        else if (t === "leaf_platform")    { fill = "#6aaa50"; stroke = "#4a8a30"; }
        else if (t.startsWith("vine_"))    { fill = "#5a9040"; stroke = "#3a6820"; }
        // —— 水之域 ——
        else if (t.startsWith("ice_"))     { fill = "rgba(180,220,240,0.85)"; stroke = "rgba(140,190,220,0.9)"; }
        else if (t === "ice_pillar")       { fill = "rgba(170,215,235,0.9)"; stroke = "#80b0c8"; }
        // —— 火之域 ——
        else if (t === "basalt_floor")     { fill = "#484448"; stroke = "#302830"; }
        else if (t === "firebrick")        { fill = "#9a5030"; stroke = "#6a3020"; }
        else if (t === "volcanic_step")    { fill = "#5a3830"; stroke = "#3a2018"; }
        // —— 土之域 ——
        else if (t === "sand_floor")       { fill = "#c8b898"; stroke = "#a89868"; }
        else if (t.startsWith("sandstone_")) { fill = "#b8a878"; stroke = "#887858"; }
        else if (t === "ruin_step")        { fill = "#a89878"; stroke = "#787868"; }
        else if (t === "stone_slab")       { fill = "#a09888"; stroke = "#787868"; }
        // 默认
        else                                { fill = "#6b6b70"; stroke = "#4a4a4f"; }

        ctx.fillStyle = fill;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = stroke;
        ctx.fillRect(p.x, p.y, p.w, 3);
        ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2);
      }
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
