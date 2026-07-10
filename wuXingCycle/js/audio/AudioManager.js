// AudioManager：全局音频管理（动态创建、首次用户交互后加载、失败容错）。
// 规避浏览器自动播放静音拦截：首次点击/按键后才初始化 AudioContext。
// 无素材时不阻塞，play() 静默失败。
class AudioManager {
  static initOnGesture() {
    if (AudioManager._inited) return;
    const start = () => {
      try {
        AudioManager.ctx = new (window.AudioContext || window.webkitAudioContext)();
        AudioManager._inited = true;
      } catch (e) { /* 不支持 Web Audio 时静默 */ }
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
  }

  // 播放短音效；无音频文件/未初始化时静默跳过
  static play(name) {
    if (!AudioManager._inited || !AudioManager.ctx) return;
    const path = (AUDIO_LIST.sfx && AUDIO_LIST.sfx[name]) || null;
    if (!path) return;
    try {
      const a = new Audio(path);
      a.volume = 0.4;
      a.play().catch(() => {});
    } catch (e) { /* 文件缺失容错 */ }
  }

  static pauseAll() { if (AudioManager.ctx && AudioManager.ctx.suspend) AudioManager.ctx.suspend(); }
  static resumeAll() { if (AudioManager.ctx && AudioManager.ctx.resume) AudioManager.ctx.resume(); }
}
