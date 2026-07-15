// Entity：游戏实体基类 —— 封装世界坐标、旋转角度、旋转中心与碰撞体管理。
//
// 设计原则：
//   1) 碰撞体依附于实体的"旋转中心"（pivot），仅保存相对于自身的局部坐标；
//   2) 每帧更新时先变换位置/旋转变量，再对碰撞体局部坐标执行旋转变换，
//      最后叠加世界坐标得到碰撞体的真实世界位置；
//   3) 只要碰撞体绑定在自身坐标系下，实体无论平移还是旋转，碰撞体都会自动跟随。
//
// 使用示例：
//   const player = new Entity(100, 200);
//   player.addCircleCollider("body", 0, 0, 20, "player");
//   player.update(dt);
//   const worldPos = player.getColliderWorldPos("body"); // {x, y}
//
// v1 初始版本：圆形碰撞体 + 标签系统

// ==================== 碰撞标签常量 ====================
// 用于区分不同类型对象，做差异化的碰撞响应逻辑
const ColliderTag = Object.freeze({
  PLAYER: "player",       // 主角
  ENEMY: "enemy",         // 敌方
  WALL: "wall",           // 墙体 / 地形障碍
  TRAP: "trap",           // 陷阱 / 区域伤害
  ATTACK: "attack",       // 攻击判定盒（临时）
  PICKUP: "pickup",       // 可拾取物品
  TRIGGER: "trigger",     // 触发区域（存档点/传送门）
});

// ==================== 圆形碰撞体 ====================
class CircleCollider {
  /**
   * @param {string} id - 碰撞体唯一标识（如 "body"、"hitbox"）
   * @param {number} localX - 相对于实体旋转中心的局部 X 坐标
   * @param {number} localY - 相对于实体旋转中心的局部 Y 坐标
   * @param {number} radius - 碰撞半径
   * @param {string} tag - 碰撞标签（用于分类响应）
   */
  constructor(id, localX, localY, radius, tag = "none") {
    this.id = id;
    this.localX = localX;    // 局部 X（相对 pivot）
    this.localY = localY;    // 局部 Y（相对 pivot）
    this.radius = radius;
    this.tag = tag;

    // 缓存的世界坐标（每帧由 Entity.updateColliders() 计算）
    this.worldX = 0;
    this.worldY = 0;

    // 启用状态（可单独禁用某个碰撞体）
    this.enabled = true;
  }

  /** 获取碰撞体在世界的圆心位置 */
  getWorldCenter() {
    return { x: this.worldX, y: this.worldY };
  }

  /** 获取碰撞体信息（用于调试可视化） */
  getInfo() {
    return {
      id: this.id,
      tag: this.tag,
      local: { x: this.localX, y: this.localY },
      world: { x: this.worldX, y: this.worldY },
      radius: this.radius,
      enabled: this.enabled
    };
  }
}

// ==================== Entity 实体基类 ====================
class Entity {
  /**
   * @param {number} x - 世界坐标 X
   * @param {number} y - 世界坐标 Y
   * @param {Object} opts - 可选配置
   * @param {number} opts.pivotX - 旋转中心偏移 X（默认为宽度的一半）
   * @param {number} opts.pivotY - 旋转中心偏移 Y（默认为高度的一半）
   * @param {number} opts.rotation - 初始旋转角度（弧度，默认 0）
   * @param {number} opts.width - 实体视觉宽度（用于计算默认 pivot）
   * @param {number} opts.height - 实体视觉高度
   */
  constructor(x, y, opts = {}) {
    // ======== 1. 主体数据结构 ========

    // 世界坐标位置
    this.x = x;
    this.y = y;

    // 整体旋转角度（弧度，顺时针为正）
    this.rotation = opts.rotation || 0;

    // 实体尺寸（用于渲染和默认 pivot 计算）
    this.width = opts.width || 40;
    this.height = opts.height || 60;

    // 旋转中心（相对于实体左上角的偏移量）
    // 默认位于实体几何中心
    this.pivotX = opts.pivotX !== undefined ? opts.pivotX : this.width / 2;
    this.pivotY = opts.pivotY !== undefined ? opts.pivotY : this.height / 2;

    // 运动参数
    this.vx = 0;
    this.vy = 0;
    this.speed = opts.speed || 200;

    // 存活状态
    this.alive = true;

    // ======== 2. 碰撞体容器 ========
    // 所有碰撞体以 id 为键存储
    this._colliders = {};

    // 碰撞体缓存标记（避免每帧重复计算未变更的实体）
    this._collidersDirty = true;
  }

  // ==================== 位置 & 旋转操作 ====================

  /** 设置世界坐标 */
  setPosition(x, y) {
    if (this.x !== x || this.y !== y) {
      this.x = x;
      this.y = y;
      this._collidersDirty = true;
    }
  }

  /** 设置旋转角度（弧度） */
  setRotation(rad) {
    if (this.rotation !== rad) {
      this.rotation = rad;
      this._collidersDirty = true;
    }
  }

  /** 获取旋转中心的世界坐标 */
  getPivotWorld() {
    return {
      x: this.x + this.pivotX,
      y: this.y + this.pivotY
    };
  }

  // ==================== 碰撞体管理 ====================

  /**
   * 添加一个圆形碰撞体
   * @param {string} id - 唯一标识
   * @param {number} localX - 相对于旋转中心的局部 X
   * @param {number} localY - 相对于旋转中心的局部 Y
   * @param {number} radius - 半径
   * @param {string} tag - 碰撞标签
   * @returns {CircleCollider} 新建的碰撞体实例
   */
  addCircleCollider(id, localX, localY, radius, tag = "none") {
    const col = new CircleCollider(id, localX, localY, radius, tag);
    this._colliders[id] = col;
    this._collidersDirty = true;
    return col;
  }

  /**
   * 移除指定碰撞体
   * @param {string} id
   */
  removeCollider(id) {
    delete this._colliders[id];
  }

  /** 获取指定碰撞体 */
  getCollider(id) {
    return this._colliders[id] || null;
  }

  /** 获取所有启用的碰撞体列表 */
  getActiveColliders() {
    const result = [];
    for (const id in this._colliders) {
      const c = this._colliders[id];
      if (c.enabled) result.push(c);
    }
    return result;
  }

  /**
   * 设置碰撞体启用状态
   * @param {string} id
   * @param {boolean} enabled
   */
  setColliderEnabled(id, enabled) {
    if (this._colliders[id]) {
      this._colliders[id].enabled = enabled;
    }
  }

  // ==================== 3. 坐标跟随更新逻辑（核心）====================

  /**
   * 每帧调用：根据当前位置和旋转，重新计算所有碰撞体的世界坐标。
   *
   * 变换流程：
   *   a) 取碰撞体局部坐标 (localX, localY)
   *   b) 绕旋转中心 (pivotWorldX, pivotWorldY) 旋转 rotation 弧度
   *   c) 将旋转后的偏移叠加到旋转中心世界坐标上 → 得到碰撞体最终世界位置
   *
   * 公式推导：
   *   worldX = pivotX' + localX * cos(θ) - localY * sin(θ)
   *   worldY = pivotY' + localX * sin(θ) + localY * cos(θ)
   *   其中 (pivotX', pivotY') 是旋转中心在世界中的位置
   */
  updateColliders() {
    if (!this._collidersDirty && !this.alive) return;

    const pw = this.x + this.pivotX;   // 旋转中心世界 X
    const py = this.y + this.pivotY;   // 旋转中心世界 Y
    const cosR = Math.cos(this.rotation);
    const sinR = Math.sin(this.rotation);

    for (const id in this._colliders) {
      const c = this._colliders[id];
      if (!c.enabled) continue;

      // 对局部坐标做旋转变换
      const lx = c.localX;
      const ly = c.localY;
      const rx = lx * cosR - ly * sinR;   // 旋转后的局部 X
      const ry = lx * sinR + ly * cosR;   // 旋转后的局部 Y

      // 叠加旋转中心世界坐标 → 最终世界位置
      c.worldX = pw + rx;
      c.worldY = py + ry;
    }

    this._collidersDirty = false;
  }

  /**
   * 获取指定碰撞体的世界坐标（带缓存检查）
   * @param {string} id
   * @returns {{x: number, y: number}|null}
   */
  getColliderWorldPos(id) {
    const c = this._colliders[id];
    if (!c || !c.enabled) return null;
    // 如果脏标记为 true，立即刷新该碰撞体的世界坐标
    if (this._collidersDirty) {
      this.updateColliders();
    }
    return { x: c.worldX, y: c.worldY };
  }

  // ==================== 实体更新接口 ====================

  /**
   * 子类覆写此方法实现自定义更新逻辑。
   * 基类只处理碰撞体坐标同步；子类应在此方法末尾调用 super.update(dt) 或手动触发 updateColliders()
   * @param {number} dt - 时间差 ms
   */
  update(dt) {
    // 子类可在此处更新位置/速度等
    // ...

    // 每帧必须更新碰撞体世界坐标（确保跟随实体移动/旋转）
    this.updateColliders();
  }
}
