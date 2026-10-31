# Local build and rollback

The worktree is `C:\Users\eme4\warp-core`, branch `codex/warp-living-play`. The running installation's bundles are under `D:\Lumiverse\data\extensions\warp\repo`. `D:\Lumiverse\warp` is an older independent checkout and is not the installation target.

Run the build and host check from the worktree:

```powershell
bun run verify
bun run build
bun scripts/host-smoke.ts D:/Lumiverse
bun scripts/deploy-local.ts
```

The last command previews the local update and changes no files. After verification, the executable deployment command is:

```powershell
bun scripts/deploy-local.ts --apply
```

The script backs up the installed manifest and both bundles into a new `.artifacts/warp-backup-*` directory before copying. It preserves the installed repository's source and Git history, extension storage, chats and account settings. Additional permissions are rejected. On a failed copy, it restores the saved files.

Use Lumiverse's normal extension Restart action after deploying, then refresh the app so the frontend loads the new bundle. The script does not restart or terminate the running server. A local bundle update can be replaced by a later normal Git update; it is a development deployment, not a published release.

To restore a saved build, substitute the backup directory printed by deployment:

```powershell
bun scripts/deploy-local.ts --restore C:/Users/eme4/warp-core/.artifacts/warp-backup-TIMESTAMP
bun scripts/deploy-local.ts --restore C:/Users/eme4/warp-core/.artifacts/warp-backup-TIMESTAMP --apply
```

The first command previews rollback. The second backs up the current bundles and restores the prior manifest and bundles. Restart the extension and refresh Lumiverse afterward. Historical books and records are retained throughout, so restoring the old runtime also restores its access to those records.
