/**
 * 訳文カラムを作るときの指示 (プロンプト)。ノートごとに差し替えられる。
 * 翻訳以外 (要約・言い換え・校正など) にも使えるよう、タスクの部分だけを
 * 差し替え可能にし、出力形式の約束はサーバー側で固定する。
 */

/** 既定のタスク。ノートにプロンプトが無いときはこれを使う。 */
export const DEFAULT_TASK_PROMPT = `You are a professional translator.
Translate each paragraph to the specified target language.`;

/** 1 ノートのプロンプトの上限。暴走を防ぐだけで、実用上は十分な長さ。 */
export const PROMPT_MAX_LENGTH = 4000;

/** 空白だけなら「未設定」とみなし、長すぎれば切る。 */
export function normalizePrompt(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, PROMPT_MAX_LENGTH);
}
