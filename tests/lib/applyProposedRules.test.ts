import { describe, it, expect } from "vitest";
import { applyProposedRules, type AddRuleFn, type AddRuleOutcome } from "@/lib/projectStyle/applyProposedRules";

type Rule = { instruction: string };

function makeRules(n: number): Rule[] {
  return Array.from({ length: n }, (_, i) => ({ instruction: `rule ${i + 1}` }));
}

/** A simulated add function: a plain array of recorded calls, no database.
 * `failAt` is a 1-based index into the rules passed to `applyProposedRules`
 * (matching the ticket's own "échec au 2ᵉ sur 4" phrasing) — the call that
 * index receives returns `ok: false`. Every successful call returns a
 * strictly incrementing revision, so a threading bug (every call handed the
 * same `expectedRevision` instead of the previous call's result) shows up
 * directly in `calls.map(c => c.expectedRevision)`.
 */
function makeFakeAddRule(opts: { failAt?: number } = {}) {
  const { failAt } = opts;
  const calls: { rule: Rule; expectedRevision: number | null }[] = [];
  let nextRevision = 1;

  const addRule: AddRuleFn<Rule, number | null> = async (rule, expectedRevision) => {
    calls.push({ rule, expectedRevision });
    const callIndex = calls.length; // 1-based
    if (failAt !== undefined && callIndex === failAt) {
      const outcome: AddRuleOutcome<number | null> = { ok: false, error: `failed at ${rule.instruction}` };
      return outcome;
    }
    const revision = nextRevision;
    nextRevision += 1;
    const outcome: AddRuleOutcome<number | null> = { ok: true, revision };
    return outcome;
  };

  return { addRule, calls };
}

describe("applyProposedRules", () => {
  it("all N rules pass: N calls, correct revision chain, call order matches rule order", async () => {
    const rules = makeRules(4);
    const { addRule, calls } = makeFakeAddRule();

    const result = await applyProposedRules(rules, null, addRule);

    expect(result).toEqual({ addedCount: 4, failed: null, remaining: [], revision: 4 });
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.rule.instruction)).toEqual(rules.map((r) => r.instruction));
    // Each call restarts from the PREVIOUS call's returned revision, not a
    // value captured once before the loop — this is the chain the ticket
    // requires proof for.
    expect(calls.map((c) => c.expectedRevision)).toEqual([null, 1, 2, 3]);
  });

  it("failure on the 2nd of 4: exactly 2 calls made, 1 added, the 2nd reported with its message, the last 2 rendered as not attempted", async () => {
    const rules = makeRules(4);
    const { addRule, calls } = makeFakeAddRule({ failAt: 2 });

    const result = await applyProposedRules(rules, null, addRule);

    expect(calls).toHaveLength(2);
    expect(result.addedCount).toBe(1);
    expect(result.failed).toEqual({ rule: rules[1], message: "failed at rule 2" });
    expect(result.remaining).toEqual([rules[2], rules[3]]);
    expect(result.revision).toBe(1);
  });

  it("failure on the 1st: no addition is claimed", async () => {
    const rules = makeRules(3);
    const { addRule, calls } = makeFakeAddRule({ failAt: 1 });

    const result = await applyProposedRules(rules, null, addRule);

    expect(calls).toHaveLength(1);
    expect(result.addedCount).toBe(0);
    expect(result.failed).toEqual({ rule: rules[0], message: "failed at rule 1" });
    expect(result.remaining).toEqual([rules[1], rules[2]]);
    expect(result.revision).toBeNull();
  });

  it("empty list: no call at all, not an error", async () => {
    const { addRule, calls } = makeFakeAddRule();

    const result = await applyProposedRules([], 7, addRule);

    expect(calls).toHaveLength(0);
    expect(result).toEqual({ addedCount: 4 * 0, failed: null, remaining: [], revision: 7 });
  });
});
