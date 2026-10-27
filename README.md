# 家常菜单

一个极简家庭菜单工具：

- 录入和修改家庭菜谱
- 上传菜品图片
- 直接粘贴纯文字食材
- 添加文字教程或抖音、哔哩哔哩教程链接
- 从菜单中选择本次要做的菜
- 自动汇总所选菜品的食材
- 做饭时查看每道菜的分步教程

## 界面开发规则

主要使用场景是移动端，界面和交互采用移动端优先。浏览器开发预览默认使用 390 × 844 的手机视口，兼顾小屏手机和桌面。完整协作规则见 [AGENTS.md](AGENTS.md)。

菜谱和选择结果由 Node 服务保存在服务器的 `data/state.json` 中，上传图片保存在 `data/uploads`。Docker 部署时，`data` 目录会挂载到宿主机，重建容器后数据仍会保留。旧版本保存在浏览器 `localStorage` 中的数据，会在升级后首次打开时自动迁移到服务器。

## 使用 Docker 启动

```bash
docker compose up -d --build
```

打开 <http://localhost:3000>。

停止服务：

```bash
docker compose down
```

## 不使用 Docker

本机需要 Node.js 22 或更高版本：

```bash
node server.js
```

## 文件结构

```text
family-menu/
├── index.html   # 页面结构
├── styles.css   # 页面样式
├── app.js       # 菜谱、选菜和食材汇总逻辑
├── server.js    # 静态页面、菜单 API 和服务端持久化
├── data/        # 服务端数据目录（运行后生成）
├── Dockerfile
└── compose.yaml
```

## 手机端教程跳转

抖音和哔哩哔哩的视频链接在手机端提供 App 打开入口，同时保留网页入口。支持解析 v.douyin.com 和 b23.tv 分享短链接；解析失败时使用原网页链接。桌面浏览器使用网页。App 唤起受手机浏览器和已安装 App 的限制，需在真机确认。
