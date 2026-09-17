// INVOKE.PUSH.2 — this exact JSX rendered identically at every callsite that
// shows a "pushed to Invoke" result (asset/shot reference image Edit pages
// from INVOKE.PUSH.1; asset/shot detail pages and the two storyboard boards
// added by this ticket). Extracted here instead of being copied again —
// pure JSX, no state, mikai-method §5. The caller is the one that decides
// WHEN to render it (its own `invokePushed`/`invokeBoardName`/`invokeUrl`
// search-param check stays with the caller, not duplicated in here).

type Props = {
  boardName: string;
  invokeUrl: string;
};

export default function InvokePushedBanner({ boardName, invokeUrl }: Props) {
  return (
    <div className="mb-5 rounded border border-[#6b9e72]/30 bg-[#6b9e72]/5 px-4 py-3 flex flex-col gap-2">
      <p className="text-sm text-[#6b9e72]">
        Sent to Invoke board &quot;{boardName}&quot;. Right-click it → New Canvas from Image. When
        done, right-click the layer → Run Workflow → Send to MikAI.
      </p>
      <a
        href={invokeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-[#5b93d6] hover:text-[#8fbbe8] transition-colors w-fit"
      >
        Open Invoke ↗
      </a>
    </div>
  );
}
