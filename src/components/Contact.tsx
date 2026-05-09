import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import Swal from "sweetalert2";

import { emailValidation } from "../assets/utils/validation";
import { KanjiDivider } from "./atoms";

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const Contact = (): JSX.Element => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormData>({ mode: "onTouched" });
  const [submitted, setSubmitted] = useState(false);

  const onSubmit: SubmitHandler<ContactFormData> = async (data) => {
    console.log("聯絡表單資料：", data);
    setSubmitted(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      reset();
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "訊息已成功送出，我們將儘快與您聯繫！",
        showConfirmButton: false, timer: 2500, timerProgressBar: true,
      });
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: "error", title: "送出失敗", text: "訊息送出時發生錯誤，請稍後再試。", confirmButtonColor: "#c9a063" });
    } finally {
      setSubmitted(false);
    }
  };

  return (
    <div className="enso-contact">
      <header className="enso-contact__hero">
        <div className="t-eyebrow">Contact</div>
        <h1 className="enso-contact__title">
          聯絡<span className="accent">我們</span>
        </h1>
        <p>任何關於產品或合作的問題，歡迎隨時與我們聯繫。</p>
        <KanjiDivider kanji="信" />
      </header>

      <div className="enso-contact__grid">
        <aside className="enso-contact__info">
          <div className="t-eyebrow">Studio</div>
          <h2>京都・伏見<br />ENSO Atelier</h2>
          <dl>
            <div><dt>Address</dt><dd>京都市伏見区深草1-1-1</dd></div>
            <div><dt>Hours</dt><dd>火 – 日 · 11:00 – 19:00</dd></div>
            <div><dt>Email</dt><dd>hello@enso-kyoto.com</dd></div>
            <div><dt>Phone</dt><dd>+81 75-XXX-XXXX</dd></div>
          </dl>
        </aside>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="enso-contact__form">
          <label>
            <span className="t-eyebrow">姓名</span>
            <input
              type="text"
              className={`input-field-enso ${errors.name ? "is-error" : ""}`}
              placeholder="請輸入姓名"
              {...register("name", { required: "姓名是必填欄位" })}
            />
            {errors.name && <span className="enso-auth__error">{errors.name.message}</span>}
          </label>

          <label>
            <span className="t-eyebrow">Email</span>
            <input
              type="email"
              className={`input-field-enso ${errors.email ? "is-error" : ""}`}
              placeholder="name@example.com"
              {...register("email", emailValidation)}
            />
            {errors.email && <span className="enso-auth__error">{errors.email.message}</span>}
          </label>

          <label>
            <span className="t-eyebrow">主旨</span>
            <select
              className={`input-field-enso ${errors.subject ? "is-error" : ""}`}
              {...register("subject", { required: "請選擇主旨" })}
            >
              <option value="">請選擇諮詢類別</option>
              <option value="order">訂單查詢</option>
              <option value="product">產品諮詢</option>
              <option value="cooperation">合作開發</option>
              <option value="other">其他</option>
            </select>
            {errors.subject && <span className="enso-auth__error">{errors.subject.message}</span>}
          </label>

          <label>
            <span className="t-eyebrow">訊息內容</span>
            <textarea
              className={`input-field-enso ${errors.message ? "is-error" : ""}`}
              rows={5}
              placeholder="請在此輸入您的問題及需求"
              {...register("message", { required: "請輸入訊息內容" })}
            />
            {errors.message && <span className="enso-auth__error">{errors.message.message}</span>}
          </label>

          <button type="submit" className="btn-gold" disabled={submitted}>
            {submitted ? "送出中…" : "傳送訊息"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Contact;
