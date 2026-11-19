# GitHub Pages 发布与更新

- 发布仓库：https://github.com/HawZZ/autumn-forest
- 在线漫游：https://hawzz.github.io/autumn-forest/
- Pages：`main` 分支根目录，无需构建；`.nojekyll` 禁用 Jekyll 处理。
- 本地 `origin` 保留原仓库 `Momcozy-App/autumn-forest`；`pages` 指向发布仓库。
- 发布通过 SSH 连接 `myec2instance`，使用远端已登录的 `gh` 账号 `HawZZ`。

将本地已提交的 `main` 同步到远端工作目录后，在远端执行：

```bash
gh auth setup-git
git push origin main
gh api repos/HawZZ/autumn-forest/pages --jq '{html_url,status,source}'
```

远端发布工作目录的 `origin` 指向 `HawZZ/autumn-forest`。更新 `main` 后，GitHub Pages 自动重新发布。应用本体没有构建步骤，也不需要安装 npm 依赖。

线上验证：

```bash
node test/online.cjs
```

脚本使用本机 Chrome for Testing 与测试依赖；换机后需调整浏览器路径。
