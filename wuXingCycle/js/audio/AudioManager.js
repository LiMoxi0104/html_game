// AudioManager：全局音频管理。
// - 首次用户交互（点击/按键）后才初始化 AudioContext，规避浏览器自动播放拦截
// - play() 在音频文件缺失或未初始化时静默失败，不阻塞游戏
class AudioManager {

  // ---------- 初始化 ----------

  static initOnGesture() {
    if (AudioManager._inited) return;
    const start = () => {
      try {
        AudioManager.ctx = new (window.AudioContext || window.webkitAudioContext)();
        AudioManager._inited = true;
      } catch (e) {
        // 不支持 Web Audio 时静默
      }
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
  }

  // ---------- 播放 ----------

  static play(name) {
    if (!AudioManager._inited || !AudioManager.ctx) return;

    const path = (AUDIO_LIST.sfx && AUDIO_LIST.sfx[name]) || null;
    if (!path) return;

    try {
      const a = new Audio(path);
      a.volume = 0.4;
      a.play().catch(() => {});
    } catch (e) {
      // 音频文件缺失容错，静默跳过
    }
  }

  // ---------- 全局控制 ----------

  static pauseAll() {
    if (AudioManager.ctx && AudioManager.ctx.suspend) {
      AudioManager.ctx.suspend();
    }
  }

  static resumeAll() {
    if (AudioManager.ctx && AudioManager.ctx.resume) {
      AudioManager.ctx.resume();
    }
  }
}
