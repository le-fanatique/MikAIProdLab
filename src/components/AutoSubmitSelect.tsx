"use client";

// ---------------------------------------------------------------------------
// AutoSubmitSelect.tsx — LLMW.BENCH.CASCADE.1
//
// A plain <select> that submits its enclosing <form> on change. No business
// logic: options, current value, and `name` all come from the server via
// props — this component only renders and submits. `requestSubmit()` (not
// `submit()`) so the form's normal submit path — validation, any submit
// handlers — still runs. Without JavaScript this control behaves like an
// ordinary <select>; the form's own submit button remains the path to apply
// a selection.
//
// One shared component for every auto-submitting <select> in the LLM
// Workflows bench entity selector (Project, Sequence, Shot, Asset, Mode),
// rather than one bespoke component per level.
// ---------------------------------------------------------------------------

type Option = { value: string; label: string };

type Props = {
  name: string;
  defaultValue: string;
  options: Option[];
  placeholder?: string;
  className?: string;
};

export default function AutoSubmitSelect({ name, defaultValue, options, placeholder, className }: Props) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={className}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
