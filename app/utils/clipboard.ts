/**
 * テキストをクリップボードへ書く。結果を必ず boolean で返す。
 *
 * navigator.clipboard.writeText はウィンドウがフォーカスを失っていると
 * 解決も拒否もせず待ち続けることがあり、await したままトーストが出なかった (#8)。
 * 一定時間で見切って、同期の execCommand("copy") に切り替える。
 */
const ASYNC_TIMEOUT_MS = 700;

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    const result = await Promise.race<boolean | "timeout">([
      navigator.clipboard.writeText(text).then(
        () => true,
        () => false,
      ),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), ASYNC_TIMEOUT_MS),
      ),
    ]);
    if (result === true) return true;
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  const active = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  active?.focus?.({ preventScroll: true });
  return ok;
}
