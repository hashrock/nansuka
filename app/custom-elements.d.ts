import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * repos.hashrock.info が配る Web Component (https://repos.hashrock.info/switcher/v1.js)。
 * スクリプトは root-view.tsx で読み込む。
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hashrock-switcher": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        /** 画面右上の角に浮かせる (ヘッダの無い画面用)。空文字で付ける */
        floating?: "";
        theme?: "light" | "dark";
      };
    }
  }
}
