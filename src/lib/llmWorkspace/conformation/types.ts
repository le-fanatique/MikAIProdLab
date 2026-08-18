// ---------------------------------------------------------------------------
// conformation/types.ts — LLMW.CONFORMATION.1 (B13a)
//
// The conformation stage's contract: what a consumer asks to be conformed,
// and what a profile gives back.
//
// **This is assembly, not cooking** (`docs/LLM_WORKSPACE_PRODUCT_VISION.md`
// §5.3). It runs no model, reads no database, writes nothing, and is
// deterministic — the same request always yields the same result. §5.3's rule
// follows directly: *"A deterministic assembly is never stored. It is
// recomputed on demand, is identical every time, and cannot go stale."* So
// nothing here has a column, a jar, or staleness machinery, and nothing here
// goes through `runOperation`.
//
// No `import "server-only"`: this module touches neither the database nor the
// filesystem, and a client-side preview must be able to call it.
//
// **Why a profile at all.** §5.5: the Seedance guide is the *default
// conformation rule, not a supported product* — *"l idee n etait pas de
// bloquer l app autour de seedance"*. The stage must be replaceable per
// engine, and no ingredient, variable or entity field may be named after
// Seedance. A profile is what makes that true rather than merely stated:
// engine knowledge lives in the profile and nowhere else.
// ---------------------------------------------------------------------------

/**
 * The closed set of conformation profiles. One today — the guide of §5.5, named
 * for what it is (a default) rather than for the engine that motivated it.
 * A second engine adds a second entry with its own tables; nothing outside
 * this folder learns about it.
 */
export type ConformationProfileId = "guide.default";

/**
 * One stored reference, as the database holds it: its role and its position.
 * Deliberately not the image itself — conformation renders *syntax*, never
 * pixels, and never needs a path.
 */
export type ConformationReference = {
  /** The stored `image_role` value. Read through the app's own catalogue's aliases; never rewritten. */
  role: string | null;
  label: string | null;
};

export type ConformationRequest = {
  /** In their stored order, which is the order the user arranged. Never re-sorted. */
  references: ConformationReference[];

  /**
   * The camera instructions the caller has, as opaque strings.
   *
   * **This is the ticket's most important constraint, and it is deliberate.**
   * §5.6: *"The conformation stage (§5.4) must therefore not hard-code today's
   * camera shape."* Today that shape is `cameraPitch` / `framing` /
   * `cameraMovement`, and B19 is scheduled to redesign it after Chantier 2.
   *
   * So this stage **counts** these phrases — the guide asks for one primary
   * camera instruction, which B13b turns into a finding — and **never reads
   * one**. When the camera shape changes, the caller changes and conformation
   * does not.
   *
   * Same discipline B16a applied to image paths: domain knowledge stays with
   * whoever owns the domain.
   */
  cameraPhrases: string[];
};

/**
 * The closed set of findings the output discipline (B13b) can report. Every
 * code names a check §5.6 lists under "missing output discipline" — word
 * budget, primary camera, the two tag caps, and lighting.
 */
export type ConformationFindingCode =
  | "wordBudget"
  | "primaryCamera"
  | "imageTagCap"
  | "fileTagCap"
  | "lightingMissing";

/**
 * One constat. **Never an exception, never a refusal** — §5.4 puts formatting
 * entirely in the app's hands and forbids turning it into a rule the user is
 * asked to obey. Two severities only, and neither is blocking:
 * `warn` — the guide is broken; `info` — something the guide counts is
 * missing, without that being an infraction. There is no `"error"`: nothing
 * here is refused.
 */
export type ConformationFinding = {
  code: ConformationFindingCode;
  severity: "info" | "warn";
  message: string;
};

/**
 * What `inspect` needs beyond `ConformationRequest`. A separate type, not
 * `ConformationRequest` widened with optional fields — a type half of whose
 * fields are optional no longer says what it requires.
 */
export type ConformationInspectionRequest = ConformationRequest & {
  /** The prompt body to measure, exactly as the caller assembled it. This stage never fabricates it. */
  body: string;
  /** The resolved lighting, or its absence. */
  lighting: string | null;
  /**
   * The total file count, images included. A number, not a per-family list:
   * video carries no role column yet and audio has no entity at all (§5.6),
   * so this ticket declares no shape for either. When they arrive, the caller
   * passes a larger number and this module does not change.
   */
  fileTagCount: number;
};

export type ConformedReference = {
  /** `@Image1`, `@Image2`… The ordinal follows the request's own order, never the role. */
  tag: string;
  /**
   * The guide's named mode for this reference, or `null` when its role has
   * none. A `null` mode is not a failure and not a dropped reference — see
   * `profiles/guideDefault.ts` for why keeping the tag is the only honest
   * option.
   */
  mode: string | null;
  /** The canonical role this reference resolved to, or `null` if unrecognized/absent. */
  role: string | null;
  label: string | null;
};

/**
 * A profile's reference rendering. B13b widens this module with the output
 * discipline §5.6 calls for — the word budget, the one-primary-camera rule,
 * the tag caps and the lighting check — expressed as a `findings[]` alongside
 * the conformed text.
 *
 * **Findings, never exceptions.** §5.4 puts formatting entirely in the app's
 * hands and says it is *"never a rule the user is asked to obey"*. A prompt
 * over its word budget is still a prompt; the stage reports what is off, it
 * does not refuse to produce.
 */
export type ConformationProfile = {
  id: ConformationProfileId;
  name: string;
  conformReferences: (request: ConformationRequest) => ConformedReference[];
  /**
   * The output discipline (B13b): what the request stands off the guide
   * against, reported as findings. Pure and deterministic, like
   * `conformReferences` — it looks and reports, it never rewrites.
   */
  inspect: (request: ConformationInspectionRequest) => ConformationFinding[];
};
