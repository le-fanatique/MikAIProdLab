export type TextInputKind = "positive" | "negative" | "style" | "generic";

export type FillSource = {
  id: string;
  label: string;
  text: string;
  kinds?: TextInputKind[];
};

const NEGATIVE_RE = /negative/i;
const STYLE_RE = /style|aesthetic|look|feel|mood|atmosphere|visual/i;

export function detectTextInputKind(label: string): TextInputKind {
  if (NEGATIVE_RE.test(label)) return "negative";
  if (STYLE_RE.test(label)) return "style";
  return "generic";
}
