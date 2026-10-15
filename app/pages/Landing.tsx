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
          英語の記事やドキュメントを、段落ごとの対訳で読む。
          URL を貼るだけで原文と訳文が1行ずつ並びます。
        </p>

        {error && (
          <p className="error">ログインに失敗しました。もう一度お試しください。</p>
        )}

        {/* Inertiaのリンクではなく通常の遷移。OAuthはページ全体の移動が要る。 */}
        <a className="login-btn" href="/auth/google">
          Google でログイン
        </a>

        <ul className="landing-points">
          <li>URL やブックマークレットから、記事をそのまま対訳ノートに</li>
          <li>段落単位の翻訳。要約や校正などプロンプトも差し替えられる</li>
          <li>Excel と行き来できる2カラムのグリッド。直した訳文は上書きされない</li>
        </ul>
      </div>
      {/* ヘッダの無い画面なので右上の角に浮かせる */}
      <hashrock-switcher floating="" theme="light" />
    </>
  );
}
