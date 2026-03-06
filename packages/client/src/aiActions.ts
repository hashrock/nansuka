export interface AiAction {
  label: string;
  urlTemplate: string;
  promptPrefix?: string;
}

export const AI_ACTIONS: AiAction[] = [
  {
    label: "ChatGPTで解説",
    urlTemplate: "https://chatgpt.com/?q=",
    promptPrefix:
      "以下の英文について、文法構造・語彙・表現のポイントを日本語で解説してください:\n\n",
  },
  {
    label: "ChatGPTでバリエーション",
    urlTemplate: "https://chatgpt.com/?q=",
    promptPrefix: "以下の英文の別の言い方（言い換え表現）を教えてください:\n\n",
  },
  {
    label: "Claudeで解説",
    urlTemplate: "https://claude.ai/?q=",
    promptPrefix:
      "以下の英文について、文法構造・語彙・表現のポイントを日本語で解説してください:\n\n",
  },
  {
    label: "Claudeでバリエーション",
    urlTemplate: "https://claude.ai/?q=",
    promptPrefix: "以下の英文の別の言い方（言い換え表現）を教えてください:\n\n",
  },
];

export function getSelectedTextInElement(element: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return "";

  return selection.toString().trim();
}

export function handleAiAction(
  action: AiAction,
  translated: string,
  textElement: HTMLElement | null,
): void {
  const selectedText = textElement ? getSelectedTextInElement(textElement) : "";
  const textToSend = selectedText || translated;
  const fullPrompt = (action.promptPrefix || "") + textToSend;
  const url = action.urlTemplate + encodeURIComponent(fullPrompt);
  window.open(url, "_blank");
}
