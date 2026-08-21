// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaletteAction } from "./palette-action";
import {
  collectViewPaletteActions,
  resetPaletteRegistryForTest,
  useRegisterPaletteActions,
  type PaletteActionProvider,
} from "./palette-registry";

function action(id: string, title = id): PaletteAction {
  return { id, title, group: "Test", shortcut: null, run: () => {} };
}

function Provider({ provider }: { provider: PaletteActionProvider }) {
  useRegisterPaletteActions(provider);
  return null;
}

const collect = () => collectViewPaletteActions({ target: null });
const collectIds = () => collect().map((entry) => entry.id);

afterEach(() => {
  cleanup();
  resetPaletteRegistryForTest();
});

describe("useRegisterPaletteActions", () => {
  it("sees current props without re-registering", () => {
    // The provider closes over props and is read through a ref, so a rerender
    // must not drop and re-add the registration (which would reorder it).
    function Host({ label }: { label: string }) {
      useRegisterPaletteActions(() => [action("row", label)]);
      return null;
    }
    const { rerender } = render(
      <>
        <Host label="before" />
        <Provider provider={() => [action("after-me")]} />
      </>,
    );
    rerender(
      <>
        <Host label="after" />
        <Provider provider={() => [action("after-me")]} />
      </>,
    );
    expect(collect().map((entry) => entry.title)).toEqual([
      "after",
      "after-me",
    ]);
  });

  it("contains a provider that throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(
      <>
        <Provider
          provider={() => {
            throw new Error("provider exploded");
          }}
        />
        <Provider provider={() => [action("survivor")]} />
      </>,
    );
    expect(collectIds()).toEqual(["survivor"]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
