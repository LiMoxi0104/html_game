# 🔥 五行轮回 · 烛龙囚笼

<p align="center">
  <img src="https://img.shields.io/badge/版本-1.0.0-blue.svg" alt="Version" />
  <img src="https://img.shields.io/badge/许可证-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/平台-Web-lightgrey.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/状态-开发中-orange.svg" alt="Status" />
</p>

---

**一款基于 HTML5 Canvas 的淡墨水墨武侠动作游戏**。

> **五行决定众生轮回，烛龙掌控天地时间。**
> 被封印的烛龙千年利用时空缝隙低语引导世人，操纵命运；
> 你是五行村唯一完整五行使者，被卷入「现在的自己」与「未来的自己」的宿命对抗，
> 最终识破一切引导都是骗局，推翻幕后主宰——烛龙。

以五行相生相克为核心战斗机制，融合精准弹反、闪避残影、环境陷阱、多样化敌人AI等硬核玩法，讲述一个关于"打破命运操控、对抗幕后天命"的东方幻想故事。

> 📖 **完整世界观与剧情框架**：参见 [`wuXingCycle/docs/worldLore.md`](wuXingCycle/docs/worldLore.md)

---

## 📖 目录

- [🌍 故事背景](#-故事背景)
- [✨ 功能特性](#-功能特性)
- [🎮 游戏截图](#-游戏截图)
- [🛠 技术栈](#-技术栈)
- [📁 项目结构](#-项目结构)
- [📋 先决条件](#-先决条件)
- [🚀 快速开始](#-快速开始)
- [⚙️ 配置说明](#-配置说明)
- [🎯 操作说明](#-操作说明)
- [🗺 游戏世界](#-游戏世界)
- [🤝 贡献指南](#-贡献指南)
- [📄 许可证](#-许可证)

---

## 🌍 故事背景

### 世界观

在世间极东存在**五行村**，此地为天地五行灵脉原点。上古先民以金木水火土五根灵柱建立**五行镇龙大阵**，封印执掌时间、昼夜、时序的上古神兽——**烛龙**。

世界法则只有两条：

| 法则 | 领域 | 表现 |
|---|---|---|
| **五行** | 轮回、平衡、万物命运 | 金木水火土相生相克，决定众生生死轮转 |
| **烛龙** | 时间、流动、世事变迁 | 掌控昼夜时序，一切变化皆在其呼吸之间 |

五行村村民世代只能掌握单一五行力量，顺从宿命轮回。唯独主角是**千年唯一拥有完整五行体质的五行使者**——天生不受单一命运束缚。

### 主线梗概

烛龙被封印千年，无法亲自破阵，但它拥有**跨时间低语**的能力——化作温柔旁白、天道指引，影响每一代五行使者。

数十年后终末世界中的未来主角，被烛龙诱骗穿越回现在，击晕年少的你并将其丢入地底时序暗道。你从深渊苏醒，全程被"温柔旁白"引导修复灵脉，与未来的自己多次对立。当你即将修复所有灵柱时——

**旁白变声，真相揭晓**：所有引导、对立、灾难，全是烛龙的剧本。它利用你们的互相残杀为灵柱充能，借机解除千年封印。真正的最终BOSS，是那个一直陪伴、引导、欺骗你的"天道之声"。

### 核心哲学

| # | 命题 |
|---|---|
| 1 | 你以为的天命指引，其实是牢笼操控 |
| 2 | 你对抗的从来不是别人，是被安排好的命运 |
| 3 | 五行让人顺从轮回，时间让人看见真相 |
| 4 | 打破一切虚假引导，才是真正的五行超脱 |

---

## ✨ 功能特性

### 核心玩法

| 特性 | 描述 |
|------|------|
| **五行技能系统** | 金木水火土五大元素技能，轻技（灵活连击/控制）与重技（高爆发/大范围），支持技能池+槽位+熟练度成长 |
| **精准弹反 (Parry)** | 200ms判定窗口，成功触发时间冻结与反击窗口，高风险高回报 |
| **闪避残影** | Shift闪避瞬间向后瞬移140px，带水墨残影拖尾，支持完美闪避检测 |
| **陷阱系统** | 跨7种环境陷阱（尖刺、藤蔓、冰闸、熔岩、龙首喷火、火墙、滚石），需策略性规避 |
| **多样化敌人AI** | 5种敌人各具专属行为（追踪冲撞/固定范围/悬浮远程/自爆复活/飞扑弱点），手感差异化 |

### 美术风格

| 维度 | 设定 |
|------|------|
| **整体风格** | 淡墨水墨武侠——枯笔飞白、湿墨晕染、白描勾线 |
| **主色调** | 墨黑、灰白、赭石、藤黄、花青、朱砂——六色定乾坤 |
| **质感** | 宣纸纹理底衬、水墨渗化过渡、笔锋留痕 |

### 技术亮点

- ⚡ **零框架依赖** — 纯原生 JavaScript 实现，无任何第三方库依赖
- 🎨 **水墨风格渲染** — 自研 Canvas 渲染管线，呈现独特东方美学
- 💾 **本地存档系统** — 基于 `localStorage` 的多槽位存档（3槽位+元数据分离）
- 🔊 **音频管理器** — 支持音效/BGM分层控制、后台切页自动暂停
- ⚙️ **配置外置化** — 游戏数值、地图、技能、资源索引均以 JSON 外置，便于调优
- 🎬 **帧动画系统** — 自定义精灵动画引擎，支持多状态序列帧切换
- 🌊 **冲击波特效** — 对象池管理的粒子效果，兼顾性能与表现力
- 🗺 **工厂模式地图** — 地图/敌人/陷阱/传送门均通过配置JSON驱动生成

---

## 🌐 在线体验

> **游戏已部署至腾讯云 CloudBase 静态托管，可直接在线游玩：**

🔗 **访问地址：** [https://wuxingcycle-d7gixaok7fb443d71-1454337843.tcloudbaseapp.com/?v=20260715](https://wuxingcycle-d7gixaok7fb443d71-1454337843.tcloudbaseapp.com/?v=20260715)

> **最近更新 (2026-07-15)：**
> - ⚡ 序列帧加载改为分批并行（12并发/批），加载速度提升 10-20 倍
> - 📊 新增 Loading 进度条界面，实时显示加载进度
> - 🔄 17 组串行帧加载合并为 4 大并行组

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
├── index.html              # 入口页面 (960×540 固定逻辑分辨率)
├── server.js               # Node.js 本地开发服务器
├── server.ps1              # PowerShell 备用服务器脚本
│
├── config/                 # 📋 游戏配置 (JSON)
│   ├── gameConst.json      # 全局常量 (物理参数、颜色、时间缩放)
│   ├── mapConfig.json      # 地图配置 (6张地图：出生点、敌人、陷阱、平台、传送门)
│   ├── skillConfig.json    # 技能配置 (9个技能 + 7个槽位定义 + 三段式动画/碰撞箱)
│   └── assetList.json      # 资源清单 (精灵图/背景/平台贴图/音频索引)
│
├── docs/                   # 📖 设计文档
│   └── worldLore.md        # 完整世界观与剧情框架 (怪物/NPC/地图/主线/支线)
│
├── js/
│   ├── core/               # 🔧 核心引擎 (9个文件)
│   │   ├── GameMain.js     # 主循环 (60fps固定步长) / 场景管理 / 转场系统 / 传送门
│   │   ├── Renderer.js     # Canvas DPR 渲染器
│   │   ├── InputManager.js # WASD/JKL/Shift 组合键管理
│   │   ├── Collision.js    # AABB + CircleRect 碰撞检测
│   │   ├── CollisionManager.js # 碰撞管理器
│   │   ├── AssetManager.js # 资源预加载 / 序列帧加载
│   │   ├── GameData.js     # 存档读写 (localStorage + v1→v2自动迁移)
│   │   ├── SaveManager.js  # 多存档槽位管理 (3槽位)
│   │   └── Entity.js       # 实体碰撞基类
│   │
│   ├── player/             # 👤 玩家模块 (5个文件)
│   │   ├── Player.js       # 完整状态机 (idle/walk/jump/attack/hurt/dodge/parry/dead)
│   │   ├── SkillSystem.js  # 技能管理器 (技能池+槽位+熟练度+蓄力+三段式动画)
│   │   ├── ParrySystem.js  # 弹反系统 (200ms判定/时停/击退反伤/火花粒子)
│   │   ├── MolongAnimState.js  # 墨龙形态专属动画状态
│   │   └── JianrenAnimState.js # 剑人形态专属动画状态
│   │
│   ├── enemy/              # 👹 敌人模块 (6个文件)
│   │   ├── EnemyBase.js    # 敌人父类 (HP/受击/死亡/禁锢/血条)
│   │   ├── EnemyIronSoldier.js   # 金·玄铁卒 (重甲追踪/弱点击伤)
│   │   ├── EnemyThornSeed.js     # 木·棘藤种 (固定位置/碰撞触发)
│   │   ├── EnemyTideSpirit.js    # 水·凝汐灵 (悬浮游走/远程水流弹)
│   │   ├── EnemyEmberSpirit.js   # 火·烬火游灵 (自爆/尸体/复活循环)
│   │   └── EnemyRockArmor.js     # 土·岩甲蛰 (巡逻/抛物线飞扑/腹部弱点)
│   │
│   ├── map/                # 🗺 地图系统 (10个文件)
│   │   ├── MapLoader.js    # 地图解析 + 平台碰撞 + 传送门 + 建筑渲染
│   │   ├── TrapSystem.js   # 陷阱调度器 (工厂创建 + 碰撞检测 + 完美闪避判定)
│   │   └── trap/           # 7种陷阱实现
│   │       ├── TrapBase.js       # 陷阱父类 (伤害/击退/减速/致盲/弹反)
│   │       ├── BoulderTrap.js    # 滚石 (水平往复)
│   │       ├── DragonTrap.js     # 龙首喷火 (4帧,帧3有伤害)
│   │       ├── FireWallTrap.js   # 火墙 (横向移动)
│   │       ├── IceGateTrap.js    # 冰闸 (3帧ping-pong)
│   │       ├── LavaTrap.js       # 熔岩 (3帧ping-pong)
│   │       ├── ThornTrap.js      # 荆棘尖刺 (4帧循环)
│   │       └── ThornVineTrap.js  # 荆棘藤蔓 (3帧伸缩)
│   │
│   ├── effect/             # ✨ 特效系统
│   ├── ui/                 # 🖼 UI 层 (4个文件)
│   │   ├── UIManager.js    # UI 总控 (坐标转换/事件分发/浮动文字)
│   │   ├── StatusBar.js    # HP/MP/EXP 血条 + 等级/觉醒/周目
│   │   ├── SkillPanel.js   # 技能管理面板 (元素筛选/槽位装配/熟练度墨条)
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
└── assets/                 # 🎨 静态资源 (1210+ 图片 + 2 音频)
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
- `timeScale.*` — 时间缩放参数（可配合烛龙BOSS战的时间操纵机制）

#### `config/skillConfig.json` — 五行技能

```json
{
  "skills": {
    "metal_sword": { "element": "金", "cost": 20, "damage": 35, "cooldown": 60 }
  }
}
```

#### `config/mapConfig.json` — 地图数据

定义6张地图的出生点坐标、敌人分布、陷阱编排、平台布局、传送门网络与建筑渲染。

---

## 🎯 操作说明

| 按键 | 功能 |
|------|------|
| **A / ←** | 向左移动 |
| **D / →** | 向右移动 |
| **W / ↑ / Space** | 跳跃（支持二段跳 + 矮跳） |
| **Shift** | 闪避（向后瞬移，带残影） |
| **J / Z** | 普通攻击 |
| **K / X** | 五行技能（按装备技能释放） |
| **L / C** | 弹反 (Parry) |
| **Esc** | 暂停游戏 |

---

## 🗺 游戏世界

### 6张地图 · 五行轮回

| 地图 | 名称 | 风格描述 | 敌人 | 陷阱 |
|---|---|---|---|---|
| 五行村 | 初始之地 | 残破隐世村落，五灵柱环绕时序渊井。时空裂隙撕裂天幕 | — | — |
| 金之域 | 钢铁要塞 | 废弃钢铁堡垒，齿轮嵌山壁、铁索吊深渊。金属粉尘悬浮 | 玄铁卒 ×3 | — |
| 木之域 | 苍翠密林 | 扭曲远古森林，藤蔓垂瀑、孢子飘浮。巨树根须虬结盘绕 | 棘藤种 ×4 | 荆棘尖刺 + 藤蔓 |
| 水之域 | 冰晶深湖 | 永夜地底冰湖，水在半空凝固。暗流低吟、冰晶折射冷光 | 凝汐灵 ×3 | 冰闸 |
| 火之域 | 熔岩深渊 | 地心熔岩炼狱，龙首雕像喷火。热浪扭曲、硫磺弥漫 | 烬火游灵 ×3 | 熔岩 + 火龙 + 火墙 |
| 土之域 | 荒芜峡谷 | 赭色岩壁刻万年时序，悬浮岩岛如时间冻结。滚石如钟摆 | 岩甲蛰 ×3 | 滚石 |

### 五行循环路线

```
五行村 → 金之域 → 木之域 → 水之域 → 火之域 → 土之域 → 五行村(终局)
```

每激活一个领域的灵柱，即可开启通往下一领域的传送门。五灵柱全部激活后，真相在五行村中心揭晓。

### 五行技能一览

| 元素 | 类型 | 技能名 | 技能名(中文) | 定位 |
|---|---|---|---|---|
| 水 | 轻技 | `water_slash` | 叠浪 | 多段连击 |
| 水 | 轻技·进阶 | `water_vortex` | 寒潭漩涡 | 牵引控制 |
| 木 | 轻技 | `wood_vine` | 藤刺 | 远程穿刺 |
| 木 | 轻技·进阶 | `wood_thorn` | 荆棘牢笼 | 范围禁锢 |
| 金 | 重技 | `metal_sword` | 万刃旋 | 大范围旋转 |
| 金 | 重技·进阶 | `metal_blade` | 天剑坠 | 高伤打击 |
| 火 | 重技 | `fire_dragon` | 墨龙冲 | 持续灼烧 |
| 火 | 重技·进阶 | `fire_inferno` | 炼狱焚天 | 超大范围 |
| 土 | 重技 | `earth_meteor` | 陨星震 | 范围击飞 |
| 土 | 重技·进阶 | `earthquake` | 崩岳裂地 | 全屏震荡 |
| 通用 | — | `parry_dagger` | 弹反 | 格挡反击 |

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
- 新增美术资产必须注册至 `config/assetList.json`
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
