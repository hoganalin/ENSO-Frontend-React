import { useState } from "react";
import { useDispatch } from "react-redux";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import Swal from "sweetalert2";
import axios from "axios";

import { emailValidation } from "../assets/utils/validation";
import { adminApi } from "../services/api";
import { loginSuccess } from "../slice/authSlice";
import { Seigaiha, KanjiDivider } from "./atoms";
import type { AppDispatch } from "../store/store";

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

  const onSubmit: SubmitHandler<LoginFormData> = async (data) => {
    setLoading(true);
    const loginData = { username: data.email, password: data.password };
    try {
      const res = await adminApi.post("/admin/signin", loginData);
      const { token, expired } = res.data;
      const user = { email: data.email };
      localStorage.setItem("auth", JSON.stringify({ token, user, isAuthenticated: true }));
      document.cookie = `hexToken=${token}; expires=${new Date(expired)}; path=/;`;
      dispatch(loginSuccess({ token, user }));
      Swal.fire({
        toast: true, position: "top-end", icon: "success",
        title: "登入成功！", showConfirmButton: false,
        timer: 2000, timerProgressBar: true,
      });
      navigate("/product");
    } catch (error: unknown) {
      console.error(error);
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || "請檢查帳號密碼"
        : "請檢查帳號密碼";
      Swal.fire({ icon: "error", title: "登入失敗", text: message, confirmButtonColor: "#c9a063" });
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
