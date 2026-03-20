# Folio

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个稍后阅读清单插件。

Folio 用于快速收藏页面，并通过 `待读`、`在读`、`已读` 管理阅读状态，同时支持本地备份。

## 相关链接

- 仓库地址：https://github.com/itaober/folio
- Release 列表：https://github.com/itaober/folio/releases
- 最新 Release：https://github.com/itaober/folio/releases/latest

## 主要功能

- 待读优先的工作流
- 从 Popup 或右键菜单快速收藏当前页面
- 阅读状态流转：`待读` -> `在读` -> `已读`
- 标签筛选与标签管理
- 行内编辑（标题、备注、标签）
- 后台页面搜索与排序
- 本地目录备份同步（浏览器 -> 本地）
- 中英双语切换
- 可切换图标主题

## 安装

### 方式 A：从 GitHub Release 安装（推荐自托管）

1. 打开 [Releases](https://github.com/itaober/folio/releases)，下载最新的 `folio-extension-vX.Y.Z.zip`
2. 本地解压
3. 打开 `chrome://extensions`
4. 开启右上角**开发者模式**
5. 点击**加载已解压的扩展程序**
6. 选择解压目录（目录中需包含 `manifest.json`）

### 方式 B：本地构建安装

```bash
pnpm install
pnpm build
```

然后在扩展管理页通过“加载已解压的扩展程序”选择 `dist` 目录。

## 开发

### 环境要求

- Node.js 20+
- pnpm 10+

### 常用命令

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## 手动发布 Workflow（GitHub Actions）

仓库内置手动发布流程：

- `.github/workflows/manual-release.yml`

该流程在 GitHub Actions 页面通过 **Run workflow** 手动触发，固定基于 `main` 最新代码执行。

### 自动执行内容

1. 校验输入版本号
2. 检查 tag 是否冲突
3. 同步更新版本到：
   - `package.json`
   - `src/manifest.ts`
4. 构建扩展
5. 打包 `dist` 为 zip
6. 生成 SHA-256 校验文件
7. 提交版本变更到 `main`
8. 创建并推送 git tag
9. 创建 GitHub Release 并上传资产

### 输入参数

- `version`：必填，仅数字版本号，例如 `0.2.0`
- `draft`：是否创建草稿发布
- `prerelease`：是否标记为预发布
- `release_notes`：可选，手动填写发布说明；留空则使用 GitHub 自动生成说明

## 项目结构

```text
src/
  background/     # service worker 逻辑
  popup/          # popup 界面
  options/        # 后台/选项页界面
  core/           # store、selectors、repository、sync 逻辑
  shared/         # 共享样式、i18n、ui 组件
public/
  icons/          # 扩展图标资源（png + svg）
```

## 技术栈

- React + TypeScript
- Vite + CRXJS plugin
- Tailwind CSS v4
- i18next

## 说明

- 通过 GitHub Release 分发并安装时，需要在 Chrome 开启开发者模式。
- 项目使用固定的 manifest key 来稳定扩展 ID。
  升级版本时请保留同一个扩展条目并点击 **重新加载**，以保留 `chrome.storage.local` 数据。
- 如果要面向大众分发，建议发布到 Chrome Web Store。
- 可通过 [最新 Release](https://github.com/itaober/folio/releases/latest) 直接拿到当前版本安装包。
