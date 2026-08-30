import type { WilsonAction } from "@/lib/types";
import type { SliderQuestionProps } from "@/components/SliderQuestion";

export type QualificationSliderAction = Extract<
  WilsonAction,
  "ask_budget" | "ask_company_size" | "ask_timeframe"
>;

export type QualificationSliderConfig = Omit<
  SliderQuestionProps,
  "disabled" | "onSubmit"
>;

const TIMEFRAME_LABELS = [
  "sofort",
  "1–3 Monate",
  "3–6 Monate",
  "6–12 Monate",
  "später als 12 Monate",
];

function formatEuro(value: number, max: number) {
  return value >= max
    ? `${max.toLocaleString("de-DE")} € +`
    : `${value.toLocaleString("de-DE")} €`;
}

export const QUALIFICATION_SLIDERS: Record<
  QualificationSliderAction,
  QualificationSliderConfig
> = {
  ask_budget: {
    intro: "Welches Budget steht für dieses Projekt ungefähr zur Verfügung?",
    min: 0,
    max: 20_000,
    step: 500,
    defaultValue: 5_000,
    formatValue: (value) => formatEuro(value, 20_000),
    buildMessage: (formatted) => `Unser Budget liegt bei etwa ${formatted}.`,
  },
  ask_company_size: {
    intro: "Wie groß ist Ihr Unternehmen ungefähr?",
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 10,
    formatValue: (value) =>
      value >= 100 ? "100+ Mitarbeitende" : `${value} Mitarbeitende`,
    buildMessage: (formatted) =>
      `Wir sind ein Unternehmen mit ${formatted}.`,
  },
  ask_timeframe: {
    intro: "In welchem Zeitraum soll das umgesetzt werden?",
    min: 0,
    max: TIMEFRAME_LABELS.length - 1,
    step: 1,
    defaultValue: 1,
    formatValue: (value) => TIMEFRAME_LABELS[value],
    buildMessage: (formatted) => `Der gewünschte Zeitraum ist ${formatted}.`,
  },
};

export function isQualificationSliderAction(
  action: WilsonAction | undefined
): action is QualificationSliderAction {
  return action !== undefined && action in QUALIFICATION_SLIDERS;
}
