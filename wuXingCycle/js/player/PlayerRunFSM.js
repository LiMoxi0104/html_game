// PlayerRunFSM：玩家奔跑动画有限状态机。
//
// 三态：idle → startup（起跑/起步一次性播放）→ running（循环奔跑）
//
// 绘制规则：原始帧面朝左，朝右时 X 缩放 -1 水平翻转。
//
// 使用方式：
//   runFSM.start()            — 从 idle 进入 startup（有起跑帧）或 running（无起跑帧）
//   runFSM.stop()             — 回到 idle
//   runFSM.update(dt)         — 每帧推进
//   runFSM.getCurrentFrame()  — 获取当前应绘制的 Image

class PlayerRunFSM {
  constructor() {
    this.state = "idle";               // idle | startup | running

    this.startupFrames = [];           // 起跑帧序列（播放一次）
    this.runFrames     = [];           // 奔跑帧序列（循环）

    this.frameIndex = 0;
    this.frameTimer = 0;
    this.FRAME_MS   = 1000 / 60;       // ~16.67ms @ 60fps
  }

  // ═══════ 帧注入 ═══════

  setStartupFrames(frames) { this.startupFrames = frames || []; }
  setRunFrames(frames)     { this.runFrames     = frames || []; }

  get hasFrames() {
    return this.startupFrames.length > 0 || this.runFrames.length > 0;
  }
  get isActive() { return this.state !== "idle"; }

  // ═══════ 状态控制 ═══════

  /** 从 idle 启动奔跑：有起跑帧→startup，无→直接 running */
  start() {
    if (this.startupFrames.length > 0) {
      this.state = "startup";
      this.frameIndex = 0;
    } else if (this.runFrames.length > 0) {
      this.state = "running";
      this.frameIndex = 0;
    }
    this.frameTimer = 0;
  }

  /** 停止奔跑回到 idle */
  stop() {
    this.state = "idle";
    this.frameIndex = 0;
    this.frameTimer = 0;
  }

  // ═══════ 逐帧推进 ═══════

  update(dt) {
    if (this.state === "idle") return;
    this.frameTimer += dt;

    if (this.state === "startup") {
      // 起跑：逐帧播放一次，到头自动切 running
      const len = this.startupFrames.length;
      while (this.frameTimer >= this.FRAME_MS && this.frameIndex < len - 1) {
        this.frameTimer -= this.FRAME_MS;
        this.frameIndex++;
      }
      if (this.frameIndex >= len - 1) {
        // 起跑结束 → 无缝进入奔跑循环
        this.state = "running";
        this.frameIndex = 0;
        this.frameTimer = 0;
      }
    } else if (this.state === "running") {
      // 奔跑：无限循环
      const len = this.runFrames.length;
      if (len === 0) return;
      while (this.frameTimer >= this.FRAME_MS) {
        this.frameTimer -= this.FRAME_MS;
        this.frameIndex = (this.frameIndex + 1) % len;
      }
    }
  }

  // ═══════ 帧查询 ═══════

  /** 返回当前应绘制的帧 Image */
  getCurrentFrame() {
    if (this.state === "startup" && this.startupFrames.length > 0) {
      return this.startupFrames[Math.min(this.frameIndex, this.startupFrames.length - 1)];
    }
    if (this.state === "running" && this.runFrames.length > 0) {
      return this.runFrames[this.frameIndex % this.runFrames.length];
    }
    return null;
  }
}
