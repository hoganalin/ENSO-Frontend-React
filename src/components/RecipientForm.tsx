import { useForm } from "react-hook-form";

export interface Recipient { name: string; email: string; tel: string; address: string }
interface RecipientFormProps {
  onSubmit: (recipient: Recipient) => Promise<void>;
  busy: boolean;
  error: string | null;
}

export default function RecipientForm({ onSubmit, busy, error }: RecipientFormProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Recipient>();
  const fields = [
    { key: "name", label: "收件人姓名", autoComplete: "name", type: "text", maxLength: 80 },
    { key: "email", label: "電子郵件", autoComplete: "email", type: "email", maxLength: 254 },
    { key: "tel", label: "手機號碼", autoComplete: "tel", type: "tel", maxLength: 20 },
    { key: "address", label: "收件地址（含縣市、區及門牌）", autoComplete: "street-address", type: "text", maxLength: 300 },
  ] as const;
  return <form noValidate onSubmit={handleSubmit(async (data) => {
    await onSubmit({ name: data.name.trim(), email: data.email.trim(), tel: data.tel.replace(/[\s-]/g, ""), address: data.address.trim() });
  })} className="mt-4">
    <fieldset disabled={busy || isSubmitting}>
      <legend>收件資料</legend>
      <p>所有欄位皆為必填，請確認資料以便配送及聯繫。</p>
      {fields.map(({ key, label, ...props }) => <div className="mb-3" key={key}>
        <label className="form-label" htmlFor={`recipient-${key}`}>{label}</label>
        <input {...props} id={`recipient-${key}`} className="form-control" required
          aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `${key}-error` : undefined}
          {...register(key, { validate: (value) => {
            const clean = value.trim();
            if (!clean) return `請填寫${label}`;
            if (key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "請填寫有效的電子郵件";
            if (key === "tel" && !/^09\d{8}$/.test(clean.replace(/[\s-]/g, ""))) return "請填寫 09 開頭的 10 碼手機號碼";
            if (key === "address" && clean.length < 6) return "請填寫完整收件地址";
            return true;
          } })} />
        {errors[key] && <p role="alert" id={`${key}-error`} className="mt-1">{errors[key]?.message}</p>}
      </div>)}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="btn-gold" disabled={busy || isSubmitting}>{busy || isSubmitting ? "建立訂單中…" : "確認訂單並前往付款"}</button>
    </fieldset>
  </form>;
}
