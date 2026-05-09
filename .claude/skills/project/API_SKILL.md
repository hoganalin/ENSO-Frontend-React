# API_SKILL — Axios API 服務層規範

## 觸發時機

新增任何 API 呼叫函式時讀取此 skill。

## 兩種 Axios Instance（src/services/api.ts）

- api — 公開請求，不需驗證（商品列表等）
- adminApi — 需要 hexToken cookie，401/403 自動導向 #/login

## 環境變數

- VITE_API_BASE: https://ec-course-api.hexschool.io/v2
- VITE_API_PATH: rogan

## 標準 API 函式模板

```ts
import { api, adminApi } from "@/services/api";

interface FeatureResponse {
  success: boolean;
  message: string;
  data: FeatureType;
}

// 公開 API
export const getFeatureApi = async () => {
  const res = await api.get<FeatureResponse>(
    `/api/${import.meta.env.VITE_API_PATH}/feature`,
  );
  return res.data;
};

// 需驗證 API
export const createFeatureApi = async (payload: FeaturePayload) => {
  const res = await adminApi.post<FeatureResponse>(
    `/api/${import.meta.env.VITE_API_PATH}/feature`,
    payload,
  );
  return res.data;
};
```

## 搭配 useMessage 顯示回饋

```tsx
import { useMessage } from "@/hooks/useMessage";

const { showSuccess, showError } = useMessage();

const handleSubmit = async () => {
  try {
    await createFeatureApi(data);
    showSuccess("操作成功！");
  } catch {
    showError("操作失敗，請稍後再試");
  }
};
```
