# Folio

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个安静、本地优先的**稍后阅读** Chrome 扩展。收藏页面，按 `待读 → 在读 → 已读` 推进，随时从上次离开的地方继续，并把数据完整留在自己的设备上——还可以选择同步到你自己 GitHub 仓库的一个分支。

- 仓库地址：https://github.com/itaober/folio
- 最新 Release：https://github.com/itaober/folio/releases/latest

> 基于 **faiz** 设计体系——单一暖中性 oklch 色板，墨色为主、仅一种蓝色点缀，支持浅色 / 深色 / 跟随系统。阅读才是主角，设置与同步保持安静。

## 截图

**阅读库** —— 完整的列表，含搜索、标签、排序与状态流转。

![Folio 阅读库](docs/screenshots/options.png)

<table>
  <tr>
    <td width="34%" valign="top"><b>弹窗</b><br/>一步收藏与整理。<br/><br/><img src="docs/screenshots/popup.png" alt="Folio 弹窗" /></td>
    <td valign="top"><b>深色模式</b><br/>浅色 / 深色 / 跟随系统，全局一致。<br/><br/><img src="docs/screenshots/options-dark.png" alt="Folio 阅读库，深色" /></td>
  </tr>
</table>

**设置 —— GitHub 同步** —— 填入 fine-grained token，即可同步到 `content` 分支。

![GitHub 同步设置](docs/screenshots/settings.png)

## 功能

- **一步收藏** —— 在弹窗里收藏当前标签页，或在任意页面右键 → **保存到 Folio**。
- **状态流转** —— `待读 → 在读 → 已读`，点击状态胶囊一键切换（无需打开编辑器）。
- **继续阅读** —— 记录页面上的阅读位置，再次打开时恢复滚动位置。
- **整理** —— 标签、备注、全文搜索与排序（最新 / 最早 / 域名 / 标题 / 状态）。
- **行内编辑** —— 就地编辑标题、备注、标签与状态。
- **命令面板** —— 在后台页按 `⌘K` / `Ctrl-K` 搜索条目并执行快捷操作。
- **外观** —— 浅色 / 深色 / 跟随系统，弹窗与后台页统一应用。
- **GitHub 同步（可选）** —— 把阅读库以两个 JSON 文件的形式保存在你自己仓库的 `content` 分支，多设备按条目「最新者胜」合并。详见 [GitHub 同步](#github-同步)。
- **本地备份** —— 把阅读库镜像到本地文件夹，需要时再导入备份。
- **导出** —— JSON / CSV / Markdown，当前视图或全部。
- **双语** —— English 与简体中文。

工具栏图标会以一个小角标圆点显示当前标签页的保存状态（琥珀色 = 待读，蓝色 = 在读，绿色 = 已读）。

## 安装

### 从 Release 安装（推荐）

1. 在 [Releases](https://github.com/itaober/folio/releases/latest) 下载最新的 `folio-extension-vX.Y.Z.zip` 并解压。
2. 打开 `chrome://extensions`，开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择解压后的目录（包含 `manifest.json` 的那一层）。

### 从源码构建

```bash
pnpm install
pnpm build
```

然后用 **加载已解压的扩展程序** 选择 `dist/` 目录。

## GitHub 同步

同步**默认关闭**且完全可选 —— Folio 无需账户即可完整离线使用。本地数据始终是事实来源，GitHub 只是你掌控的一份副本。

1. 在后台页打开 **设置 → GitHub**。
2. 创建一个**细粒度（fine-grained）个人访问令牌**，作用域限定为单个仓库，授予 **Contents：读写**（Metadata 读取会自动包含）。设置一个合理的过期时间。
   - 快捷入口：`github.com/settings/personal-access-tokens/new`
3. 粘贴令牌，确认 owner / 仓库 / 分支（默认 `content`），然后连接。

首次连接时，Folio 会把该分支创建为一个**孤儿分支**（不含源码历史），只写入两个文件：

```
content 分支
└─ folio/
   ├─ data.json       # 条目 + 标签（含删除墓碑）
   └─ settings.json   # 已同步的偏好设置
```

令牌只保存在本浏览器（`chrome.storage`），绝不会写入同步文件。设备之间的冲突按条目以最新更改为准合并；存储设置里提供 **以本设备为准 → GitHub**、**以 GitHub 为准 → 本设备**，以及在两端确实出现分歧时的 **逐项审阅并解决** 差异界面。

## 隐私与数据

- 你的阅读清单保存在你的设备上；若你选择开启，则还会保存在**你自己的 GitHub 仓库**里 —— Folio 没有任何后端，也不会把数据发送给任何第三方。
- 唯一的网络出口是 `api.github.com`，使用你提供的令牌。
- 无遥测，无统计分析。

## 开发

环境要求：**Node 20+** 与 **pnpm 10+**。

```bash
pnpm install     # 安装依赖
pnpm dev         # 带 HMR 的开发构建（从 dist/ 加载扩展）
pnpm typecheck   # tsc --noEmit
pnpm build       # 生产构建 → dist/
```

**技术栈：** React 19 · TypeScript · Vite 7 + `@crxjs/vite-plugin`（MV3）· Tailwind CSS v4 · i18next · lucide-react。

### 项目结构

```
src/
  popup/         # 收藏与整理面板（App.tsx + _components/）
  options/       # 完整后台页：阅读库、设置、同步（App.tsx + _components/{library,settings,github}）
  background/    # MV3 service worker：收藏、右键菜单、工具栏图标 + 状态圆点、继续阅读、同步
  core/          # 数据模型、repository（commit/store）、selectors、导出器、url
    sync/        #   本地文件夹备份 + github/（content 分支客户端、信封、合并）
  shared/
    ui/          # faiz fz-* 基础组件（StatusMenu、Segmented、FolioMark…）
    styles/      # faiz oklch tokens + Tailwind v4 配置
    i18n/        # en + zh-CN 资源、locale store
    theme.ts     # 浅色/深色/跟随系统模式控制器
```

## 发布

通过 GitHub Actions 的 `.github/workflows/manual-release.yml`（**Run workflow**）发布。流程会校验版本号、更新 manifest、构建并打包扩展、生成校验文件、推送 tag，并创建 GitHub Release。

输入参数：`version`（例如 `1.1.0`）、`draft`、`prerelease`、可选的 `release_notes`。

## 说明

- 扩展使用固定的 manifest `key`，因此升级后扩展 ID 保持稳定 —— 在扩展卡片上点击 **重新加载** 即可保留 `chrome.storage.local` 数据。
