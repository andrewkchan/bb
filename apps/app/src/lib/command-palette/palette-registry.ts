import { useEffect, useLayoutEffect, useRef } from "react";
import type { PaletteAction } from "./palette-action";

export interface PaletteActionContext {
  /** The element focused before the palette opened, not its own input. */
  target: EventTarget | null;
}

/**
 * Contributes rows for the state the palette opened in. Called at open, not at
 * registration, so a provider can answer for the focused pane or composer the
 * same way an app command handler scopes itself to the event target.
 */
export type PaletteActionProvider = (
  context: PaletteActionContext,
) => readonly PaletteAction[];

interface Registration {
  provider: PaletteActionProvider;
  sequence: number;
}

const registrations = new Map<symbol, Registration>();
let nextSequence = 0;

function registerPaletteActionProvider(
  token: symbol,
  provider: PaletteActionProvider,
): () => void {
  nextSequence += 1;
  registrations.set(token, { provider, sequence: nextSequence });
  return () => {
    registrations.delete(token);
  };
}

/**
 * Every registered provider's rows, in registration order, with failures
 * contained: one provider that throws must not cost the user the palette.
 */
export function collectViewPaletteActions(
  context: PaletteActionContext,
): PaletteAction[] {
  const ordered = [...registrations.values()].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const actions: PaletteAction[] = [];
  for (const registration of ordered) {
    try {
      actions.push(...registration.provider(context));
    } catch (error) {
      console.error("A palette action provider failed", error);
    }
  }
  return actions;
}

/**
 * Contribute palette rows from a mounted component, for actions with no app
 * command behind them — switching to a named model, opening a specific thread.
 * Registration lasts as long as the component, so its rows disappear with the
 * surface that offers them.
 *
 * `provider` is read through a ref, so it may close over current props without
 * re-registering and without a dependency list.
 */
export function useRegisterPaletteActions(
  provider: PaletteActionProvider,
): void {
  const providerRef = useRef(provider);
  useLayoutEffect(() => {
    providerRef.current = provider;
  }, [provider]);
  const tokenRef = useRef<symbol | null>(null);
  tokenRef.current ??= Symbol("palette-actions");
  useEffect(() => {
    const token = tokenRef.current;
    if (token === null) return;
    return registerPaletteActionProvider(token, (context) =>
      providerRef.current(context),
    );
  }, []);
}

export function resetPaletteRegistryForTest(): void {
  registrations.clear();
  nextSequence = 0;
}
