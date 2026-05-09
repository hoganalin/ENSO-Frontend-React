# TEST_SKILL — Vitest 單元測試規範

## 觸發時機

撰寫或新增單元測試時讀取此 skill。

## 安裝（首次使用）

```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom @testing-library/jest-dom
```

在 vite.config.js 加入：

```js
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/test/setup.ts',
}
```

建立 src/test/setup.ts：

```ts
import "@testing-library/jest-dom";
```

## 測試優先順序

1. Redux Slice — 純函式，最容易測，報酬率最高
2. 自訂 Hook — useMessage 的 showSuccess / showError 行為
3. UI 元件 — 只測互動行為（點擊、送出），不測視覺

## Slice 測試模板

```ts
import { describe, it, expect } from "vitest";
import reducer from "@/slice/cartSlice";

describe("cartSlice", () => {
  it("should return initial state", () => {
    expect(reducer(undefined, { type: "" })).toBeDefined();
  });
});
```

## 元件測試模板

```tsx
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { store } from "@/store/store";
import ProductCard from "@/components/ProductCard";

const renderWithStore = (ui: React.ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

describe("ProductCard", () => {
  it("renders product title", () => {
    renderWithStore(<ProductCard title="沉香線香" />);
    expect(screen.getByText("沉香線香")).toBeInTheDocument();
  });
});
```
