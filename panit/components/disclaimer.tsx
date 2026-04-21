/**
 * Product disclaimer (UI)
 *
 * Security / trust architecture:
 * - Surfaces that outputs are AI creative content, not prediction or authority.
 */

export function DisclaimerBanner() {
  return (
    <aside
      className="rounded-2xl border border-amber-400/20 bg-amber-950/25 px-4 py-3.5 text-sm text-amber-100/90 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-500"
      role="note"
    >
      <strong className="font-semibold text-amber-200/95">AI-generated creative content.</strong>{" "}
      Sacred Voice is a storytelling and reflection tool. It does not predict the future, diagnose
      conditions, or speak with spiritual authority. Treat all narratives as fiction or reflective
      prompts—not advice.
    </aside>
  );
}
