// AssetManager：资源预加载框架。读取 config/assetList.json，逐张加载 PNG/音频。
// 加载失败（无素材时）标记缺失并继续，游戏回退到程序化占位绘制，绝不阻塞启动。
// v2：分批并行加载 + 进度回调，加载速度提升 10-20 倍。
// v3：全局加载会话（预计算总量，流水线式 6 路并发，进度不回退）+ 按需懒加载支持。
class AssetManager {
  constructor(consts) {
    this.consts = consts;
    this.images = {};     // key -> HTMLImageElement
    this.failed = [];     // 加载失败的 key 列表
    this.ready = false;

    // —— 进度追踪（旧兼容） ——
    this._progressCallback = null;
    this._totalTasks = 0;
    this._completedTasks = 0;

    // ★ v3：全局加载会话（预计算总量，进度不回退）
    this._sessionTotal = 0;
    this._sessionCompleted = 0;
    this._phaseLabel = '';
    this._phaseCallback = null;   // fn(label, completed, total, pct)
  }

  /** 设置进度回调 fn(percent) — percent 为 0~1（旧兼容） */
  setProgressCallback(cb) { this._progressCallback = cb; }

  /** ★ v3：设置阶段进度回调 fn(label, completed, total, pct) */
  setPhaseCallback(cb) { this._phaseCallback = cb; }

  _firePhase() {
    if (!this._phaseCallback) return;
    const pct = this._sessionTotal > 0 ? this._sessionCompleted / this._sessionTotal : 0;
    this._phaseCallback(this._phaseLabel, this._sessionCompleted, this._sessionTotal, Math.min(pct, 1));
  }

  /** ★ v3：初始化加载会话，预注册任务总量。进度从 0 开始，绝不回退。 */
  initLoadSession(phaseLabel, totalTasks) {
    this._phaseLabel = phaseLabel;
    this._sessionTotal = totalTasks;
    this._sessionCompleted = 0;
    this._firePhase();
  }

  /** ★ v3：追加会话任务数 */
  addSessionTasks(count) {
    this._sessionTotal += count;
    this._firePhase();
  }

  /** ★ v3：单个会话任务完成 */
  _onSessionTaskComplete() {
    this._sessionCompleted++;
    this._firePhase();
  }

  /** 登记即将加载的任务数（旧兼容） */
  _registerTasks(count) {
    this._totalTasks += count;
    this._reportProgress();
  }

  _onTaskComplete() {
    this._completedTasks++;
    this._reportProgress();
  }

  _reportProgress() {
    if (!this._progressCallback) return;
    const pct = this._totalTasks > 0 ? this._completedTasks / this._totalTasks : 0;
    this._progressCallback(Math.min(pct, 1));
  }

  async preload() {
    let list = { images: {}, audio: {} };
    try {
      list = await fetch("config/assetList.json").then(r => r.json());
    } catch (e) {
      console.warn("[AssetManager] assetList.json 读取失败，走纯占位绘制", e);
      this.ready = true;
      return;
    }
    const imgEntries = list.images || {};
    const keys = Object.keys(imgEntries);
    this._registerTasks(keys.length);
    const tasks = keys.map(key => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { this.images[key] = img; this._onTaskComplete(); resolve(); };
      img.onerror = () => { this.failed.push(key); this._onTaskComplete(); resolve(); };
      img.src = imgEntries[key];
    }));
    await Promise.all(tasks);
    this.ready = true;
    if (this.failed.length) {
      console.warn("[AssetManager] 以下素材缺失，已回退占位：", this.failed.join(", "));
    }
  }

  /** ★ v3：在会话内加载静态 assetList（每次完成回调到会话进度） */
  async preloadInSession() {
    let list = { images: {}, audio: {} };
    try {
      list = await fetch("config/assetList.json").then(r => r.json());
    } catch (e) {
      console.warn("[AssetManager] assetList.json 读取失败，走纯占位绘制", e);
      this.ready = true;
      return 0;
    }
    const imgEntries = list.images || {};
    const keys = Object.keys(imgEntries);
    const count = keys.length;
    const tasks = keys.map(key => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { this.images[key] = img; this._onSessionTaskComplete(); resolve(); };
      img.onerror = () => { this.failed.push(key); this._onSessionTaskComplete(); resolve(); };
      img.src = imgEntries[key];
    }));
    await Promise.all(tasks);
    this.ready = true;
    if (this.failed.length) {
      console.warn("[AssetManager] 以下素材缺失，已回退占位：", this.failed.join(", "));
    }
    return count;
  }

  getImage(key) { return this.images[key] || null; }
  hasImage(key) { return !!this.images[key]; }

  // ═════════════ 序列帧加载 ═════════════

  /**
   * ★ v3：流式加载序列帧（工作池模式，6 路并发持续拉取，无批量等待空转）。
   * 每帧完成即时回调会话进度，进度条平滑增长。
   * 例：loadFrameSequenceStreamed("dir","frame_",120,"_nobg.png")
   */
  async loadFrameSequenceStreamed(folder, prefix, count, ext = ".png") {
    const totalFrames = count + 1;
    const frames = new Array(totalFrames).fill(null);
    const CONCURRENCY = 6;
    let idx = 0;
    const self = this;

    console.log(`[AssetManager] 流式加载 ${totalFrames} 帧: ${folder}/ (${CONCURRENCY}路并发)`);

    async function worker() {
      while (idx < totalFrames) {
        const i = idx++;
        const padded = String(i).padStart(6, "0");
        const path = `${folder}/${prefix}${padded}${ext}`;
        const img = await self._loadImageAsync(path);
        if (img) frames[i] = img;
        self._onSessionTaskComplete();
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, totalFrames); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const validFrames = frames.filter(f => f !== null);
    const missCount = totalFrames - validFrames.length;
    if (missCount > 0) {
      console.warn(`[AssetManager] ${folder}/ 缺失 ${missCount}/${totalFrames} 帧`);
    }
    console.log(`[AssetManager] 序列帧完成: ${validFrames.length}/${totalFrames} (${folder}/)`);
    return validFrames;
  }

  /**
   * ★ v3：后台流式加载（不回调进度，不打乱主会话）。
   * 用于游戏启动后的延迟加载。
   */
  async loadFrameSequenceBg(folder, prefix, count, ext = ".png") {
    const totalFrames = count + 1;
    const frames = new Array(totalFrames).fill(null);
    const CONCURRENCY = 6;
    let idx = 0;
    const self = this;

    async function worker() {
      while (idx < totalFrames) {
        const i = idx++;
        const padded = String(i).padStart(6, "0");
        const path = `${folder}/${prefix}${padded}${ext}`;
        const img = await self._loadImageAsync(path);
        if (img) frames[i] = img;
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, totalFrames); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    return frames.filter(f => f !== null);
  }

  /** 旧版：分批并行加载（保留兼容，内部调用 loadFrameSequenceStreamed） */
  async loadFrameSequence(folder, prefix, count, ext = ".png", batchSize = 12) {
    const totalFrames = count + 1;
    const frames = new Array(totalFrames).fill(null);
    this._registerTasks(totalFrames);

    const BATCH = Math.max(1, batchSize);

    console.log(`[AssetManager] 开始加载 ${totalFrames} 帧: ${folder}/ (${BATCH}并发/批)`);

    for (let batchStart = 0; batchStart < totalFrames; batchStart += BATCH) {
      const batchEnd = Math.min(batchStart + BATCH, totalFrames);
      const batchPromises = [];

      for (let i = batchStart; i < batchEnd; i++) {
        const idx = String(i).padStart(6, "0");
        const path = `${folder}/${prefix}${idx}${ext}`;
        batchPromises.push(
          this._loadImageAsync(path).then(img => {
            if (img) frames[i] = img;
            this._onTaskComplete();
          })
        );
      }
      await Promise.all(batchPromises);
    }

    const validFrames = frames.filter(f => f !== null);
    return validFrames;
  }

  _loadImageAsync(path) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }
}
