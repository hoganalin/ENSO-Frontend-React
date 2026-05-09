# COMPONENT_SKILL — 禪香線香元件規範

## 觸發時機

建立任何新的 React 元件或頁面時，優先讀取此 skill。

## 專案環境

- React 19 + TypeScript + Vite 7
- 共用元件：src/components/
- 頁面元件：src/views/frontend/
- 路由：Hash Router，所有路由共享 FrontendLayout

## 元件建立規則

- Props interface 必須定義，命名為 [ComponentName]Props
- 非必要 props 加 ?，禁止使用 any
- 檔案命名 PascalCase（ProductCard.tsx）
- SCSS 用底線前綴（\_productCard.scss）
- import 順序：React → 第三方 → CSS/SCSS → @/alias → 相對路徑 → type
- AOS 已在 FrontendLayout 全域初始化，元件內不需再呼叫 AOS.init()

## 標準元件模板

```tsx
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/store/store";

interface ComponentNameProps {
  title: string;
  onAction?: () => void;
}

const ComponentName: React.FC<ComponentNameProps> = ({ title, onAction }) => {
  const dispatch = useDispatch<AppDispatch>();
  const cart = useSelector((state: RootState) => state.cart);

  return (
    <div className="container" data-aos="fade-up">
      <h2>{title}</h2>
    </div>
  );
};

export default ComponentName;
```

## AOS 動畫規則

- 標準進場：data-aos="fade-up"
- 連續卡片延遲：data-aos-delay="100" 到 "500"，間隔 100ms
- 不過度使用，每個區塊的主要元素才加
