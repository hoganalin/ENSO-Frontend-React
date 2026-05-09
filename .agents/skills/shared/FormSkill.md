# FORM_SKILL — react-hook-form 表單規範

## 觸發時機

建立任何含有表單輸入的元件時讀取此 skill。

## 現有表單參考

- 最完整範例：src/components/Checkout.tsx
- 登入：src/components/Login.tsx
- 聯絡：src/components/Contact.tsx

## 標準表單模板

```tsx
import { useForm } from "react-hook-form";
import { useMessage } from "@/hooks/useMessage";

interface FormData {
  name: string;
  email: string;
  phone: string;
}

const {
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
  reset,
} = useForm<FormData>();

const { showSuccess, showError } = useMessage();

const onSubmit = async (data: FormData) => {
  try {
    await someApi(data);
    showSuccess("送出成功！");
    reset();
  } catch {
    showError("送出失敗，請稍後再試");
  }
};
```

## 表單 JSX + Bootstrap 5 錯誤顯示

```tsx
<form onSubmit={handleSubmit(onSubmit)}>
  <div className="mb-3">
    <label className="form-label">姓名</label>
    <input
      {...register("name", { required: "請填寫姓名" })}
      className={`form-control ${errors.name ? "is-invalid" : ""}`}
    />
    {errors.name && (
      <div className="invalid-feedback">{errors.name.message}</div>
    )}
  </div>

  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
    {isSubmitting ? "送出中..." : "送出"}
  </button>
</form>
```

## 常用驗證規則

```tsx
required: '此欄位為必填'

minLength: { value: 2, message: '至少 2 個字' }

// Email
pattern: {
  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  message: 'Email 格式不正確'
}

// 台灣手機
pattern: {
  value: /^09\d{8}$/,
  message: '手機格式不正確（09xxxxxxxx）'
}
```
