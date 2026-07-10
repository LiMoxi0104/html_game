// CollisionManager：基于圆形碰撞体的碰撞检测与响应系统。
//
// 核心能力：
//   - 圆形碰撞判定（距离 <= 半径之和）
//   - 按标签过滤/配对，做差异化碰撞响应
//   - 支持实体间多碰撞体检测
//   - 碰撞事件分发（进入/持续/退出）
//
// 使用方式：
//   1) 实体通过 Entity.addCircleCollider() 注册碰撞体 + 标签
//   2) 每帧调用 CollisionManager.update(entityList) 执行全局检测
//   3) 通过回调或查询结果处理碰撞响应

// ==================== 碰撞记录 ====================

/** 单次碰撞对信息 */
class CollisionPair {
  constructor(a, b, colA, colB) {
    this.entityA = a;          // 实体 A 引用
    this.entityB = b;          // 实体 B 引用
    this.colliderA = colA;     // A 上参与碰撞的碰撞体
    this.colliderB = colB;     // B 上参与碰撞的碰撞体
    this.normal = null;        // 碰撞法向量（A→B 方向）
    this.penetration = 0;      // 穿透深度
    this.timestamp = Date.now();
    this.frameCount = 0;       // 持续帧数（用于区分首次/持续/退出）
  }

  /** 计算碰撞法向量和穿透深度 */
  computeResolution() {
    const dx = this.entityB.x - this.entityA.x;
    const dy = this.entityB.y - this.entityA.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) {
      // 重叠中心时默认向上推
      this.normal = { x: 0, y: -1 };
      this.penetration = this.colliderA.radius + this.colliderB.radius;
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    this.normal = { x: nx, y: ny };
    this.penetration = (this.colliderA.radius + this.colliderB.radius) - dist;
  }
}

// ==================== 碰撞规则配置 ====================

/**
 * 碰撞层矩阵：定义哪些标签之间需要进行碰撞检测。
 * 格式：{ [tagA]: Set<tag> } 或 { [tagA]: { [tagB]: true/false } }
 *
 * 示例：
 *   layers = {
 *     player: { enemy: true, wall: true, trap: true, pickup: true },
 *     enemy:  { player: true, wall: true },
 *     attack: { enemy: true },
 *     pickup: { player: true }
 *   };
 */
const DEFAULT_COLLISION_LAYERS = {
  player: ["enemy", "wall", "trap", "pickup", "trigger"],
  enemy:  ["player", "wall"],
  attack: ["enemy"],
  pickup: ["player"],
  trigger: ["player"]
};

// ==================== CollisionManager ====================

class CollisionManager {
  constructor(layers = null) {
    /** 碰撞层规则 */
    this.layers = layers || DEFAULT_COLLISION_LAYERS;

    /** 当前帧所有碰撞对 */
    this.currentPairs = [];

    /** 上一帧碰撞对（用于检测退出事件） */
    this.prevPairs = new Map();

    /** 碰撞事件回调 */
    this.onCollisionEnter = null;   // 首次碰撞回调 fn(pair)
    this.onCollisionStay = null;    // 持续碰撞回调 fn(pair)
    this.onCollisionExit = null;     // 碰撞退出回调 fn(entityA, entityB)

    /** 统计信息 */
    this.stats = {
      totalChecks: 0,
      collisionsFound: 0,
      enterEvents: 0,
      stayEvents: 0,
      exitEvents: 0
    };

    // 调试模式
    this.debugMode = false;

    // 缓存上一帧的 pair key → pair 映射
    this._prevKeys = new Set();
  }

  // ==================== 核心检测逻辑 ====================

  /**
   * 圆形碰撞判定：两圆心距离 ≤ 半径之和 → 发生碰撞
   *
   * @param {CircleCollider} a
   * @param {CircleCollider} b
   * @returns {boolean}
   */
  static circleOverlap(a, b) {
    if (!a.enabled || !b.enabled) return false;
    const dx = a.worldX - b.worldX;
    const dy = a.worldY - b.worldY;
    const distSq = dx * dx + dy * dy;
    const sumR = a.radius + b.radius;
    return distSq <= sumR * sumR;
  }

  /**
   * 计算两圆心之间的距离
   * @returns {number}
   */
  static circleDistance(a, b) {
    return Math.hypot(a.worldX - b.worldX, a.worldY - b.worldY);
  }

  /**
   * 检查两个标签是否应该进行碰撞检测
   * @param {string} tagA
   * @param {string} tagB
   * @returns {boolean}
   */
  shouldCheck(tagA, tagB) {
    const allowed = this.layers[tagA];
    if (!allowed) return false;
    if (Array.isArray(allowed)) {
      return allowed.includes(tagB);
    }
    return !!allowed[tagB];
  }

  // ==================== 每帧更新入口 ====================

  /**
   * 对实体列表执行全量碰撞检测。
   * 流程：
   *   1) 确保所有实体的碰撞体世界坐标已更新
   *   2) 两两遍历实体，按标签过滤需要检测的对
   *   3) 对每个实体对的每个碰撞体组合执行圆形重叠测试
   *   4) 记录碰撞对，触发进入/持续/退出事件
   *
   * @param {Entity[]} entities - 所有参与碰撞检测的实体列表
   */
  update(entities) {
    // 重置统计
    this.stats.totalChecks = 0;
    this.stats.collisionsFound = 0;
    this.stats.enterEvents = 0;
    this.stats.stayEvents = 0;
    this.stats.exitEvents = 0;

    // 备份上一帧的 keys 用于退出检测
    const currentKeys = new Set();

    // 1. 确保 collisionDirty 的实体刷新碰撞体坐标
    for (const e of entities) {
      if (e._collidersDirty && e.updateColliders) {
        e.updateColliders();
      }
    }

    // 2. 两两遍历 O(n²)，实际项目可用空间哈希优化
    for (let i = 0; i < entities.length; i++) {
      const eA = entities[i];
      if (!eA.alive) continue;

      const colsA = eA.getActiveColliders();
      if (colsA.length === 0) continue;

      for (let j = i + 1; j < entities.length; j++) {
        const eB = entities[j];
        if (!eB.alive) continue;

        const colsB = eB.getActiveColliders();
        if (colsB.length === 0) continue;

        // 3. 标签预检：只要任意一对标签匹配就继续
        let hasValidTagPair = false;
        outer:
        for (const ca of colsA) {
          for (const cb of colsB) {
            if (this.shouldCheck(ca.tag, cb.tag) || this.shouldCheck(cb.tag, ca.tag)) {
              hasValidTagPair = true;
              break outer;
            }
          }
        }
        if (!hasValidTagPair) {
          this.stats.totalChecks += colsA.length * colsB.length;
          continue;
        }

        // 4. 逐对碰撞体检测
        for (const ca of colsA) {
          for (const cb of colsB) {
            this.stats.totalChecks++;

            // 双向标签检查
            const checkAB = this.shouldCheck(ca.tag, cb.tag);
            const checkBA = this.shouldCheck(cb.tag, ca.tag);
            if (!checkAB && !checkBA) continue;

            // ★ 核心判定：圆形距离检测
            if (CollisionManager.circleOverlap(ca, cb)) {
              this.stats.collisionsFound++;

              // 创建碰撞对
              const pair = new CollisionPair(eA, eB, ca, cb);
              pair.computeResolution();

              const key = this._pairKey(eA, eB);
              currentKeys.add(key);

              // 判断是首次碰撞还是持续碰撞
              if (this._prevKeys.has(key)) {
                // 持续碰撞
                pair.frameCount = (this._prevPairs.get(key)?.frameCount || 0) + 1;
                this.stats.stayEvents++;
                if (this.onCollisionStay) this.onCollisionStay(pair);
              } else {
                // 首次碰撞（进入）
                pair.frameCount = 1;
                this.stats.enterEvents++;
                if (this.onCollisionEnter) this.onCollisionEnter(pair);
              }

              this.currentPairs.push(pair);
            }
          }
        }
      }
    }

    // 5. 退出事件检测：上一帧有、当前帧没有的对
    for (const prevKey of this._prevKeys) {
      if (!currentKeys.has(prevKey)) {
        this.stats.exitEvents++;
        const prevPair = this._prevPairs.get(prevKey);
        if (prevPair && this.onCollisionExit) {
          this.onCollisionExit(prevPair.entityA, prevPair.entityB);
        }
      }
    }

    // 更新缓存
    this._prevKeys = currentKeys;
    this._prevPairs.clear();
    for (const p of this.currentPairs) {
      this._prevPairs.set(this._pairKey(p.entityA, p.entityB), p);
    }

    if (this.debugMode) {
      console.log(`[CollisionManager] checks=${this.stats.totalChecks}, hits=${this.stats.collisionsFound}, ` +
                  `enter=${this.stats.enterEvents}, stay=${this.stats.stayEvents}, exit=${this.stats.exitEvents}`);
    }
  }

  // ==================== 查询方法 ====================

  /**
   * 查询某实体当前是否正在与其他实体碰撞
   * @param {Entity} entity
   * @returns {boolean}
   */
  isColliding(entity) {
    return this.currentPairs.some(p => p.entityA === entity || p.entityB === entity);
  }

  /**
   * 获取与某实体发生碰撞的所有碰撞对
   * @param {Entity} entity
   * @param {string|null} filterTag - 可选，只返回特定标签的碰撞
   * @returns {CollisionPair[]}
   */
  getCollisionsWith(entity, filterTag = null) {
    let results = this.currentPairs.filter(p => p.entityA === entity || p.entityB === entity);
    if (filterTag) {
      results = results.filter(p => {
        const other = p.entityA === entity ? p.entityB : p.entityA;
        const otherCol = p.entityA === entity ? p.colliderB : p.colliderA;
        return otherCol.tag === filterTag;
      });
    }
    return results;
  }

  /**
   * 查询指定位置点是否在某个实体的任何碰撞体内（用于鼠标点击/技能范围）
   * @param {number} worldX
   * @param {number} worldY
   * @param {Entity[]} entities
   * @param {string|null} tagFilter
   * @returns {{entity: Entity, collider: CircleCollider}|null}
   */
  queryPoint(worldX, worldY, entities, tagFilter = null) {
    for (const e of entities) {
      if (!e.alive) continue;
      for (const c of e.getActiveColliders()) {
        if (tagFilter && c.tag !== tagFilter) continue;
        const dx = worldX - c.worldX;
        const dy = worldY - c.worldY;
        if (dx * dx + dy * dy <= c.radius * c.radius) {
          return { entity: e, collider: c };
        }
      }
    }
    return null;
  }

  // ==================== 内部工具 ====================

  /** 生成唯一键标识实体对 */
  _pairKey(eA, eB) {
    // 保证顺序一致，(A,B) 和 (B,A) 产生相同 key
    const idA = eA.id || String(eA);
    const idB = eB.id || String(eB);
    return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
  }

  /** 清除所有缓存状态（场景切换时调用） */
  reset() {
    this.currentPairs = [];
    this._prevKeys.clear();
    this._prevPairs.clear();
  }
}
