import type { PaletteAction } from "./palette-action";

/** The subset of a picker option the palette needs. */
export interface ComposerPaletteOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface BuildComposerPaletteActionsArgs {
  models: {
    options: readonly ComposerPaletteOption[];
    selected: string;
    onSelect: (value: string) => void;
  };
  reasoning: {
    options: readonly ComposerPaletteOption[];
    selected: string;
    onSelect: (value: string) => void;
  };
  /** Omitted when the composer's provider is locked or there is only one. */
  providers?: {
    options: readonly ComposerPaletteOption[];
    selected: string;
    onSelect: (value: string) => void;
  };
}

function optionActions(
  group: string,
  idPrefix: string,
  config: {
    options: readonly ComposerPaletteOption[];
    selected: string;
    onSelect: (value: string) => void;
  },
): PaletteAction[] {
  return (
    config.options
      // The current value and the ones the picker refuses to select would both
      // be rows that do nothing.
      .filter(
        (option) =>
          option.value !== config.selected && option.disabled !== true,
      )
      .map((option) => ({
        id: `${idPrefix}:${option.value}`,
        group,
        title: option.label,
        shortcut: null,
        run: () => config.onSelect(option.value),
      }))
  );
}

/**
 * Rows for switching the focused composer's model, reasoning effort, or
 * provider by name — the thing the cycle chords cannot do, since they move one
 * step against a picker the palette has covered up.
 */
export function buildComposerPaletteActions(
  args: BuildComposerPaletteActionsArgs,
): PaletteAction[] {
  return [
    ...optionActions("Model", "model", args.models),
    ...optionActions("Reasoning effort", "reasoning", args.reasoning),
    ...(args.providers === undefined
      ? []
      : optionActions("Provider", "provider", args.providers)),
  ];
}
