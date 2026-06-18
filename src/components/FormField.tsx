type Props = {
  label: string;
  name: string;
  type?: "text" | "textarea" | "number" | "select";
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  step?: string;
};

export default function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  options,
  rows = 3,
  step,
}: Props) {
  const inputClass =
    "w-full rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors";

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-neutral-400">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          placeholder={placeholder}
          rows={rows}
          className={inputClass + " resize-y"}
        />
      ) : type === "select" && options ? (
        <select
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          className={inputClass}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type === "number" ? "number" : "text"}
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          placeholder={placeholder}
          step={step}
          className={inputClass}
        />
      )}
    </div>
  );
}
