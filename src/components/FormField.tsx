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
    "w-full rounded bg-[#0d0e10] border border-[#2c3035] px-3 py-2 text-sm text-[#e7e9ec] placeholder-[#3a4046] focus:outline-none focus:border-[#3a4046] transition-colors";

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-[#a4abb2]">
        {label}
        {required && <span className="text-[#cf7b6b] ml-1">*</span>}
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
