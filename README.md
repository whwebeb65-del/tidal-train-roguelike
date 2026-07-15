# project-002-tidal-train-roguelike

## 项目目标

设计并验证一款适合抖音小游戏生态的轻量肉鸽产品，工作名为《最后一班：潮汐列车》。产品重点是短局、单手操作、乘客组合构筑、可持续内容更新和合规商业化。

## 当前状态

- 阶段：可玩 Web MVP + Cocos 接入骨架
- 日期：2026-07-15
- 当前结论：已完成规则层、存档、三货币、地图开放、互动奖励、首通奖励、埋点、平台 Mock、确定性战斗循环和浏览器可玩流程
- 商业化状态：已接入广告、商店、分享的 Mock 边界；正式抖音支付、广告和登录仍需在真机平台接入并做合规审核
- Cocos 状态：已准备 Cocos Creator 脚本和场景控制器；官方安装包下载在当前网络出口返回 403，因此尚未完成编辑器内导入和抖音真机打包

## 使用与验证

在项目目录执行：

```powershell
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:4173/` 即可试玩。可以在“车站”中查看三种货币、升级车站和地图开放；进入同一局后可重复点击互动点领取分段奖励，连续开炮积累潮汐动能，再用技能、维修和潮汐爆发完成战斗，击破 Boss 后验证首通高额奖励。

常用校验命令：

```powershell
npm test
npm run typecheck
npm run build
```

试玩脚本见 [`docs/testing/prototype-playtest-script.md`](docs/testing/prototype-playtest-script.md)，结果记录模板见 [`docs/testing/prototype-results-template.md`](docs/testing/prototype-results-template.md)。

## 目录说明

- `src/`：可跨引擎复用的规则层、存档、平台 Mock、埋点
- `assets/scripts/`：面向 Cocos Creator 的场景、战斗、奖励、车站和教程脚本骨架
- `web/`：无需安装 Cocos 即可运行的浏览器 MVP
- `docs/`：需求、设计、计划和验证文档

## 本轮战斗与性能增强

- 战斗动作统一由 `src/domain/combat/CombatLoopSystem.ts` 结算：普通攻击、汽笛共鸣、维修车厢、潮汐爆发；连击和动能让重复点击形成短期决策，而不是单纯点击伤害。
- 每个节点确定性生成“平静水域 / 急流冲刺 / 回声浓雾”之一，改变维修、普通攻击或技能的收益，便于玩家复盘和持续更新。
- Web 画面保持事件驱动：状态变化时重绘，不运行持续的业务 `requestAnimationFrame` 循环；战斗板使用 CSS 2.5D、绘制隔离和移动端动画降级。
- 当前版本已加入轻量性能保护，但没有在真实抖音机型上宣称稳定 60 FPS；正式上线前仍需在目标机型上用 Cocos 真机包做帧率、内存、广告回调和支付审核。

## 工具链与替代编辑方式

- 常用验证命令：`npm test`、`npm run typecheck`、`npm run build`。
- Web MVP 使用广告、分享和商店 Mock，可直接验证复活、技能刷新、三货币和结算闭环。
- Cocos Dashboard 官方安装包下载失败不会阻塞源码修改：可继续用 VS Code、其他代码编辑器或命令行编辑当前工程；以后有可用的官方 Cocos Creator 环境时，再打开同一工程做场景预览和抖音真机打包。
- 不使用来源不明的安装包或修改版编辑器；正式广告、分享、登录、支付和合规审核仍需接入抖音小游戏真实 SDK。
