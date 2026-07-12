// AssetManager：资源预加载框架。读取 config/assetList.json，逐张加载 PNG/音频。
// 加载失败（无素材时）标记缺失并继续，游戏回退到程序化占位绘制，绝不阻塞启动。
class AssetManager {
  constructor(consts) {
    this.consts = consts;
    this.images = {};     // key -> HTMLImageElement
    this.failed = [];     // 加载失败的 key 列表
    this.ready = false;
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
    const tasks = Object.keys(imgEntries).map(key => new Promise(resolve => {
      const img = new Image();
      img.onload = () => { this.images[key] = img; resolve(); };
      img.onerror = () => { this.failed.push(key); resolve(); };
      img.src = imgEntries[key];
    }));
    await Promise.all(tasks);
    this.ready = true;
    if (this.failed.length) {
      console.warn("[AssetManager] 以下素材缺失，已回退占位：", this.failed.join(", "));
    }
  }

  getImage(key) { return this.images[key] || null; }
  hasImage(key) { return !!this.images[key]; }

  // ═════════════ 序列帧加载 ═════════════

  /** 按文件名顺序加载编号序列帧，返回 HTMLImageElement[]。
   *  例：loadFrameSequence("dir","frame_",120,"_nobg.png") → dir/frame_000000_nobg.png .. frame_000120_nobg.png */
  async loadFrameSequence(folder, prefix, count, ext = ".png") {
    const frames = [];
    for (let i = 0; i <= count; i++) {
      const idx = String(i).padStart(6, "0");
      const path = `${folder}/${prefix}${idx}${ext}`;
      const img = await this._loadImageAsync(path);
      if (img) frames.push(img);
      else console.warn(`[AssetManager] 帧缺失: ${path}`);
    }
    console.log(`[AssetManager] 序列帧加载完成: ${frames.length}/${count + 1}`);
    return frames;
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
