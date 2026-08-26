/** サーバーのセッションとクライアントのページで共有する、ログイン中のユーザー像。 */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
};
