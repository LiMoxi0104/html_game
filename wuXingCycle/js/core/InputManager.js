// InputManager：仅键盘输入（桌面端）。WASD/方向键移动，空格跳跃，J 轻击，K 重击，L 弹反。
// 提供持续按下(isDown)与当帧触发(isPressed)两种判定，避免连击锁帧问题。
class InputManager {
  constructor() {
    this.down = {};      // 当前按下的键
    this.pressed = {};   // 当帧新按下的键（边沿触发）

    window.addEventListener("keydown", (e) => {
      const k = this.norm(e.key);
      // 防止空格/方向键滚动页面
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (!this.down[k]) this.pressed[k] = true;
      this.down[k] = true;
    });
    window.addEventListener("keyup", (e) => {
      this.down[this.norm(e.key)] = false;
    });
    // 失焦时清空，避免“按键卡住”
    window.addEventListener("blur", () => { this.down = {}; this.pressed = {}; });
  }

  norm(k) { return k.toLowerCase(); }

  isDown(key) { return !!this.down[key]; }
  isPressed(key) { return !!this.pressed[key]; }
  // 每帧末清空边沿触发标记
  endFrame() { this.pressed = {}; }

  // 语义化方向
  moveLeft() { return this.isDown("a") || this.isDown("arrowleft"); }
  moveRight() { return this.isDown("d") || this.isDown("arrowright"); }
  moveUp() { return this.isDown("w") || this.isDown("arrowup"); }
  moveDown() { return this.isDown("s") || this.isDown("arrowdown"); }

  jumpPressed() { return this.isPressed(" "); }
  attackLightPressed() { return this.isPressed("j"); }
  attackHeavyPressed() { return this.isPressed("k"); }
  parryPressed() { return this.isPressed("l"); }
}
