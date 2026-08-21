import { describe, expect, it } from "vitest";
import { buildComposerPaletteActions } from "./palette-composer-actions";

const MODELS = [
  { value: "opus", label: "Opus 5" },
  { value: "sonnet", label: "Sonnet 5" },
  { value: "legacy", label: "Legacy", disabled: true },
];
const REASONING = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

function build() {
  return buildComposerPaletteActions({
    models: { options: MODELS, selected: "opus", onSelect: () => {} },
    reasoning: { options: REASONING, selected: "low", onSelect: () => {} },
  });
}

describe("buildComposerPaletteActions", () => {
  it("offers the other options only, grouped", () => {
    // The exhaustive list is the assertion: the current model ("Opus 5"), the
    // current effort ("Low"), and the disabled option ("Legacy") are absent
    // because each would be a row that does nothing.
    expect(
      build().map((entry) => [entry.group, entry.title, entry.id]),
    ).toEqual([
      ["Model", "Sonnet 5", "model:sonnet"],
      ["Reasoning effort", "High", "reasoning:high"],
    ]);
  });
});
