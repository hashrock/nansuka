import { useEffect, useRef } from "react";
import {
  DEFAULT_STYLE,
  isDefaultStyle,
  lengthToSlider,
  sliderToLength,
  type StyleParams,
} from "../domain/style";

type StyleKey = keyof StyleParams;

const SLIDERS: { key: StyleKey; label: string; low: string; high: string }[] = [
  { key: "length", label: "文章長", low: "50%", high: "200%" },
  { key: "concise", label: "簡潔さ", low: "説明的", high: "簡潔" },
  { key: "friendly", label: "フレンドリーさ", low: "フォーマル", high: "カジュアル" },
];

interface Props {
  style: StyleParams;
  /** ドラッグ中も含め値が動くたびに呼ばれる (プレビュー用)。 */
  onChange: (style: StyleParams) => void;
  /** つまみを離した / キー操作を終えたときに呼ばれる (再翻訳用)。 */
  onRelease: (style: StyleParams) => void;
  /** 文章長スライダーをドラッグしている間だけ true にする。 */
  onDragLength: (dragging: boolean) => void;
  onClose: () => void;
}

export function StylePanel({ style, onChange, onRelease, onDragLength, onClose }: Props) {
  // ドラッグ中はつまみがスライダーの外で離されることがあるので、
  // window の pointerup で確定させる。
  const activeRef = useRef<StyleKey | null>(null);
  const styleRef = useRef(style);
  styleRef.current = style;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;
  const onDragLengthRef = useRef(onDragLength);
  onDragLengthRef.current = onDragLength;

  useEffect(() => {
    const up = () => {
      const key = activeRef.current;
      if (!key) return;
      activeRef.current = null;
      if (key === "length") onDragLengthRef.current(false);
      onReleaseRef.current(styleRef.current);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const reset = () => {
    onChange(DEFAULT_STYLE);
    onRelease(DEFAULT_STYLE);
  };

  return (
    <aside className="style-panel" aria-label="文章調整">
      <div className="style-panel-header">
        <span>文章調整</span>
        <button className="close-btn" onClick={onClose} aria-label="閉じる">
          &times;
        </button>
      </div>

      {SLIDERS.map(({ key, label, low, high }) => (
        <label key={key} className="style-slider">
          <span className="style-slider-label">
            {label}
            <span className="style-slider-value">
              {key === "length" ? `${style.length}%` : style[key]}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={key === "length" ? lengthToSlider(style.length) : style[key]}
            onPointerDown={() => {
              activeRef.current = key;
              if (key === "length") onDragLength(true);
            }}
            onChange={(e) => {
              const raw = Number(e.target.value);
              onChange({
                ...style,
                [key]: key === "length" ? sliderToLength(raw) : raw,
              });
            }}
            // キーボード操作はキーを離すたびに確定 (debounce は呼び出し側)。
            onKeyUp={() => {
              if (!activeRef.current) onRelease(styleRef.current);
            }}
          />
          <span className="style-slider-ends">
            <span>{low}</span>
            <span>{high}</span>
          </span>
        </label>
      ))}

      <button
        className="tool-btn style-panel-reset"
        onClick={reset}
        disabled={isDefaultStyle(style)}
      >
        リセット
      </button>
      <p className="style-panel-hint">
        つまみを離すと、選択中の行を再翻訳します。
      </p>
    </aside>
  );
}
