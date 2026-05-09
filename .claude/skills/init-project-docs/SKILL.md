---
name: init-project-docs
description: 在專案中建立 AI 輔助開發的完整結構（CLAUDE.md、docs/、rules/、hooks、agents）
user-invocable: true
---

# 初始化專案文件結構

為當前專案建立 AI 輔助開發所需的完整結構。透過智慧偵測專案類型，推薦適合的設定，每個階段讓開發者確認後再建立。

在一開始，建議用戶切換至 Sonnet 模式，以減少 Token 的消耗。

---

## Phase 0：智慧偵測

在開始之前，自動偵測以下資訊（不需要使用者輸入）：

1. **專案類型偵測**：
   - 讀取 `package.json`（Node.js）、`requirements.txt` / `pyproject.toml`（Python）、`Gemfile`（Ruby）、`go.mod`（Go）、`Cargo.toml`（Rust）
   - 偵測框架：Express、Next.js、Nuxt、Django、Flask、Rails、Gin 等
   - 偵測測試框架：Vitest、Jest、Mocha、Pytest、RSpec 等
   - 偵測 CSS 框架：Tailwind、Bootstrap 等
   - 偵測資料庫：better-sqlite3、Prisma、Sequelize、mongoose、TypeORM 等

2. **現有設定偵測**：
   - 檢查 `CLAUDE.md`、`docs/`、`.claude/rules/`、`.claude/hooks/`、`.claude/agents/`、`.claude/settings.json` 是否已存在
   - 已存在的項目在後續階段標記為「已存在，跳過」

3. **目錄結構偵測**：
   - 掃描實際的目錄結構，用於動態決定 rules 的 `paths` 作用範圍
   - 例如：路由在 `src/routes/` 還是 `app/api/`、測試在 `tests/` 還是 `__tests__/`

偵測完成後，向使用者展示偵測結果摘要，讓使用者確認或修正。

---

## Phase 1：Docs 文件

向使用者確認以下資訊（從偵測結果預填，使用者可修改）：

1. **專案名稱和一句話描述**
2. **技術棧**（從 dependencies 偵測）
3. **常用指令**（從 scripts 偵測）

確認後建立以下結構。必需深入閱讀所有原始碼後再撰寫，不可只寫概述或骨架：

```
CLAUDE.md                      # 專案概述 + 常用指令 + 關鍵規則 + @docs 引用
docs/
├── README.md                  # 項目介紹、快速開始、技術棧
├── ARCHITECTURE.md            # 架構、目錄結構、資料流
├── DEVELOPMENT.md             # 開發規範、命名規則、計畫歸檔流程
├── FEATURES.md                # 功能清單與完成狀態（含功能行為描述）
├── TESTING.md                 # 測試規範與指南
├── CHANGELOG.md               # 更新日誌
└── plans/                     # 開發計畫目錄
    └── archive/               # 已完成計畫歸檔
```

### docs 文件詳細度要求

每份文件必須做到以下程度：

撰寫前先檢視專案，找出「關鍵知識點或技術決策」，判斷標準是：
**若開發者不知道這件事，是否會影響其他模組的開發或整合？**
符合此條件的內容才需要明確記錄進文件。

- **ARCHITECTURE.md**：目錄結構（每個檔案的用途）、啟動流程、API 路由總覽表（前綴、檔案、認證、說明）、統一回應格式範例、認證與授權機制（middleware 行為、JWT 參數、有效期）、資料庫 schema（每張表的欄位、型別、約束）、金流/第三方整合的流程描述
- **FEATURES.md**：每個功能區塊須有行為描述段落，不只是端點表格。包含：查詢參數與預設值、請求 body 的必填/選填欄位、業務邏輯（例如購物車累加、訂單扣庫存的 transaction）、錯誤碼與錯誤情境、非標準機制（例如雙模式認證的流程）
- **DEVELOPMENT.md**：命名規則對照表、模組系統說明、新增 API/middleware/DB 的步驟、環境變數表（變數、用途、必要性、預設值）、JSDoc 格式說明與範例
- **TESTING.md**：測試檔案表、執行順序與依賴關係、輔助函式說明、撰寫新測試的步驟與範例、常見陷阱
- **README.md**：技術棧、快速開始（copy-paste 指令）、常用指令表、文件索引表

### CLAUDE.md 範本結構

```markdown
# CLAUDE.md

## 專案概述

{專案名稱} — {技術棧摘要}

## 常用指令

{從 scripts 偵測}

## 關鍵規則

- {依專案特性列出 3-5 條}
- 功能開發使用 docs/plans/ 記錄計畫；完成後移至 docs/plans/archive/

## 詳細文件

- ./docs/README.md — 項目介紹與快速開始
- ./docs/ARCHITECTURE.md — 架構、目錄結構、資料流
- ./docs/DEVELOPMENT.md — 開發規範、命名規則
- ./docs/FEATURES.md — 功能列表與完成狀態
- ./docs/TESTING.md — 測試規範與指南
- ./docs/CHANGELOG.md — 更新日誌

## 必要遵守項目

- {依專案特性列出 3-5 條}
```

### DEVELOPMENT.md 必須包含計畫歸檔流程

```markdown
## 計畫歸檔流程

1. 計畫檔案命名格式：YYYY-MM-DD-<feature-name>.md
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 docs/plans/archive/
4. 更新 docs/FEATURES.md 和 docs/CHANGELOG.md
```

---

## Phase 1.5：settings.json 基礎設定

建立或更新 `.claude/settings.json`，設定 sandbox 模式和基礎權限。此階段向使用者展示預設設定，確認後寫入。

### 預設設定（根據偵測到的專案類型調整）

**Node.js 專案預設：**

```json
{
  "permissions": {
    "allow": [
      "Edit(~/.npm/**)",
      "Read(~/.npm/**)",
      "Write(~/Library/pnpm/**)",
      "Edit(~/Library/pnpm/**)",
      "Read(~/Library/pnpm/**)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(git push *)",
      "Bash(git reset --hard *)"
    ]
  },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowLocalBinding": true,
      "allowedDomains": [
        "registry.npmjs.org",
        "*.npmjs.org",
        "registry.yarnpkg.com",
        "*.github.com",
        "github.com",
        "*.githubusercontent.com",
        "localhost:*"
      ]
    }
  }
}
```

**Python 專案預設：**

```json
{
  "permissions": {
    "allow": [
      "Edit(~/Library/Caches/pip/**)",
      "Read(~/Library/Caches/pip/**)",
      "Edit(~/Library/Caches/pypoetry/**)",
      "Read(~/Library/Caches/pypoetry/**)",
      "Edit(~/.local/share/virtualenvs/**)",
      "Read(~/.local/share/virtualenvs/**)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(git push *)",
      "Bash(git reset --hard *)"
    ]
  },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowLocalBinding": true,
      "allowedDomains": [
        "pypi.org",
        "*.pypi.org",
        "files.pythonhosted.org",
        "*.github.com",
        "github.com",
        "*.githubusercontent.com",
        "localhost:*"
      ]
    }
  }
}
```

### 互動式追加

設定完預設後，詢問使用者是否需要追加額外的 allowed domains（例如第三方 API 網域、CDN 等），直接加入 `allowedDomains` 陣列。

### permissions 說明

| 設定                         | 說明                                                |
| ---------------------------- | --------------------------------------------------- |
| `Read(./**)` / `Write(./**)` | 允許讀寫專案目錄                                    |
| `deny: rm -rf *`             | 禁止遞迴刪除                                        |
| `deny: sudo *`               | 禁止 sudo                                           |
| `deny: git push *`           | 禁止直接 push（需使用者手動確認）                   |
| `deny: git reset --hard *`   | 禁止強制 reset                                      |
| `autoAllowBashIfSandboxed`   | sandbox 內的 Bash 指令（npm、npx、node 等）自動允許 |
| `allowLocalBinding`          | 允許本機 server 啟動（開發伺服器用）                |

### 合併策略

如果 `.claude/settings.json` 已存在，**合併** permissions 和 sandbox 設定，不覆蓋已有的 allow/deny 規則和 allowedDomains。

---

## Phase 2：Rules

向使用者展示可選的 rules 清單（多選），根據偵測結果標記推薦項目。

**paths 作用範圍為動態**，根據偵測到的實際目錄結構自動設定：

| #   | 選項            | 說明                                                    | 動態 paths 邏輯                                                    |
| --- | --------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | API 設計規則    | 回應格式、路由命名、API 文件註解                        | 偵測路由目錄（`src/routes/**`、`app/api/**`、`*/views.py`）        |
| 2   | 資料庫規則      | 欄位命名、型別約束、建表/遷移模式                       | 偵測 ORM/DB 檔案（`src/database.*`、`src/models/**`、`prisma/**`） |
| 3   | 測試規則        | 框架、執行順序、輔助函式、setup 檔案                    | 偵測測試目錄（`tests/**`、`__tests__/**`、`spec/**`）              |
| 4   | 前端/模板規則   | 模板引擎、CSS 框架慣例、XSS 防護                        | 偵測前端目錄（`views/**`、`src/components/**`、`templates/**`）    |
| 5   | Git Commit 規則 | message 格式（type: 描述）、type 類型、禁止 commit 檔案 | 全域（無 paths）                                                   |
| 6   | 安全性規則      | 輸入驗證、injection 防護、密碼處理、CORS                | 全域（無 paths）                                                   |

### rules/ 檔案格式

```markdown
---
paths:
  - "{動態偵測的路徑}"
---

# 規則標題

- 規則一
- 規則二
```

---

## Phase 3：Hooks

向使用者展示可選的 hooks 清單（多選），根據偵測結果標記推薦項目。

| #   | 選項              | Hook 事件               | Matcher       | 說明                                                                           |
| --- | ----------------- | ----------------------- | ------------- | ------------------------------------------------------------------------------ |
| 1   | 敏感檔案保護      | `PreToolUse`            | `Edit\|Write` | 建立 `.claude/hooks/protect-files.sh`，阻止編輯 `.env`、`*.lock`、`.sqlite` 等 |
| 2   | 自動格式化        | `PostToolUse`           | `Edit\|Write` | 編輯後自動執行 prettier/eslint --fix（偵測專案使用的格式化工具）               |
| 3   | 自動產生 API 文件 | `PostToolUse`           | `Edit\|Write` | 建立 `.claude/hooks/auto-api-docs.sh`，編輯路由檔後自動產生 API 文件           |
| 4   | Compact 提醒      | `SessionStart`          | `compact`     | context 壓縮後重新注入專案關鍵規則（內容從 CLAUDE.md 摘錄）                    |
| 5   | 自動跑測試        | `PostToolUse`           | `Edit\|Write` | 編輯原始碼後自動執行對應測試                                                   |
| 6   | 通知提醒          | `Notification` + `Stop` | `""`          | 等待確認時 macOS 通知 + 任務完成時通知加音效（afplay Glass.aiff）              |

### hooks 建立規則

- 需要腳本的 hook（#1、#2、#3、#5）自動建立 `.claude/hooks/*.sh` 並 chmod +x
- hook 設定寫入 `.claude/settings.json` 的 `hooks` 區塊
- 如果 `settings.json` 已存在 hooks，**合併**而非覆蓋
- 通知 hook（#6）建議放在 `~/.claude/settings.json`（全域），skill 會詢問使用者偏好

---

## Phase 4：Agents

向使用者展示可選的 agents 清單（多選），每個 agent 配有 `color` 和 `model`。

| #   | 選項       | Model  | Color   | Tools                  | 說明                                                                                       |
| --- | ---------- | ------ | ------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| 1   | 程式碼審查 | opus   | blue    | Read, Grep, Glob, Bash | 審查品質、安全性、命名規範、回應格式一致性，並檢視是否符合前述 Rules 中定義的規範          |
| 2   | 測試執行   | sonnet | green   | Bash, Read, Grep       | 跑測試、分析失敗原因、提供修復建議（不直接修改）                                           |
| 3   | 除錯專家   | opus   | red     | Read, Edit, Bash, Grep | 捕捉錯誤、重現問題、實施最小修復                                                           |
| 4   | 文件撰寫   | sonnet | yellow  | Read, Write, Edit      | 撰寫 README、API 文件、使用指南                                                            |
| 5   | 安全審計   | opus   | magenta | Read, Grep, Glob, Bash | 檢查密碼暴露、injection、XSS、CSRF                                                         |
| 6   | 重構助手   | opus   | cyan    | Read, Edit, Grep, Glob | 提取共用函式、消除重複、改善命名                                                           |
| 7   | Git Commit | sonnet | white   | Bash, Read, Grep       | 分析變更、產生符合規範的 commit message、執行 commit。Commit message 不加入 Co-Authored-By |

### agent 檔案格式

每個 agent 建立為 `.claude/agents/{name}.md`：

```markdown
---
name: { name }
description: { 說明 }
model: { model }
color: { color }
tools:
  - { tool1 }
  - { tool2 }
---

{agent 的系統提示詞，根據偵測到的專案技術棧客製化}
```

agent 的系統提示詞應根據偵測到的技術棧客製化。例如：

- 偵測到 Express → code-reviewer 會特別檢查 `{ data, error, message }` 回應格式
- 偵測到 SQLite → security-auditor 會特別檢查 SQL parameterization
- 偵測到 Vitest → test-runner 會知道測試框架和執行方式

---

## Phase 5：摘要輸出

完成後列出：

- 建立了哪些檔案（含檔案路徑）
- 每個檔案的用途（一句話）
- 下一步建議（例如：填入具體的架構內容、在其他專案試用本 skill）

---

## 設計原則

1. **智慧偵測 + 確認** — 先自動偵測，推薦選項，讓開發者確認後才建立
2. **動態 paths** — rules 的作用範圍根據實際目錄結構決定，不寫死路徑
3. **冪等性** — 已存在的檔案不覆蓋，只補缺少的部分
4. **合併而非覆蓋** — settings.json 的 hooks 區塊採合併策略
5. **技術棧客製化** — agent 提示詞、hook 腳本內容根據偵測到的技術棧調整

提醒：當專案成長後，文件超過約 500 行時建議拆分為子資料夾，主文件保留概述和連結。
