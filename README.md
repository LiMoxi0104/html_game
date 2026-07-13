# 🔥 五行轮回 · 烛龙囚笼

<p align="center">
  <img src="https://img.shields.io/badge/版本-1.0.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/许可证-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/平台-Web-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/状态-开发中-orange.svg" alt="Status" />
</p>

---

**一款基于 HTML5 Canvas 的中国风水墨动作游戏**。以五行相生相克为核心机制，融合格挡、陷阱、敌人 AI 等硬核玩法，打造沉浸式的东方幻想冒险体验。

---

## 📖 目录

- [✨ 功能特性](#-功能特性)
- [🎮 游戏截图](#-游戏截图)
- [🛠 技术栈](#-技术栈)
- [📁 项目结构](#-项目结构)
- [📋 先决条件](#-先决条件)
- [🚀 快速开始](#-快速开始)
- [⚙️ 配置说明](#️-配置说明)
- [🎯 操作说明](#-操作说明)
- [🤝 贡献指南](#-贡献指南)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

### 核心玩法
| 特性 | 描述 |
|------|------|
| **五行技能系统** | 金木水火土五大元素技能，支持相生相克机制与连招组合 |
| **精准格挡 (Parry)** | 高风险高回报的格挡机制，成功触发时间冻结与反击窗口 |
| **陷阱系统** | 尖刺陷阱、毒气陷阱等多种地图机关，需策略性规避 |
| **敌人 AI** | 多样化敌人行为模式，包含巡逻、追击、攻击等状态机 |

### 技术亮点
- ⚡ **零框架依赖** — 纯原生 JavaScript 实现，无任何第三方库依赖
- 🎨 **水墨风格渲染** — 自研 Canvas 渲染管线，呈现独特东方美学
- 💾 **本地存档系统** — 基于 `localStorage` 的自动存档与读档
- 🔊 **音频管理器** — 支持音效/BGM 分层控制、后台切页自动暂停
- ⚙️ **配置外置化** — 游戏数值、地图、技能配置均以 JSON 外置，便于调优
- 🎬 **帧动画系统** — 自定义精灵动画引擎，支持多状态切换
- 🌊 **冲击波特效** —— 对象池管理的粒子效果，兼顾性能与表现力

---

## 🎮 游戏截图

> （待补充实际游戏截图）

---

## 🛠 技术栈

```
前端渲染:  HTML5 Canvas API (原生)
编程语言:  ECMAScript 2021+
构建工具:  无 (静态资源直接加载)
开发服务器: Node.js http 模块 (仅用于本地调试)
```

---

## 📁 项目结构

```
wuXingCycle/
├── index.html              # 入口页面 (960×540 固定画布)
├── server.js               # Node.js 本地开发服务器
├── server.ps1              # PowerShell 备用服务器脚本
│
├── config/                 # 📋 游戏配置 (JSON)
│   ├── gameConst.json      # 全局常量 (物理参数、颜色、尺寸)
│   ├── mapConfig.json      # 地图配置 (出生点、陷阱位置、地形)
│   ├── skillConfig.json    # 技能配置 (五行技能属性与消耗)
│   └── assetList.json      # 资源清单 (图片/音频索引)
│
├── js/
│   ├── core/               # 🔧 核心引擎
│   │   ├── GameMain.js     # 主循环 / 启动编排
│   │   ├── Renderer.js     # Canvas 渲染器
│   │   ├── InputManager.js # 键盘输入管理
│   │   ├── Collision.js    # AABB 碰撞检测
│   │   ├── AssetManager.js # 资源预加载器
│   │   └── GameData.js     # 存档读写层
│   │
│   ├── player/             # 👤 玩家模块
│   │   ├── Player.js       # 玩家实体 (移动/跳跃/状态机)
│   │   ├── SkillSystem.js  # 五行技能管理
│   │   └── ParrySystem.js  # 格挡判定逻辑
│   │
│   ├── enemy/              # 👹 敌人模块
│   │   └── EnemyBase.js    # 敌人基类 (行为树/AI)
│   │
│   ├── map/                # 🗺 地图系统
│   │   ├── MapLoader.js    # 地图解析与生成
│   │   ├── TrapSystem.js   # 陷阱调度器
│   │   └── trap/           # 陷阱实现
│   │       ├── TrapBase.js
│   │       └── PillarTrap.js
│   │
│   ├── effect/             # ✨ 特效系统
│   │   ├── EffectPool.js   # 对象池管理
│   │   └── ShockWave.js    # 冲击波粒子
│   │
│   ├── ui/                 # 🖼 UI 层
│   │   ├── UIManager.js    # UI 总控
│   │   ├── StatusBar.js    # HP/MP/EXP 血条
│   │   └── DialogBox.js    # 弹窗/提示框
│   │
│   ├── audio/              # 🔊 音频模块
│   │   ├── AudioManager.js # 音频播放控制
│   │   └── AudioList.js    # 音效索引表
│   │
│   └── utils/              # 🛠 工具库
│       ├── MathTool.js     # 数学辅助函数
│       ├── StorageUtil.js  # localStorage 封装
│       └── FrameAnim.js    # 帧动画驱动
│
├── css/                    # 样式表
│   ├── reset.css           # CSS Reset
│   ├── game-ui.css         # 游戏 UI 组件
│   └── animation.css       # CSS 动画定义
│
└── assets/                 # 🎨 静态资源 (图片/音频)
```

---

## 📋 先决条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| **Node.js** | >= 14.0 | 仅用于启动本地开发服务器 |
| **现代浏览器** | Chrome 90+ / Firefox 88+ / Edge 90+ / Safari 14+ | 需支持 ES2021 + Canvas 2D API |

### 验证 Node.js 安装

```bash
node --version   # 应输出 v14.x 或更高版本
```

> 💡 **提示**: 如果尚未安装 Node.js，请前往 [nodejs.org](https://nodejs.org) 下载 LTS 版本。安装时请确保勾选 **"Add to PATH"** 选项。

---

## 🚀 快速开始

### 方式一：Node.js 服务器（推荐）

```bash
# 1. 进入项目目录
cd wuXingCycle

# 2. 启动本地服务器
node server.js

# 3. 打开浏览器访问
# http://localhost:5173
```

看到终端输出以下信息即表示启动成功：

```
[wuXingCycle] 本地服务已启动：http://localhost:5173
```

### 方式二：PowerShell 脚本（无需安装 Node）

```powershell
cd wuXingCycle
powershell -ExecutionPolicy Bypass -File .\server.ps1
```

> ⚠️ **注意**: 此方式可能需要管理员权限来绑定端口。

---

## ⚙️ 配置说明

所有游戏数值均已外置至 `config/` 目录下的 JSON 文件，无需修改代码即可调整游戏平衡性。

### 关键配置文件

#### `config/gameConst.json` — 全局常量

```json
{
  "canvas": { "width": 960, "height": 540 },
  "player": {
    "moveSpeed": 3.4,
    "jumpForce": 12,
    "gravity": 0.62
  },
  "timeScale": { "normal": 1, "hitFreeze": 0.1 }
}
```

常用调优项：
- `player.moveSpeed` — 玩家移动速度
- `player.jumpForce` — 跳跃力度
- `player.gravity` — 重力加速度
- `freeze.hitMs` — 受击停顿帧数
- `colors.*` — 渲染配色方案（水墨色值）

#### `config/skillConfig.json` — 五行技能

```json
{
  "skills": {
    "metalSlash": {
      "element": "金",
      "cost": 20,
      "damage": 35,
      "cooldown": 60
    }
  }
}
```

#### `config/mapConfig.json` — 地图数据

定义各关卡的出生点坐标、陷阱分布、边界范围等。

---

## 🎯 操作说明

| 按键 | 功能 |
|------|------|
| **A / ←** | 向左移动 |
| **D / →** | 向右移动 |
| **W / ↑ / Space** | 跳跃 |
| **J / Z** | 普通攻击 |
| **K / X** | 五行技能（按元素切换） |
| **L / C** | 格挡 (Parry) |
| **Esc** | 暂停游戏 |

---

## 🤝 贡献指南

我们欢迎任何形式的贡献！无论是 Bug 修复、新功能提案还是文档改进。

### 开发流程

```bash
# 1. Fork 本仓库

# 2. 克隆你的 Fork
git clone https://github.com/<your-username>/wuXingCycle.git
cd wuXingCycle

# 3. 创建功能分支
git checkout -b feature/your-feature-name

# 4. 启动开发服务器进行调试
node server.js

# 5. 提交你的更改
git commit -m "feat: 添加新功能描述"

# 6. 推送到你的 Fork
git push origin feature/your-feature-name

# 7. 创建 Pull Request
```

### 代码规范

- 使用 **ES6+** 语法特性（class、async/await、箭头函数）
- 遵循现有目录结构与命名约定（驼峰式命名）
- 新增游戏数值必须外置至 `config/*.json`
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范

### Pull Request 要求

- ✅ 代码通过浏览器控制台无报错运行
- ✅ 新增功能有必要的注释说明
- ✅ 不破坏现有游戏流程的完整性
- ✅ 如涉及视觉改动，附上对比截图

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

```
MIT License

Copyright (c) 2026 wuXingCycle Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

<p align="center">
  <sub>Built with ❤️ using pure HTML5 Canvas & vanilla JavaScript</sub>
</p>
