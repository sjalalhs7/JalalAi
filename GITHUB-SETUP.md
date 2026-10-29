# Publish JalalAI to a new GitHub repository

## Repository settings
- Suggested repository name: `jalalai`
- Visibility: **Private initially** (recommended until secrets/authentication and production behavior have been reviewed).
- Do not upload provider keys, `.dev.vars`, `.env` files, or Cloudflare credentials.
- No license is included because the owner has not specified a license. Without a license, others generally do not receive permission to reuse or redistribute the source.

## One-time steps
1. Sign in to GitHub as the intended owner. The currently connected GitHub identity reported by the connector is `sjalalhs1-collab`; confirm this is the account you want to use.
2. Open https://github.com/new.
3. Create a repository named `jalalai`. Choose Private. Leave “Add a README”, `.gitignore`, and license unchecked because these are already in this package.
4. Upload the **contents** of this folder, not the ZIP file itself. The easiest route is GitHub's “uploading an existing file” page or GitHub Desktop.
5. Commit to `main`. The included `.github/workflows/ci.yml` runs `npm run check` and `npm test` on pushes and pull requests.
6. Confirm the Actions run is green before changing repository visibility or deploying.

## Git CLI alternative
After creating the empty repository in the browser, from this directory run:

```sh
git init -b main
git add .
git commit -m "Initial JalalAI professional source package"
git remote add origin https://github.com/OWNER/jalalai.git
git push -u origin main
```

Replace `OWNER` with the actual GitHub username. Git may ask you to authenticate in the browser. Never paste a GitHub token into chat or commit it to this repository.

## What is not done by this guide
This does not create a GitHub account/repository, upload code automatically, deploy Cloudflare, or verify live Gemini calls. Those require account-side actions and a real deployment environment.
