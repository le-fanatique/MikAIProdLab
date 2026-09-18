// INVOKE.SYNC.1 — docs/INVOKE_ROUNDTRIP_SPEC.md §5.3 step 4, ticket §1.5.
// Pure JSX, no state (mikai-method §5) — same split as InvokePushedBanner:
// the caller (each entity page) owns the `invokeSyncImported` /
// `invokeSyncHref` / `invokeSyncError` search-param read and decides WHEN to
// render this, never duplicated here. Renders nothing when there is nothing
// to show — the common case, by design (ticket §1.5: "no visual noise when
// nothing changed").

type Props = {
  importedMessage?: string | null;
  importedHref?: string | null;
  error?: string | null;
};

export default function InvokeSyncBanner({ importedMessage, importedHref, error }: Props) {
  if (!importedMessage && !error) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {error && (
        <div className="rounded border border-[#cf7b6b]/30 bg-[#cf7b6b]/5 px-4 py-3">
          <p className="text-sm text-[#cf7b6b]">{error}</p>
        </div>
      )}
      {importedMessage && (
        <div className="rounded border border-[#6b9e72]/30 bg-[#6b9e72]/5 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-[#6b9e72]">{importedMessage}</p>
          {importedHref && (
            <a
              href={importedHref}
              className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors w-fit"
            >
              View →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
