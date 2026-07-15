// InputManager：键盘输入管理器（桌面端）。
// 基础移动：WASD / 方向键  |  跳跃：空格
// 动态招式系统组合键：
//   J          → 轻击槽1（light1）
//   S + J      → 轻击槽2（light2）
//   W + J      → 轻击槽3（light3，W 按下后 0.15s 内按 J 触发）
//   W + K      → 重击槽1（heavy1）
//   A/D + K    → 重击槽2（heavy2）
//   S + K      → 重击槽3（heavy3）
//   L          → 弹反（parry，固定）
//   Shift      → 闪避（dodge，向后瞬移+无敌残留箱）
// 提供 isDown(持续) 与 isPressed(当帧边沿) 两种判定。
class InputManager {
  constructor() {
    this.down = {};       // 当前按下的键
    this.pressed = {};    // 当帧新按下的键（边沿触发）

    // W 键短按时间戳追踪（供 light3 判定用）
    this._wPressTime = 0;          // 最近一次 W 按下的 performance.now 时间
    this._wPressWindow = 150;       // W 按下后有效窗口 ms

    // 跳跃键释放追踪（供蓄力跳/矮跳判定用）
    this._jumpReleased = false;     // 当帧是否松开了空格
    this._wasJumpDown = false;      // 上一帧空格是否按下

    window.addEventListener("keydown", (e) => {
      const k = this.norm(e.key);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (!this.down[k]) {
        this.pressed[k] = true;
        // 记录 W 按下时刻（用于 light3 的 W+J 时序检测）
        if (k === "w" || k === "arrowup") {
          this._wPressTime = performance.now();
        }
      }
      this.down[k] = true;
    });
    window.addEventListener("keyup", (e) => {
      const k = this.norm(e.key);
      this.down[k] = false;
    });
    // 失焦时清空，避免按键卡住
    window.addEventListener("blur", () => { this.down = {}; this.pressed = {}; });
  }

  norm(k) { return k.toLowerCase(); }

  isDown(key) { return !!this.down[key]; }
  isPressed(key) { return !!this.pressed[key]; }
  endFrame() {
    this.pressed = {};
    // 检测空格释放边沿（上一帧按下 + 当前帧未按下）
    const nowDown = !!this.down[" "];
    this._jumpReleased = this._wasJumpDown && !nowDown;
    this._wasJumpDown = nowDown;
  }

  /**
   * ★ 强制清空全部输入状态。
   *    传送后调用：清除按键残留 + 重置组合键时序。
   */
  reset() {
    this.down = {};
    this.pressed = {};
    this._jumpReleased = false;
    this._wasJumpDown = false;
    this._wPressTime = 0;
  }

  // ==================== 方向与移动 ====================
  moveLeft() { return this.isDown("a") || this.isDown("arrowleft"); }
  moveRight() { return this.isDown("d") || this.isDown("arrowright"); }
  moveUp() { return this.isDown("w") || this.isDown("arrowup"); }
  moveDown() { return this.isDown("s") || this.isDown("arrowdown"); }
  jumpPressed() { return this.isPressed(" "); }
  jumpDown() { return this.isDown(" "); }           // 空格持续按下（用于蓄力跳）
  jumpReleased() { return this._jumpReleased; }      // 当帧松开空格

  // ==================== 基础攻击键 ====================
  attackLightPressed() { return this.isPressed("j"); }       // J 键
  attackHeavyPressed() { return this.isPressed("k"); }       // K 键
  parryPressed() { return this.isPressed("l"); }             // L 键

  // ==================== 闪避 ====================
  dodgePressed() { return this.isPressed("shift"); }         // Shift 闪避

  // ==================== 组合键：方向修饰符 + 攻击键 ====================

  // J 单独按下（无方向修饰）→ 对应 light1
  light1Pressed() {
    return this.attackLightPressed() && !this.moveUp() && !this.moveDown();
  }

  // S + J 同时按下 → 对应 light2
  light2Pressed() {
    return this.attackLightPressed() && this.moveDown() && !this.moveUp();
  }

  // W + J（W 先按后 0.15s 内按 J）→ 对应 light3
  // 要求：当前帧按下了 J，且 W 在最近 150ms 内被按过，且未同时按住 S
  light3Pressed() {
    if (!this.attackLightPressed()) return false;
    if (this.moveDown()) return false;           // 排除与 light2 冲突
    const elapsed = performance.now() - this._wPressTime;
    if (elapsed > this._wPressWindow) return false;  // 超出时序窗口
    return true;
  }

  // W + K 同时按下 → 对应 heavy1
  heavy1Pressed() {
    return this.attackHeavyPressed() && this.moveUp() && !this.moveDown() && !this.moveLeft() && !this.moveRight();
  }

  // A/D + K 同时按下（左右+K）→ 对应 heavy2
  heavy2Pressed() {
    return this.attackHeavyPressed() && (this.moveLeft() || this.moveRight()) && !this.moveUp() && !this.moveDown();
  }

  // S + K 同时按下 → 对应 heavy3
  heavy3Pressed() {
    return this.attackHeavyPressed() && this.moveDown() && !this.moveUp();
  }

  // 通用槽位查询：根据传入的 slotKey 返回对应组合键是否触发
  isSlotPressed(slotKey) {
    switch (slotKey) {
      case "light1":  return this.light1Pressed();
      case "light2":  return this.light2Pressed();
      case "light3":  return this.light3Pressed();
      case "heavy1":  return this.heavy1Pressed();
      case "heavy2":  return this.heavy2Pressed();
      case "heavy3":  return this.heavy3Pressed();
      case "parry":   return this.parryPressed();
      default:        return false;
    }
  }

  // ★ 蓄力支持：检测组合键是否持续按下（isDown 而非 isPressed）
  isSlotDown(slotKey) {
    switch (slotKey) {
      case "light1":  return this.isDown("j") && !this.moveUp() && !this.moveDown();
      case "light2":  return this.isDown("j") && this.moveDown() && !this.moveUp();
      case "light3":  return this.isDown("j") && this.moveUp() && !this.moveDown();
      case "heavy1":  return this.isDown("k") && this.moveUp() && !this.moveDown() && !this.moveLeft() && !this.moveRight();
      case "heavy2":  return this.isDown("k") && (this.moveLeft() || this.moveRight()) && !this.moveUp() && !this.moveDown();
      case "heavy3":  return this.isDown("k") && this.moveDown() && !this.moveUp();
      case "parry":   return this.isDown("l");
      default:        return false;
    }
  }
}
