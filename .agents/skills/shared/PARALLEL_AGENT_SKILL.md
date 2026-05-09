# PARALLEL_AGENT_SKILL — 並行代理人模式

## 觸發時機

當任務涉及以下任一情況時，自動拆分為並行 sub-agents：

- 需要同時建立「API routes + 前端元件」
- 需要同時建立「元件 + 對應測試」
- 需要修改超過 5 個不相依的檔案
- 用戶說「平行處理」、「同時進行」、「用代理人」

---

## 拆分原則

每個 sub-agent 需要：
1. **獨立範疇**：不與其他 agent 修改同一個檔案
2. **明確產出**：說清楚要建立什麼、回傳什麼
3. **共用介面**：拆分前先定義 TypeScript interface，讓各 agent 遵守相同的型別契約

---

## 標準拆法（三軌）

```
Agent A — API 層
  負責：src/services/ 新增 API 函式
  產出：函式名稱、參數型別、回傳型別

Agent B — 元件層
  負責：src/components/ 建立 UI 元件
  產出：元件名稱、props interface

Agent C — 測試層
  負責：src/test/ 撰寫 Vitest 測試
  產出：測試檔案路徑、涵蓋的情境
```

---

## 整合步驟（主 Claude 負責）

1. 等全部 sub-agents 完成
2. 確認介面一致（API 回傳值 ↔ 元件 props ↔ 測試 mock）
3. 跑 `npm test` 確認測試通過
4. 跑 `npx tsc --noEmit` 確認型別無誤

---

## 本專案的標準 prompt 模板

### 新功能模組

```
我要在這個專案加入「[功能名稱]」。

請用並行 sub-agents 處理：

【共用介面】（先定義，三個 agent 都要遵守）
- 資料型別：[說明資料結構]
- API 回傳格式：{ data: [...], total: number }

Agent A — API 層
讀取 src/services/cart.ts 作為參考，在 src/services/ 新增：
- [functionName]Api()
遵守 api.ts 的 Axios instance 規範

Agent B — 元件層
讀取 src/components/ 現有元件作為風格參考，建立：
- [ComponentName].tsx（放在 src/components/）
使用 Bootstrap 5 class，不要 inline style

Agent C — 測試層
讀取 src/test/cartSlice.test.ts 作為模板，建立：
- src/test/[featureName].test.ts
涵蓋：初始狀態、成功情境、失敗情境

全部完成後，整合並跑 npm test。
```

### 大型重構（多檔案）

```
我要重構「[說明]」，影響範圍超過 5 個檔案。

請分析相依關係後拆成獨立群組，用並行 agents 各自處理，
確保各群組之間沒有互相修改同一檔案的衝突。

完成後跑 npx tsc --noEmit 確認型別無誤。
```

---

## 注意事項

- sub-agent 不會自動共享上下文，**必須在 prompt 裡明確說明介面契約**
- 若任務有順序依賴（A 的產出是 B 的輸入），改用**序列模式**，不要強行並行
- 每個 agent prompt 都要包含「讀取哪個檔案作為參考」，避免風格不一致
