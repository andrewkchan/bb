// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { defaultAppSettings, type AppDefaultKeybinding } from "@bb/domain";
import {
  AppCommandProvider,
  useAppCommandRunner,
} from "@/components/commands/AppCommandProvider";
import { useServerDaemonLogsCommand } from "./useServerDaemonLogsCommand";

// The shipped default from apps/server's DEFAULT_APP_KEYBINDINGS. Availability
// depends on its shape, so the mock mirrors it rather than simplifying it.
const LOGS_BINDING: AppDefaultKeybinding = {
  command: "logs.openServerDaemon",
  desktopOnly: true,
  shortcut: null,
  when: { all: ["mainSurface", "macPlatform"], none: ["modalOpen"] },
};

const testState = vi.hoisted(() => ({
  desktopApi: null as Record<string, unknown> | null,
}));

vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: {
      generalSettings: { ...defaultAppSettings, showKeyboardHints: false },
      keybindings: [],
      defaultKeybindings: [LOGS_BINDING],
    },
  }),
}));

vi.mock("@/lib/bb-desktop", () => ({
  getBbDesktopInfo: () => testState.desktopApi,
}));

interface FakeShellOptions {
  serverDaemonLogsAvailable: boolean;
  withBridgeMethod?: boolean;
}

function installFakeDesktopShell(options: FakeShellOptions) {
  const openServerDaemonLogs = vi.fn(() => Promise.resolve());
  let push: ((info: unknown) => void) | null = null;
  const info = {
    lastCheckedAt: null,
    latestVersion: null,
    pendingVersion: null,
    platform: "macos",
    serverDaemonLogsAvailable: options.serverDaemonLogsAvailable,
    updateAvailable: false,
    updateDownloaded: false,
    version: "0.0.0-test",
  };
  testState.desktopApi = {
    ...info,
    getInfo: () => Promise.resolve(info),
    onChange: (listener: (next: unknown) => void) => {
      push = listener;
      return () => {
        push = null;
      };
    },
    ...(options.withBridgeMethod === false ? {} : { openServerDaemonLogs }),
  };
  return {
    openServerDaemonLogs,
    pushAvailability(available: boolean) {
      push?.({ ...info, serverDaemonLogsAvailable: available });
    },
  };
}

function Harness() {
  useServerDaemonLogsCommand();
  const runner = useAppCommandRunner();
  const [answer, setAnswer] = useState("unasked");
  return (
    <>
      <button
        type="button"
        data-testid="available"
        onClick={() =>
          setAnswer(
            runner.isCommandAvailable("logs.openServerDaemon", null)
              ? "yes"
              : "no",
          )
        }
      >
        {answer}
      </button>
      <button
        type="button"
        data-testid="run"
        onClick={() => runner.dispatch("logs.openServerDaemon", null)}
      />
    </>
  );
}

function renderHarness() {
  render(
    <MemoryRouter>
      <AppCommandProvider>
        <Harness />
      </AppCommandProvider>
    </MemoryRouter>,
  );
}

async function availability(): Promise<string | null> {
  const probe = screen.getByTestId("available");
  fireEvent.click(probe);
  return probe.textContent;
}

beforeAll(() => {
  // The shipped binding is macPlatform-scoped, and jsdom reports "".
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: "MacIntel",
  });
});

afterEach(() => {
  cleanup();
  testState.desktopApi = null;
  vi.clearAllMocks();
});

describe("useServerDaemonLogsCommand", () => {
  it("offers the command and opens the viewer once the shell reports logs", async () => {
    const shell = installFakeDesktopShell({ serverDaemonLogsAvailable: true });
    renderHarness();

    await waitFor(async () => {
      expect(await availability()).toBe("yes");
    });
    fireEvent.click(screen.getByTestId("run"));
    expect(shell.openServerDaemonLogs).toHaveBeenCalledTimes(1);
  });

  it("stays unavailable for an attached runtime, which has no logs to tail", async () => {
    installFakeDesktopShell({ serverDaemonLogsAvailable: false });
    renderHarness();

    // Nothing to wait for: the answer must never flip to "yes".
    await waitFor(async () => {
      expect(await availability()).toBe("no");
    });
  });

  it("withdraws the command when the shell switches to an attached runtime", async () => {
    const shell = installFakeDesktopShell({ serverDaemonLogsAvailable: true });
    renderHarness();
    await waitFor(async () => {
      expect(await availability()).toBe("yes");
    });

    shell.pushAvailability(false);

    await waitFor(async () => {
      expect(await availability()).toBe("no");
    });
  });

  it("stays unavailable on a desktop shell whose preload predates the bridge", async () => {
    installFakeDesktopShell({
      serverDaemonLogsAvailable: true,
      withBridgeMethod: false,
    });
    renderHarness();

    await waitFor(async () => {
      expect(await availability()).toBe("no");
    });
  });
});
