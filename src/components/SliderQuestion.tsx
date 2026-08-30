"use client";

import { useState } from "react";

export interface SliderQuestionProps {
  intro: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  formatValue: (value: number) => string;
  buildMessage: (formattedValue: string) => string;
  disabled: boolean;
  onSubmit: (text: string) => void;
}

export default function SliderQuestion({
  intro,
  min,
  max,
  step,
  defaultValue,
  formatValue,
  buildMessage,
  disabled,
  onSubmit,
}: SliderQuestionProps) {
  const [value, setValue] = useState(defaultValue);
  const [submittedLabel, setSubmittedLabel] = useState<string | null>(null);

  const formatted = formatValue(value);
  const progress = ((value - min) / (max - min)) * 100;

  function handleConfirm() {
    setSubmittedLabel(formatted);
    onSubmit(buildMessage(formatted));
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] rounded-lg border border-[#1F3B5C] bg-[#142540] p-4 sm:max-w-[75%]">
        {submittedLabel ? (
          <p className="text-[15px] leading-relaxed text-white">
            <span className="text-[#34D399]">✓</span> Ausgewählt:{" "}
            <strong>{submittedLabel}</strong>
          </p>
        ) : (
          <>
            <p className="text-[15px] leading-relaxed text-white">{intro}</p>

            <p className="mt-3 text-2xl font-bold text-[#22D3EE]">
              {formatted}
            </p>

            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(Number(e.target.value))}
              aria-label={intro}
              className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full accent-[#22D3EE] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: `linear-gradient(to right, #22D3EE ${progress}%, #1F3B5C ${progress}%)`,
              }}
            />

            <button
              type="button"
              onClick={handleConfirm}
              disabled={disabled}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#22D3EE] px-4 py-2 text-sm font-medium text-[#0E1F37] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Bestätigen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
