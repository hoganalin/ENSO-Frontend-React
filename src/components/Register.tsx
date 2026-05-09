import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";

import { emailValidation } from "../assets/utils/validation";
import { Seigaiha, KanjiDivider } from "./atoms";

interface RegisterFormData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const Register = (): JSX.Element => {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({ mode: "onTouched" });

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const passwordValue = watch("password");

  const onSubmit: SubmitHandler<RegisterFormData> = async (data) => {
    setLoading(true);
    try {
      console.log("註冊資料：", data);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "註冊成功！歡迎加入 ENSO。", showConfirmButton: false,
        timer: 2000, timerProgressBar: true,
      });
      navigate("/login");
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: "error", title: "註冊失敗", text: "註冊發生錯誤，請稍後再試。", confirmButtonColor: "#c9a063" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="enso-auth">
      <div className="enso-auth__bg" aria-hidden>
        <Seigaiha opacity={0.06} />
      </div>

      <div className="enso-auth__card">
        <div className="t-eyebrow" style={{ textAlign: "center" }}>Register</div>
        <h2 className="enso-auth__title">加入 <span className="accent">ENSO</span></h2>
        <p className="enso-auth__sub">開啟你的靜謐香氛之旅。</p>

        <KanjiDivider kanji="新" />

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="enso-auth__form">
          <label className="enso-auth__field">
            <span className="t-eyebrow">姓名</span>
            <input
              type="text"
              className={`input-field-enso ${errors.username ? "is-error" : ""}`}
              placeholder="請輸入姓名"
              {...register("username", { required: "姓名是必填的" })}
            />
            {errors.username && <span className="enso-auth__error">{errors.username.message}</span>}
          </label>

          <label className="enso-auth__field">
            <span className="t-eyebrow">Email</span>
            <input
              type="email"
              className={`input-field-enso ${errors.email ? "is-error" : ""}`}
              placeholder="example@mail.com"
              {...register("email", emailValidation)}
            />
            {errors.email && <span className="enso-auth__error">{errors.email.message}</span>}
          </label>

          <label className="enso-auth__field">
            <span className="t-eyebrow">密碼</span>
            <input
              type="password"
              className={`input-field-enso ${errors.password ? "is-error" : ""}`}
              placeholder="請輸入 6 位以上密碼"
              {...register("password", {
                required: "請設定您的密碼",
                minLength: { value: 6, message: "密碼至少需要 6 位數" },
              })}
            />
            {errors.password && <span className="enso-auth__error">{errors.password.message}</span>}
          </label>

          <label className="enso-auth__field">
            <span className="t-eyebrow">確認密碼</span>
            <input
              type="password"
              className={`input-field-enso ${errors.confirmPassword ? "is-error" : ""}`}
              placeholder="請再次輸入密碼"
              {...register("confirmPassword", {
                required: "請再次確認您的密碼",
                validate: (value) => value === passwordValue || "兩次輸入的密碼不一致",
              })}
            />
            {errors.confirmPassword && <span className="enso-auth__error">{errors.confirmPassword.message}</span>}
          </label>

          <button type="submit" className="btn-gold enso-auth__submit" disabled={loading}>
            {loading ? "註冊中…" : "立即註冊"}
          </button>
        </form>

        <div className="enso-auth__switch">
          已經有帳號了？
          <Link to="/login">立即登入</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
