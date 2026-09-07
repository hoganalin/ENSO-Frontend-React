// src/components/Login.tsx — 遷移到 Supabase 版本
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import Swal from "sweetalert2";

import { emailValidation } from "../assets/utils/validation";
import { loginSuccess } from "../slice/authSlice";
import { Seigaiha, KanjiDivider } from "./atoms";
import type { AppDispatch } from "../store/store";
import * as db from "../services/db";

interface LoginFormData {
  email: string;
  password: string;
}

const Login = (): JSX.Element => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ mode: "onTouched" });

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams] = useSearchParams();

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    setLoading(true);
    try {
      // 使用 Supabase 登入
      const authResponse = await db.auth.signIn(data.email, data.password);

      // 取得目前使用者的 profile（包含身分、推薦碼等）
      const profile = await db.auth.getCurrentProfile();

      if (!profile) {
        throw new Error("無法取得使用者資訊");
      }

      // 存儲登入訊息到 localStorage（供其他頁面使用）
      localStorage.setItem("auth", JSON.stringify({
        user: {
          email: data.email,
          id: authResponse.user?.id,
          profile,
        },
        isAuthenticated: true,
      }));

      // 發送到 Redux
      dispatch(loginSuccess({
        token: authResponse.session?.access_token || "",
        user: {
          email: data.email,
          id: authResponse.user?.id,
          profile,
        },
      }));

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "登入成功！",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });

      // 重定向到來源頁面或首頁
      const redirectUrl = searchParams.get("redirect") || "/";
      navigate(redirectUrl);
    } catch (error: unknown) {
      console.error("登入失敗:", error);
      const message = error instanceof Error ? error.message : "請檢查帳號密碼";
      Swal.fire({
        icon: "error",
        title: "登入失敗",
        text: message,
        confirmButtonColor: "#c9a063",
      });
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
        <div className="t-eyebrow" style={{ textAlign: "center" }}>Sign In</div>
        <h2 className="enso-auth__title">登入 <span className="accent">ENSO</span></h2>
        <p className="enso-auth__sub">歡迎回來，請登入您的帳號。</p>

        <KanjiDivider kanji="入" />

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="enso-auth__form">
          <label className="enso-auth__field">
            <span className="t-eyebrow">Email</span>
            <input
              type="email"
              className={`input-field-enso ${errors.email ? "is-error" : ""}`}
              placeholder="name@example.com"
              {...register("email", emailValidation)}
            />
            {errors.email && <span className="enso-auth__error">{errors.email.message}</span>}
          </label>

          <label className="enso-auth__field">
            <span className="t-eyebrow">Password</span>
            <input
              type="password"
              className={`input-field-enso ${errors.password ? "is-error" : ""}`}
              placeholder="請輸入密碼"
              {...register("password", { required: "密碼是必填欄位" })}
            />
            {errors.password && <span className="enso-auth__error">{errors.password.message}</span>}
          </label>

          <button type="submit" className="btn-gold enso-auth__submit" disabled={loading}>
            {loading ? "登入中…" : "立即登入"}
          </button>
        </form>

        <div className="enso-auth__switch">
          還沒有帳號？
          <Link to="/register">立即註冊</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
