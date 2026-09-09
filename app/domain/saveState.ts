/**
 * 自動保存の結果を、利用者に見せる文言へ変える。
 *
 * ユーザテスト (#2) で「保存できませんでした」だけが赤く出続け、理由も対処も
 * 分からず、再読み込みで入力が消えた。失敗の種類ごとに何が起きたか・どうすれば
 * よいかを短く伝え、本文はブラウザ側に残していることを知らせる。
 */

export type SaveFailure =
  /** 401: ログインが切れた。 */
  | "unauthorized"
  /** 404: 自分のノートとして見つからない (削除済み、別アカウントに切り替わった)。 */
  | "not-found"
  /** 5xx やその他のステータス。 */
  | "server"
  /** fetch 自体が失敗 (オフラインなど)。 */
  | "network";

export function classifySaveFailure(status: number | null): SaveFailure {
  if (status === null) return "network";
  if (status === 401) return "unauthorized";
  if (status === 404) return "not-found";
  return "server";
}

const FAILURE_MESSAGES: Record<SaveFailure, string> = {
  unauthorized: "ログインが切れたため保存できません",
  "not-found": "このノートに保存できません (削除されたか、別のアカウントに切り替わりました)",
  server: "サーバーの都合で保存できませんでした",
  network: "通信できず保存できませんでした",
};

/** 見出し横に出す短い一文。 */
export function saveFailureMessage(failure: SaveFailure): string {
  return FAILURE_MESSAGES[failure];
}

/**
 * 失敗の説明に添える対処。本文をこのブラウザに残すので、どちらの場合も
 * 入力が消えることはないと伝える。
 */
export function saveFailureAdvice(failure: SaveFailure): string {
  switch (failure) {
    case "unauthorized":
    case "not-found":
      return "入力内容はこのブラウザに残しています。ノート一覧を開くと「ノートとして取り込む」から復元できます。";
    case "server":
    case "network":
      return "入力内容はこのブラウザに残しています。しばらく待ってから「再試行」を押してください。";
  }
}

/** 再試行で直る見込みがある失敗か。ログイン切れや所有者違いは押しても変わらない。 */
export function canRetrySave(failure: SaveFailure): boolean {
  return failure === "server" || failure === "network";
}
