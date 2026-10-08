# claude-mods

Daniel 的 Claude Code mod 清單，讓每台電腦都裝到同一套 mod。

- 自己做的 mod：程式碼放在 `mods/`。
- 別人的 mod：只在清單裡指定 repo，並鎖定審查過的版本（commit），作者之後的更新不會自動進來。

清單本體是 `.claude-plugin/marketplace.json`。需要 Claude Code 2.1.287 以上。

## 收錄的 mod

| mod | 來源 | 做什麼 | 指令 |
|---|---|---|---|
| cache-glance | 自己做的 | 輸入框上方常駐一行快取狀態：還有多久過期、過期後重寫要多少錢 | 無 |
| task-progress | 自己做的 | 給 Claude 一個回報工具，多步驟工作時把任務清單和進度寫進 cmux 左側欄（只在 cmux 裡啟動；搭配下方的 cmux 側欄） | 無 |
| auto-panes | 自己做的 | 每次開 Claude Code 等 1.5 秒自動打開右側的 Diff（`/diff`）和 Files（`/filetree`）。Source Control 不自動開：它的 `/git` 打開時會搶走鍵盤，第一個打的字會進 commit 欄，所以用 ◨ 手動開 | 無 |
| image-view | [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view) | 貼上的圖片在輸入框上方顯示縮圖（需要支援圖片的終端機） | 無 |
| filetree | [data-goblin/claude-code-filetree](https://github.com/data-goblin/claude-code-filetree) | 右側欄的檔案樹，標出 Claude 正在讀寫的檔案（需要全螢幕模式） | `/filetree` |
| cache-tax | [karanb192/cache-tax](https://github.com/karanb192/cache-tax) | 快取保溫；閒置過久後的第一則訊息會擋下一次並顯示重寫價格 | `/keepwarm`、`/cache-tax` |
| next-steps | [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community/tree/main/next-steps)（Thariq Shihipar） | 每次回覆後在輸入框上方給最多三個下一步建議；對話框是空的時按 1、2、3 填進去，再按 Enter 送出，0 關掉，Tab 採用第一個。不會自己送出 | 無 |
| source-control | [manuel-will/cc-source-control](https://github.com/manuel-will/cc-source-control) | VS Code 風格的原始碼控制：commit 歷史分支圖、暫存、commit、同步（介面只有英文、德文） | `/git` |

別人的 mod 都在 2026-10-08 讀過程式碼：image-view、filetree 不連網；cache-tax 不連網，但開了 `/keepwarm` 會定時送請求、吃額度；source-control 只執行 git、沒有破壞性操作，背景每 10 分鐘 `git fetch` 一次（設定 `fetchIntervalMinutes` 為 0 可關閉），從它的面板 commit 時不會跑專案的 git hooks；next-steps 只讀指令清單、填對話框，不連網、不執行程式，但每輪回覆後會送一次分身請求問建議，對話越長這次請求越貴（讀一次整段快取，跟一次保溫差不多）。

filetree 和 source-control 共用右側面板，用 source-control 那列 Commit 按鈕右邊的 `◨` 切換。

## cmux 側欄：task-cards

`cmux/task-cards.js` 是 cmux 的自訂左側欄（cmux 的 Custom Sidebars beta 功能），不是 Claude Code 的 mod。它照 cmux 內建的 `workspaces` 範本改，每個工作區一張卡片，把「最後一則訊息」換成 task-progress 寫進來的任務清單：

- 選取中的工作區：列出每一步（✓ 完成、▸ 進行中、· 還沒做）
- 其他工作區：進度條＋目前做到哪一步
- 沒有清單時：顯示 Claude 的狀態（工作中、等你回覆、閒置）

task-progress 把清單寫在工作區的「描述」、摘要寫在「進度」。換回 cmux 預設側欄時，這兩項也會顯示在工作區下面。

安裝：在 `~/.config/cmux/sidebars/` 放一個捷徑，再到 cmux 側欄切換鈕上按右鍵，選 **task-cards**。

```bash
mkdir -p ~/.config/cmux/sidebars
# 主力電腦（清單在 ~/claude-mods）
ln -s ~/claude-mods/cmux/task-cards.js ~/.config/cmux/sidebars/
# 其他電腦（清單是從 GitHub 加的，放在 Claude Code 的下載資料夾）
ln -s ~/.claude/plugins/marketplaces/claude-mods/cmux/task-cards.js ~/.config/cmux/sidebars/
cmux sidebar validate task-cards
```

## 在另一台電腦安裝（例如公司 Mac mini）

repo 是私有的，第一次要先讓那台電腦能讀 GitHub：

```bash
gh auth login
gh auth setup-git
```

加入清單，再裝想要的 mod：

```bash
claude plugin marketplace add Toriwuuu/claude-mods
claude plugin install cache-glance@claude-mods
claude plugin install image-view@claude-mods
claude plugin install filetree@claude-mods
claude plugin install cache-tax@claude-mods
claude plugin install source-control@claude-mods
claude plugin install task-progress@claude-mods
claude plugin install auto-panes@claude-mods
claude plugin install next-steps@claude-mods
```

裝好後重開 Claude Code。要用 task-cards 側欄的話，照上面「cmux 側欄」那段放捷徑。

## 更新

在主力電腦改完並 push 之後，另一台執行：

```bash
claude plugin marketplace update claude-mods
claude plugin update cache-glance@claude-mods
```

然後重開 Claude Code。

注意：Claude Code 是看 `plugin.json` 裡的 `version` 判斷有沒有新版。改了自己的 mod，要把版本號往上加（例如 0.1.0 → 0.1.1），另一台才會更新。

## 開發（主力電腦）

主力電腦的清單直接指向本機資料夾：

```bash
claude plugin marketplace add ~/claude-mods
```

這樣改了 `mods/` 裡的檔案，在 Claude Code 裡執行 `/reload-plugins` 就會生效，不用先 push。確認沒問題再 commit、push。

改完可以先跑檢查：

```bash
claude plugin validate mods/cache-glance
claude plugin test mods/cache-glance
```

## 升級別人的 mod

不要直接換 `sha`。先讀過新版本的程式碼，確認沒問題再把 `marketplace.json` 裡的 `sha` 換成新的 commit。
