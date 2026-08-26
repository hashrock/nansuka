import { Head } from "@inertiajs/react";
import "../App.css";

export default function Landing({ error }: { error: string | null }) {
  return (
    <>
      <Head title="Nansuka" />
      <div className="landing">
        <img src="/logo.svg" alt="" className="landing-logo" />
        <h1>Nansuka</h1>
        <p className="lead">
          原文と訳文を2カラムのテーブルで並べて扱う翻訳ツール。
          段落ごとに翻訳し、直した訳文はそのまま残ります。
        </p>

        {error && (
          <p className="error">ログインに失敗しました。もう一度お試しください。</p>
        )}

        {/* Inertiaのリンクではなく通常の遷移。OAuthはページ全体の移動が要る。 */}
        <a className="login-btn" href="/auth/google">
          Google でログイン
        </a>

        <ul className="landing-points">
          <li>Excel と行き来できる2カラムのグリッド</li>
          <li>段落単位の翻訳。直した訳文は上書きされない</li>
          <li>ノートに保存して続きから編集</li>
        </ul>
      </div>
    </>
  );
}
