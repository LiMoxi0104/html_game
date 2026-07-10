---
name: wuxing_cycle_phase1
overview: 依据《五行轮回：烛龙囚笼》开发文档搭建阶段1（底层框架）的完整多文件项目结构：目录骨架、localStorage存档、键盘+触屏输入管理、Canvas分层渲染框架（含视差）、资源预加载框架（PNG/音频容错），以及角色基础移动/跳跃+状态机。无素材时采用程序化占位绘制（矩形/水墨曲线）保证立即可玩，素材路径常量化以便后续替换真实美术。
design:
  architecture:
    framework: html
  styleKeywords:
    - 水墨国风
    - 宣纸淡黄
    - 暗红墨黑
    - 留白克制
    - 半透明弹窗
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 24px
      weight: 600
    subheading:
      size: 16px
      weight: 500
    body:
      size: 14px
      weight: 400
  colorSystem:
    primary:
      - "#8b0000"
      - "#1a1a1a"
    background:
      - "#f5f0e6"
      - "#ffffff"
    text:
      - "#1a1a1a"
      - "#8b0000"
    functional:
      - "#c0392b"
      - "#27ae60"
todos:
  - id: scaffold-dirs
    content: 创建 wuXingCycle 目录骨架与 assets 占位
    status: pending
  - id: config-files
    content: 编写 config 下 gameConst/mapConfig/assetList/skillConfig 四个 JSON
    status: pending
    dependencies:
      - scaffold-dirs
  - id: core-engine
    content: 实现 GameMain/GameData/InputManager/Renderer/Collision/AssetManager
    status: pending
    dependencies:
      - config-files
  - id: player-map
    content: 实现 Player 移动跳跃状态机与 MapLoader 视差场景
    status: pending
    dependencies:
      - core-engine
  - id: ui-audio
    content: 实现 UIManager/StatusBar/DialogBox 与 AudioManager 框架
    status: pending
    dependencies:
      - core-engine
  - id: index-css
    content: 编写 index.html 与 css 四文件并接入模块
    status: pending
    dependencies:
      - player-map
      - ui-audio
  - id: deploy-cloudstudio
    content: 用 [integration:cloudStudio] 部署静态项目
    status: pending
    dependencies:
      - index-css
---

## 用户需求

依据《五行轮回：烛龙囚笼》开发文档，本次仅实现阶段1（底层框架），并采用完整多文件结构（index.html + css/ + js/ + config/）与素材加载框架（无素材时程序化占位绘制，保证立即可玩）。

## 产品概述

搭建一款国风水墨2D横版动作探索RPG的底层引擎框架：可运行游戏启动、Canvas分层渲染、角色自由移动/跳跃与状态机、localStorage存档、键盘+触屏输入管理、资源预加载与容错。后续阶段（战斗、成长、多地图）将在此基础上扩展。

## 核心功能

- 项目目录骨架：index.html、css/、js/(core/player/map/ui/audio/effect/enemy/utils)、config/、assets/ 占位。
- 存档系统：键名 wuXingCycleSave，JSON存localStorage；首次进入初始化1级空白存档；无存储权限弹窗容错；预留真结局清空接口。
- 输入管理：键盘WASD/方向键移动、空格跳跃；移动端虚拟摇杆+虚拟按键DOM框架。
- 渲染框架：Canvas 2D 分层（场景层→角色层→特效层→UI层），固定960x540 CSS等比缩放，后台切页暂停主循环与音频。
- 角色系统：Player类实现上下左右自由移动、跳跃、边界限制与 idle/walk/jump 状态机；程序化占位绘制（深灰矩形+水墨曲线背景）。
- 资源加载框架：config/assetList.json 预加载清单，加载失败跳过并提示，不阻塞启动；音频首次点击后加载。
- UI框架：顶部状态栏（等级/觉醒/HP/MP/经验）、首次操作说明弹窗、DialogBox提示弹窗。
- 预留接口：ParrySystem、EnemyBase、EffectPool、ShockWave、SkillSystem 仅建类骨架，阶段1不实现逻辑。

## 技术栈选择

- 原生 HTML5 + CSS3 + ES6 JavaScript（禁用var，ES6 class封装，面向对象）。
- 渲染：原生 Canvas 2D（文档注明PixiJS为可选，本次用原生满足框架目标）。
- 音频：Web Audio API / HTML Audio 动态创建，首次用户交互后初始化（规避浏览器静音拦截）。
- 存档：localStorage，键名固定 wuXingCycleSave。
- 部署：纯静态，复用现有 server.js（端口5173）本地预览，后续 CloudStudio 部署。

## 实现方案

采用分层模块化架构，将引擎核心（主循环、渲染、输入、存档）与游戏内容（玩家、地图、UI）解耦。所有固定数值（画布尺寸、移动速度、重力、跳跃初速、卡肉时长）外置到 config/gameConst.json，由 GameData 与常量管理器统一读取，杜绝硬编码。资源加载采用"尝试预加载+失败回退程序化绘制"策略：启动时读取 assetList.json，逐张加载图片，失败则标记占位并继续，确保无素材也能运行。主循环以 requestAnimationFrame 驱动，deltaTime 帧率无关；timeScale 与 freezeTimer 在 GameMain 中统一更新，阶段1仅初始化变量，供后续卡肉复用。

关键技术决策：

1. 模块化按文档目录拆分，便于后续新增 enemy/map/技能仅加文件不改核心（符合拓展预留规范）。
2. 资源路径常量集中管理（ASSETS_BASE），后续替换美术无需批量改路径。
3. 状态机用枚举常量+互斥切换，避免动作冲突（为阶段2战斗铺垫）。
4. 渲染分层用独立 Canvas 或单Canvas分层绘制上下文，阶段1用单Canvas按层顺序绘制，降低复杂度且易扩展。

性能与可靠性：主循环按 deltaTime 节流；后台 visibilitychange 暂停循环与音频；资源加载失败容错不阻塞；对象池仅预留，避免提前过度设计。

## 实现说明

- 复用 server.js 静态服务做本地验证；新游戏入口为新建 index.html（不覆盖现有无关卡牌游戏 index.html，避免误删）。
- 所有新增 JS 用 ES6 class，禁止 var；数值取自 config/*.json。
- 程序化绘制：背景贝塞尔曲线水墨山峦（复用 wuxing_mvp 思路），角色深灰矩形，UI 暗红+墨黑。
- 日志用 console（阶段5上线前清理），避免阻塞。

## 架构设计

核心数据流：index.html 加载 css/js → GameMain 启动 → GameData 读档/初始化 → AssetManager 预加载 → InputManager 绑定 → MapLoader 构建场景 → Player 创建 → 主循环(update/render 分层) → StatusBar/DialogBox 渲染。

```mermaid
graph TD
    A[index.html] --> B[GameMain]
    B --> C[GameData 存档]
    B --> D[AssetManager 资源加载]
    B --> E[InputManager 输入]
    B --> F[MapLoader 场景/视差]
    B --> G[Player 移动/状态机]
    B --> H[Renderer 分层渲染]
    B --> I[UIManager/StatusBar/DialogBox]
    B --> J[AudioManager 音频]
    C -. 预留 .-> K[ParrySystem/EnemyBase/EffectPool]
```

## 目录结构

```
wuXingCycle/                       # 新建游戏根目录（不覆盖现有 index.html）
├── index.html                     # [NEW] 入口页：挂载 canvas + DOM UI 层 + 首次操作说明弹窗，相对路径引用 css/js
├── css/
│   ├── reset.css                  # [NEW] 全局样式重置
│   ├── game-ui.css                # [NEW] 状态栏/弹窗/虚拟按键样式（暗红+墨黑国风）
│   ├── animation.css              # [NEW] 屏幕震动/雾气/淡入淡出 @keyframes
│   └── mobile-adapt.css           # [NEW] 虚拟摇杆与按键 flex 自适应布局
├── js/
│   ├── core/
│   │   ├── GameMain.js            # [NEW] 主循环、timeScale/freezeTimer、后台暂停、启动流程编排
│   │   ├── GameData.js            # [NEW] 存档读写/初始化/清空/容错（wuXingCycleSave）
│   │   ├── InputManager.js        # [NEW] 键盘WASD/空格 + 触屏虚拟摇杆/按键事件归一化
│   │   ├── Renderer.js            # [NEW] 分层渲染封装（场景/角色/特效/UI层顺序）
│   │   ├── Collision.js           # [NEW] 矩形/圆形碰撞盒检测工具
│   │   └── AssetManager.js        # [NEW] 读 assetList.json 预加载，失败回退占位
│   ├── player/
│   │   ├── Player.js              # [NEW] 移动/跳跃/边界/状态机 idle-walk-jump，程序化绘制
│   │   └── ParrySystem.js         # [NEW] 弹反类骨架（阶段1预留接口，不实现）
│   ├── map/
│   │   ├── MapLoader.js           # [NEW] 横版卷轴+视差滚动框架（单地图占位）
│   │   └── SceneData.js           # [NEW] 地图配置数据（木幽谷占位）
│   ├── ui/
│   │   ├── UIManager.js           # [NEW] UI 统管：状态栏/弹窗显隐
│   │   ├── StatusBar.js           # [NEW] 顶部状态栏：等级/觉醒/HP/MP/经验
│   │   └── DialogBox.js           # [NEW] 操作说明/解锁提示弹窗
│   ├── audio/
│   │   ├── AudioManager.js        # [NEW] 动态创建音频、首次点击加载、失败容错
│   │   └── AudioList.js           # [NEW] 音效资源配置表
│   ├── effect/
│   │   ├── EffectPool.js          # [NEW] 特效对象池骨架（预留）
│   │   └── ShockWave.js           # [NEW] 卡肉波纹骨架（预留）
│   ├── enemy/
│   │   └── EnemyBase.js           # [NEW] 敌人父类骨架（预留，阶段1不实现AI）
│   └── utils/
│       ├── FrameAnim.js           # [NEW] 序列帧动画管理器（预留）
│       ├── MathTool.js            # [NEW] 向量/距离/蓄力计时工具
│       └── StorageUtil.js         # [NEW] localStorage 读写封装（容错）
├── config/
│   ├── gameConst.json             # [NEW] 画布尺寸/移动速度/重力/跳跃/卡肉常量
│   ├── mapConfig.json             # [NEW] 地图节点配置（木幽谷占位）
│   ├── assetList.json             # [NEW] 预加载资源清单（空/占位，失败容错）
│   └── skillConfig.json           # [NEW] 招式数值占位（初始水行）
└── assets/
    ├── img/.gitkeep               # [NEW] 图片目录占位（后续放PNG）
    └── audio/.gitkeep             # [NEW] 音频目录占位（后续放音频）
```

## 关键代码结构

```javascript
// GameData.js 存档结构（与文档 2.2 对齐）
const DEFAULT_SAVE = {
  cycle: 1, awakening: 0, currentMap: "woodValley",
  level: 1, exp: 0, expNeed: 100, point: 0,
  attr: { strength:1, agility:1, spirit:1, physique:1 },
  hp: 100, maxHp: 100, mp: 50, maxMp: 50,
  unlockSkill: ["water"],
  mapExplore: { woodValley:{unlock:true,box:[false,false]} },
  timeScale: 1, freezeTimer: 0
};
// 存档键固定
const SAVE_KEY = "wuXingCycleSave";
```

## 设计风格

采用国风淡墨水墨风格，宣纸黄底(#f5f0e6)配贝塞尔曲线淡墨山峦背景，玩家为深灰矩形，UI 使用暗红(#8b0000)与墨黑配色。顶部状态栏与弹窗使用半透明水墨边框，首次进入展示操作说明弹窗。整体视觉克制留白，为后续阶段美术替换预留程序化绘制框架。

## 页面布局

- 顶层：Canvas 游戏画面（960x540，CSS 居中等比缩放），下方叠 DOM UI 层。
- 顶部状态栏：左侧等级/觉醒/周目，中部 HP/MP/经验条，右侧已解锁招式图标位（阶段1留空）。
- 首次弹窗：游戏操作说明（WASD移动、空格跳跃），可关闭。
- 移动端：左下虚拟摇杆、右下虚拟按键 DOM 框架（阶段1仅布局，交互接入 InputManager）。

## Agent Extensions

### Integration

- **cloudStudio**
- Purpose: 阶段1框架完成后，将纯静态项目部署到 Cloud Studio 静态托管。
- Expected outcome: 项目成功部署并生成可访问的静态网页地址。