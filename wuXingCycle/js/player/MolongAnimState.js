// MolongAnimState：蓄力火行·墨龙冲 三段式精灵图动画状态机
//
// 三阶段严格划分：
//   CHARGE → 0.5s 正向播放 xuli/ 全部帧，仅一次
//   DASH   → 循环播放 weiyi/ 帧，直至位移结束
//   END    → 0.5s 倒序播放 xuli/ 全部帧，仅一次 → DONE
//
// 帧率精确计算：
//   xuli 43帧 / 500ms → 间隔 ≈ 11.628ms/帧 (≈86fps)
//   weiyi 8帧        → 间隔 64ms/帧 (≈15.6fps) 柔和循环
//
// ★ 蓄力缩放：角色模型随蓄力时间线性增长 1x→4x，
//   释放后平滑还原至 1x。

class MolongAnimState {
  static CHARGE_MS = 500;
  static END_MS    = 500;
  static DASH_INTERVAL = 64;

  static IDLE   = 'IDLE';
  static CHARGE = 'CHARGE';
  static DASH   = 'DASH';
  static END    = 'END';
  static DONE   = 'DONE';

  static SCALE_MIN = 1;
  static SCALE_MAX = 4;
  static SCALE_LERP_BASE = 0.08;  // 缩放还原速率（60fps 基准）

  constructor(assetManager) {
    this.asset = assetManager;
    this._xuliFwd = [];
    this._xuliRev = [];
    this._weiyi = [];
    this._chargeInterval = 0;
    this._endInterval = 0;
    this._loaded = false;

    this._state = MolongAnimState.IDLE;
    this._timer = 0;
    this._frameIdx = 0;
    this._currentFrame = null;
    this._onDone = null;

    // ★ 蓄力缩放系统
    this._displayScale = 1;          // 当前绘制缩放倍率
  }

  async load() {
    this._xuliFwd = await this.asset.loadFrameSequence(
      'assets/img/player/molong/xuli', 'frame_', 48, '_nobg.png');
    this._xuliRev = [...this._xuliFwd].reverse();
    this._weiyi = await this.asset.loadFrameSequence(
      'assets/img/player/molong/weiyi', 'frame_', 48, '_nobg.png');

    const n = this._xuliFwd.length;
    this._chargeInterval = MolongAnimState.CHARGE_MS / n;
    this._endInterval    = MolongAnimState.END_MS / n;
    this._loaded = true;
    console.log(`[MolongAnim] 加载完成 xuli=${n} weiyi=${this._weiyi.length} ` +
      `chargeInt=${this._chargeInterval.toFixed(2)}ms endInt=${this._endInterval.toFixed(2)}ms`);
    return this;
  }

  get isLoaded()     { return this._loaded; }
  get isActive()     { return this._state !== MolongAnimState.IDLE && this._state !== MolongAnimState.DONE; }
  get state()        { return this._state; }
  get currentFrame() { return this._currentFrame; }
  get isDone()       { return this._state === MolongAnimState.DONE; }
  get displayScale() { return this._displayScale; }
  set onDone(fn)     { this._onDone = fn; }

  /**
   * ★ 设置蓄力缩放：ratio 0→1 线性映射到 scale 1→4。
   *    由 SkillManager.updateCharge() 每帧调用。
   */
  setChargeProgress(ratio) {
    const clamped = Math.min(1, Math.max(0, ratio));
    this._displayScale = MolongAnimState.SCALE_MIN
                       + clamped * (MolongAnimState.SCALE_MAX - MolongAnimState.SCALE_MIN);
  }

  /** CHARGE: 正向 xuli 0.5s 一次 + 缩放初始化 */
  startCharge() {
    if (!this._loaded) return false;
    this._state = MolongAnimState.CHARGE;
    this._timer = 0;
    this._frameIdx = 0;
    this._currentFrame = this._xuliFwd[0] || null;
    this._displayScale = MolongAnimState.SCALE_MIN;  // ★ 初始 1x
    console.log('[MolongAnim] → CHARGE 蓄力阶段 scale=1x');
    return true;
  }

  /** DASH: 循环 weiyi */
  startDash() {
    if (!this._loaded) return false;
    this._state = MolongAnimState.DASH;
    this._timer = 0;
    // 如果 CHARGE 播放了部分帧，DASH 从当前 weiyi 帧位开始（保持视觉连续性）
    // 否则从 weiyi[0] 开始
    this._frameIdx = 0;
    this._currentFrame = this._weiyi[0] || this._xuliFwd[this._xuliFwd.length - 1] || null;
    console.log('[MolongAnim] → DASH 位移阶段');
    return true;
  }

  /** END: 倒序 xuli 0.5s 一次 */
  endDash() {
    if (this._state !== MolongAnimState.DASH) return;
    this._state = MolongAnimState.END;
    this._timer = 0;
    this._frameIdx = 0;
    this._currentFrame = this._xuliRev[0] || null;
    console.log('[MolongAnim] → END 收尾阶段');
  }

  /** 强制重置 */
  reset() {
    this._state = MolongAnimState.IDLE;
    this._timer = 0;
    this._frameIdx = 0;
    this._currentFrame = null;
    this._displayScale = 1;
    this._onDone = null;
  }

  /** 每帧驱动 (dt: ms) */
  update(dt) {
    if (!this._loaded || !this.isActive) return;

    // ★ 缩放平滑还原：仅在收尾阶段逐帧 lerp 回 1x（冲刺期间保持放大）
    const SPEED_BASE = MolongAnimState.SCALE_LERP_BASE;
    if (this._state === MolongAnimState.END && this._displayScale > 1.001) {
      // dt 归一化至 60fps 基准 (16.667ms)
      const factor = SPEED_BASE * (dt / 16.667);
      this._displayScale += (1 - this._displayScale) * factor;
      if (Math.abs(this._displayScale - 1) < 0.002) this._displayScale = 1;
    }

    switch (this._state) {
      case MolongAnimState.CHARGE: {
        this._timer += dt;
        const idx = Math.min(
          Math.floor(this._timer / this._chargeInterval),
          this._xuliFwd.length - 1
        );
        // ★ 仅播放一次：timer 超 500ms 后定格末帧
        this._currentFrame = this._xuliFwd[idx] || null;
        // 不自动切换状态——由外部 releaseCharge 触发进入 DASH
        break;
      }
      case MolongAnimState.DASH: {
        this._timer += dt;
        // ★ 循环播放 weiyi
        const loopIdx = Math.floor(this._timer / MolongAnimState.DASH_INTERVAL)
                        % this._weiyi.length;
        this._currentFrame = this._weiyi[loopIdx] || null;
        // 不自动切换——由外部（位移结束）触发 endDash
        break;
      }
      case MolongAnimState.END: {
        this._timer += dt;
        const idx = Math.min(
          Math.floor(this._timer / this._endInterval),
          this._xuliRev.length - 1
        );
        this._currentFrame = this._xuliRev[idx] || null;
        if (this._timer >= MolongAnimState.END_MS) {
          this._state = MolongAnimState.DONE;
          this._currentFrame = null;
          this._displayScale = 1;  // ★ 确保收尾后复位
          console.log('[MolongAnim] → DONE 完成 scale=1x');
          if (typeof this._onDone === 'function') this._onDone();
        }
        break;
      }
    }
  }
}

window.MolongAnimState = MolongAnimState;
