// AudioList：音效资源配置表。AudioManager 按 key 读取对应路径文件。
const AUDIO_LIST = {
  bgm: {
    wuxingVillage: "assets/audio/bgm/wood_valley.mp3"
  },
  sfx: {
    jump:        "assets/audio/hit_sound/jump.mp3",
    hit:         "assets/audio/hit_sound/hit.mp3",
    skill_water: "assets/audio/skill_sound/water.mp3",
    skill_wood:  "assets/audio/skill_sound/wood.mp3",

    // 弹反音效
    parry:         "assets/audio/parry_sound/parry.mp3",          // L 键触发：匕首格挡音
    parry_success: "assets/audio/parry_sound/parry_success.mp3"   // 弹反成功判定瞬间
  }
};
