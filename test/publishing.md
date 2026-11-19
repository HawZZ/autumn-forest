# GitHub 发布与更新

- 仓库：https://github.com/Momcozy-App/autumn-forest
- 在线漫游：https://momcozy-app.github.io/autumn-forest/
- Pages：`main` 分支根目录，无需构建。

本机通过仅属于该仓库的 SSH 部署密钥推送。私钥保存在 `~/.ssh/autumn_forest_github_ed25519`，不要提交、分享或删除它。

```bash
GIT_SSH_COMMAND='ssh -i ~/.ssh/autumn_forest_github_ed25519 -o IdentitiesOnly=yes' git push origin main
```

更新 `main` 后，GitHub Pages 会自动重新发布。应用本体没有构建步骤，也不需要安装 npm 依赖。
