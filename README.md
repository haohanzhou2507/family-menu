# 家常菜单

一个只在单台设备使用的极简家庭菜单工具：

- 录入和修改家庭菜谱
- 从菜单中选择本次要做的菜
- 自动汇总所选菜品的食材
- 做饭时查看每道菜的分步教程

菜谱和选择结果保存在浏览器的 `localStorage` 中，不需要账号、数据库或后端服务。

## 使用 Docker 启动

```bash
docker compose up -d
```

打开 <http://localhost:3000>。

停止服务：

```bash
docker compose down
```

## 不使用 Docker

也可以直接用任意静态文件服务器运行，例如：

```bash
python3 -m http.server 3000
```

## 文件结构

```text
family-menu/
├── index.html   # 页面结构
├── styles.css   # 页面样式
├── app.js       # 菜谱、选菜和食材汇总逻辑
├── Dockerfile
└── compose.yaml
```
