# UI_SKILL — 禪香線香樣式規範

## 觸發時機

撰寫或修改 UI 樣式、設計元件視覺時讀取此 skill。

## 技術架構

- Bootstrap 5（全域 class 優先）
- SCSS sass-embedded（src/assets/）
- Bootstrap Icons + Font Awesome 7
- 變數檔：src/assets/\_variables.scss

## Bootstrap 使用原則

- 排版優先用 utility：container / row / col-\*
- 間距用 mt-_ / mb-_ / p-\* 等，不要硬寫 margin
- 按鈕：btn btn-primary 或 btn-outline-\*
- 響應式 mobile-first，斷點：sm（576）/ md（768）/ lg（992）
- 自訂樣式才寫 SCSS，不要 override Bootstrap 核心

## SCSS 規範

```scss
// 使用 _variables.scss 中的變數，不要在元件內直接寫色碼
$primary: #8b6914; // 主色 — 禪金
$secondary: #5c4a2a; // 輔色 — 深木
$accent: #c4a35a; // 強調 — 榛金
$bg-warm: #faf6f0; // 頁面背景

// 元件 SCSS 使用 BEM 命名
.product-card {
  &__image {
  }
  &__body {
  }
  &__title {
    color: $primary;
  }
  &--featured {
  }
}
```

## 品牌視覺原則

- 大地色、木質感為主：棕褐、榛金、米白，避免高飽和色
- Swiper 輪播只在首頁使用
- hover 動畫不超過 300ms，transition 用 ease-out
- 圖片容器用 aspect-ratio 固定比例，避免版型跳動
