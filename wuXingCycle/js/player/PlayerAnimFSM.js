// PlayerAnimFSM：玩家角色动画有限状态机。
// 严格管理 Idle / MoveLeft / MoveRight 三个状态，deltaTime 驱动帧动画。
//
//   Idle       — 无输入，显示 frames[0]
//   MoveLeft   — A 键，原始朝向（无翻转），帧1→N 播放一遍
//   MoveRight  — D 键，水平翻转，帧1→N 播放一遍
//
// 切换规则：
//   - 按下 A/D → Idle→Move，帧从1开始，播完停在末帧
//   - 松开按键 → 立即切回 Idle，帧重置为0
//   - A+D 同时 → 继承上一帧方向（防抖）
//   - A→D / D→A → 方向立即切换，动画从头播放
//
// 固定 60fps，FRAME_MS=1000/60≈16.67ms，deltaTime 累加推进。

class PlayerAnimFSM {
  constructor() {
    this.state = "idle";            // idle | moveLeft | moveRight
    this.frames = [];               // HTMLImageElement[]，[0]=待机 [1..N]=移动
    this.frameIndex = 0;
    this.frameTimer = 0;
    this.FRAME_MS = 1000 / 60;      // 16.67ms
    this.animDone = false;
  }

  setFrames(frames) { this.frames = frames; }

  update(dt, input) {
    const left  = input.moveLeft  ? input.moveLeft()  : false;
    const right = input.moveRight ? input.moveRight() : false;

    let newState = "idle";
    if (left && !right)       newState = "moveLeft";
    else if (right && !left)  newState = "moveRight";
    else if (left && right) {
      if (this.state === "moveLeft")          newState = "moveLeft";
      else if (this.state === "moveRight")    newState = "moveRight";
    }

    if (newState !== this.state) {
      const prev = this.state;
      this.state = newState;
      if (newState === "idle") {
        this.frameIndex = 0;
        this.frameTimer = 0;
        this.animDone   = false;
      } else if (prev === "idle" || prev !== newState) {
        this.frameIndex = 1;
        this.frameTimer = 0;
        this.animDone   = false;
      }
    }

    if (this.state !== "idle" && !this.animDone && this.frames.length > 1) {
      this.frameTimer += dt;
      while (this.frameTimer >= this.FRAME_MS) {
        this.frameTimer -= this.FRAME_MS;
        this.frameIndex++;
        if (this.frameIndex >= this.frames.length) {
          this.frameIndex = this.frames.length - 1;
          this.animDone = true;
          break;
        }
      }
    }
  }

  draw(ctx, x, y, w, h) {
    const frame = this._currentFrame();
    if (!frame) return;
    const needFlip = this.state === "moveRight";  // 原图朝左，右移时翻转
    if (needFlip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, w, h);
    } else {
      ctx.drawImage(frame, x, y, w, h);
    }
  }

  _currentFrame() {
    if (this.frames.length === 0) return null;
    if (this.frameIndex >= this.frames.length) this.frameIndex = this.frames.length - 1;
    return this.frames[this.frameIndex];
  }

  getFacing() {
    if (this.state === "moveLeft")  return "left";
    if (this.state === "moveRight") return "right";
    return null;
  }

  get hasFrames() { return this.frames.length > 0; }
}
