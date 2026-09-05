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

/** よく使う指示の雛形。押すと入力欄に流し込むだけで、保存は別。 */
export const PROMPT_PRESETS: { label: string; prompt: string }[] = [
  {
    label: "校正",
    prompt:
      "あなたは日本語の校正者です。各段落の誤字脱字・不自然な表現・敬体の乱れを直し、修正後の文だけを返してください。翻訳はしないでください。",
  },
  {
    label: "1 文要約",
    prompt: "各段落を、その段落と同じ言語で 1 文に要約してください。",
  },
  {
    label: "言い換え",
    prompt:
      "各段落を、意味を変えずに同じ言語で別の言い回しに書き換えてください。文の数はおおむね保ってください。",
  },
  {
    label: "平易化",
    prompt:
      "各段落を、専門用語を避けて中学生にも分かる同じ言語の文章に書き直してください。",
  },
];

/**
 * 画面の文言。独自プロンプトのときは「翻訳」「訳文」だと嘘になるので
 * 汎用的な言葉に切り替える。
 */
export interface OutputLabels {
  /** 右カラムの見出し */
  column: string;
  /** 右カラムを作り直す操作 */
  regenerate: string;
}

export function outputLabels(hasCustomPrompt: boolean): OutputLabels {
  return hasCustomPrompt
    ? { column: "出力", regenerate: "再生成" }
    : { column: "訳文", regenerate: "再翻訳" };
}

/**
 * 空白だけなら「未設定」とみなし、長すぎれば切る。
 * 切った位置が語の途中だと末尾に空白が残るので、切ったあとにもう一度落とす。
 */
export function normalizePrompt(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, PROMPT_MAX_LENGTH).trimEnd();
}
