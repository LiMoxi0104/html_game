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
}
