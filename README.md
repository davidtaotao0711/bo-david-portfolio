# BO DAVID

全新的独立摄影作品网站。本地 Astro + TypeScript 静态项目，公开网站无数据库、登录、远程图片或运行时 API；另附仅在本地开发时可用的简易照片编辑器。

## 本地运行

```sh
npm install
npm run dev
```

打开终端显示的本地地址（默认 http://127.0.0.1:4321）。`dev` 和 `build` 自动运行图片管线；第一次生成需要一些时间，之后按图片内容缓存。

```sh
npm run build
npm run typecheck
npm test
```

## 本地编辑器

启动 `npm run dev` 后打开 http://127.0.0.1:4321/editor 。

1. 左侧选择项目，点击「上传照片」批量选择文件。
2. 上传会立即保存，并自动生成五档 AVIF / WebP / JPEG。支持静态 JPEG、PNG、WebP、AVIF，单张 40 MB 以内。
3. 拖拽照片，或点击「前移 / 后移」调整顺序；点击「设为封面」选择 Index 封面，再点击「保存顺序与封面」。
4. 左侧项目旁的上下箭头调整项目顺序，立即保存。
5. 上传正式照片后，可以点击「移除测试色块」清理该项目的占位内容；至少保留一张正式照片。
6. 点击「查看网站」或「预览项目」检查效果。未保存时可点击「撤销未保存调整」。

照片位于 `public/images/originals/<slug>/`；项目数据位于 `src/data/projects.json`，`projects.ts` 只定义类型并导出这些数据。每次修改前的数据备份位于 `.cache/editor-history/`。编辑器只在 dev 服务中提供，不进入 `dist` 或未来的公开网站。它不会向云端上传照片。

## 从 GitHub 同步

在本地编辑器点击「从 GitHub 同步」。固定来源是 `davidtaotao0711/bo-photography`，使用本机 Git 已有的登录权限；不需要在网页填写令牌。只读取仓库数据和图片，不执行仓库代码，也不向该仓库提交修改。

- 首次按 `src/data/series.json` 建立项目，读取 `src/data/photos.json` 的全部照片；没有有效系列的照片归入 `Unassigned`。系列封面若来自未分组照片，会同时用于该系列，原图文件只存一份。
- 新项目追加到当前项目列表，现有项目与测试素材保留。后续同步保留本地项目顺序、照片顺序、封面及项目文字，只补充新照片、更新发生变化的原图；远端删除不会自动删除本地内容。
- 进度显示下载与图片生成。同步期间暂时锁定编辑；有未保存调整时先保存或撤销。浏览器刷新后可继续查看正在运行的任务。
- 首次同步需要下载原图并生成五档图片，耗时取决于网络及原图大小。同步失败时项目数据保持原状；再次点击会复用缓存。关闭开发服务会中断任务，重新启动后点击按钮重试。
- Git 数据缓存位于 `.cache/github-source/`，本地原图位于 `public/images/originals/github/`。断网时已导入照片仍可显示。保留 `github` 来源字段，重复同步依靠这些字段识别同一照片。
- 当前支持仓库中的普通 JPEG、PNG、WebP、AVIF 文件；Git LFS 指针会显示明确错误。遇到权限错误，先恢复本机 Git 对这个仓库的访问权限。

## 手动导入照片

1. 把照片放在 `public/images/originals/<project>/`。
2. 编辑 `src/data/projects.json`，替换或添加项目记录。每张图片填写唯一 `id`、以 `/images/originals/` 开头的 `src`、正确的 `width` / `height`、描述性的 `alt`。去掉 `placeholderColor`，这样找不到源图时会明确报错。
3. `cover` 填写该项目中一张图片的 `id`。项目顺序、照片顺序就是数组顺序。`slug` 使用小写字母、数字及连字符；无需增加页面文件。
4. 重新运行 `npm run dev`。管线验证原图方向及尺寸，生成 320、640、960、1440、2000 五档 AVIF、WebP、JPEG 和 tiny WebP。元数据不保留 EXIF。
5. 在 `src/data/profile.ts` 填写真正的联系地址。目前 Email / Instagram / Xiaohongshu 是纯文字占位，没有编造账号。

数据示例：

```json
[{
  "id": "my-project", "slug": "my-project", "title": "My Project",
  "year": "2026", "location": "Shanghai", "description": "A short introduction.",
  "cover": "my-project-01",
  "images": [{ "id": "my-project-01", "src": "/images/originals/my-project/01.jpg",
    "width": 1600, "height": 2000, "alt": "Describe the photograph." }]
}]
```

## 页面和操作

- `/?mode=grid`：Index，默认入口。
- `/?mode=overview`：全部照片 contact sheet；`&slug=xinjiang` 定位项目。
- `/xinjiang?s=3`：第四张照片。刷新、Back、Forward 保留 URL 中的图片。
- 左右点击、方向键、横向 swipe 切换照片（首尾循环）。Prev / Next 切换项目。
- Close / Escape 返回入口模式、滚动位置和触发链接焦点。入口上下文保存在当前浏览器历史条目中，刷新仍保留；直接打开新的单图链接时默认返回 Index。
- 原生 View Transitions 在支持的浏览器中提供 320ms 的图片位置连续变化，其他浏览器使用图片淡入。尊重 reduced motion。

Overview 的候选图片严格限制为 320px，不包含高清候选。Viewer 只保留一张实际图片、最多三项 AVIF preload（上一张、当前、下一张）；其他格式通过 picture fallback。静态页面提供无脚本的项目图像后备内容。

`docs/reference-audit.md` 记录参考站实测；`docs/verification.md` 记录验收。

本阶段不创建 GitHub 仓库、不部署、不设置域名。最初六个项目使用 72 张纯色测试素材；GitHub 导入的真实照片作为独立项目追加，可在编辑器调整。
