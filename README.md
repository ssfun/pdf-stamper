# PDF Stamper - 现代化在线PDF盖章工具

PDF Stamper 是一个免费、开源的纯前端 PDF 盖章应用。它允许用户在浏览器中为 PDF 文件添加普通印章和骑缝章，所有操作均在本地完成，确保了用户的数据隐私和安全。


## ✨ 主要功能

- **纯客户端处理**：所有PDF文件和印章图片都在您的浏览器中处理，**绝无任何数据上传**，100%保护您的隐私。
- **支持多种印章**：
    - **普通印章**：在任意页面添加可自由移动、缩放的普通印章。
    - **骑缝章**：跨页添加骑缝章，支持整体移动和缩放，位置精准。
- **印章预设旋转**：在添加印章前，可在工具栏预设旋转角度，实现带角度盖章。
- **现代化UI/UX**：
    - 专业的三栏式应用布局。
    - 可收起的侧边栏（抽屉效果），最大化工作区。
    - 印章图片实时预览。
    - 工作区视图自适应，支持自由缩放。
- **多页导航**：
    - 左侧缩略图快速预览和跳转。
    - 底部工具栏显示当前页码，并提供下拉菜单快速选择页面。
- **高质量导出**：导出的PDF文件保持原始文档的最高清晰度，印章位置像素级精准。

## 🚀 技术栈

- **构建工具**: [Vite](https://vitejs.dev/) - 提供了极速的冷启动和模块热更新（HMR）。
- **核心库**:
    - [PDF.js](https://mozilla.github.io/pdf.js/) - 用于在浏览器中渲染和解析PDF文件。
    - [Fabric.js](http://fabricjs.com/) - 一个强大而简单的HTML5 Canvas库，用于实现工作区内的对象交互。
    - [pdf-lib](https://pdf-lib.js.org/) - 用于在导出时，以纯JavaScript创建和修改PDF文档。
- **部署平台**: [Cloudflare Pages](https://pages.cloudflare.com/) - 提供全球CDN加速、自动CI/CD和免费的SSL证书。

## 🛠️ 本地开发

如果您想在本地运行或继续开发此项目，请按照以下步骤操作：

1.  **克隆仓库**
    ```bash
    git clone https://github.com/ssfun/pdf-stamper.git
    cd pdf-stamper
    ```

2.  **安装依赖**
    项目使用 `npm` 作为包管理器。
    ```bash
    npm install
    ```

3.  **运行开发服务器**
    此命令会启动一个本地开发服务器，通常在 `http://localhost:5173`。
    ```bash
    npm run dev
    ```

4.  **构建生产版本**
    此命令会将所有文件打包到 `dist` 目录中，准备用于部署。
    ```bash
    npm run build
    ```

## ☁️ 部署到 Cloudflare Pages

本项目已为 Cloudflare Pages 进行了完美适配，部署过程非常简单：

1.  将您的项目代码推送到一个GitHub（或GitLab）仓库。
2.  登录您的Cloudflare账户，进入 **Workers & Pages**。
3.  点击 **Create application** > **Pages** > **Connect to Git**。
4.  选择您的项目仓库。
5.  在 **Set up builds and deployments** 页面，Cloudflare会自动为您选择 `Vite` 作为框架预设。请确认以下配置：
    - **Production branch**: `main` (或您的主分支)
    - **Build command**: `npm run build`
    - **Build output directory**: `dist`
6.  点击 **Save and Deploy**。

Cloudflare将自动完成构建和部署，并为您提供一个 `*.pages.dev` 的免费域名。

## 📁 项目结构

```
.
├── dist/             # 构建后的生产文件
├── public/           # 静态资源，会被直接复制到dist根目录
├── src/              # 项目源代码
│   ├── main.js       # 应用主逻辑
│   └── style.css     # 应用主样式
├── index.html        # 应用入口HTML
├── package.json      # 项目依赖和脚本
└── README.md         # 项目说明文档
```

## ❤️ 贡献

欢迎您为这个项目做出贡献！如果您发现了Bug或有新的功能建议，请随时提交一个 [Issue](https://github.com/ssfun/pdf-stamper/issues)。

如果您想提交代码，请遵循以下步骤：
1.  Fork 本仓库。
2.  创建一个新的分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  将您的分支推送到远程仓库 (`git push origin feature/AmazingFeature`)。
5.  开启一个 Pull Request。

## 📄 许可

本项目采用 [MIT License](LICENSE.txt) 开源许可。
