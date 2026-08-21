// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SidebarBootstrapResponse } from "@bb/server-contract";
import {
  collectViewPaletteActions,
  resetPaletteRegistryForTest,
} from "@/lib/command-palette/palette-registry";
import { useNavigationPaletteActions } from "./useNavigationPaletteActions";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const setRootComposeProjectId = vi.hoisted(() => vi.fn());
vi.mock("@/lib/root-compose-selection", () => ({
  useSetRootComposeProjectId: () => setRootComposeProjectId,
}));

function thread(id: string, updatedAt: number, title: string | null) {
  return {
    id,
    projectId: "proj_a",
    title,
    titleFallback: null,
    updatedAt,
  } as unknown as SidebarBootstrapResponse["projects"][number]["threads"][number];
}

function navigation(
  threads: ReturnType<typeof thread>[],
): SidebarBootstrapResponse {
  return {
    sections: [],
    projects: [{ id: "proj_a", name: "bb", threads }],
    personalProject: { id: "proj_personal", name: "Personal", threads: [] },
  } as unknown as SidebarBootstrapResponse;
}

function Host(props: {
  navigation: SidebarBootstrapResponse | undefined;
  currentThreadId?: string;
}) {
  useNavigationPaletteActions({
    navigation: props.navigation,
    currentThreadId: props.currentThreadId,
  });
  return null;
}

function renderHost(props: {
  navigation: SidebarBootstrapResponse | undefined;
  currentThreadId?: string;
}) {
  return render(
    <MemoryRouter>
      <Host {...props} />
    </MemoryRouter>,
  );
}

const collect = () => collectViewPaletteActions({ target: null });

afterEach(() => {
  cleanup();
  resetPaletteRegistryForTest();
  navigate.mockClear();
  setRootComposeProjectId.mockClear();
});

describe("useNavigationPaletteActions", () => {
  it("offers a new thread in every project, personal first", () => {
    renderHost({ navigation: navigation([]) });
    expect(
      collect()
        .filter((entry) => entry.group === "Projects")
        .map((entry) => entry.title),
    ).toEqual(["New thread in Personal", "New thread in bb"]);
  });

  it("orders threads by recency and titles them the way the sidebar does", () => {
    renderHost({
      navigation: navigation([
        thread("thr_old", 1, "Older thread"),
        thread("thr_new", 3, null),
        thread("thr_mid", 2, "Middle thread"),
      ]),
    });
    expect(
      collect()
        .filter((entry) => entry.group === "Recent threads")
        .map((entry) => entry.title),
    ).toEqual(["Thread thr_new", "Middle thread", "Older thread"]);
  });

  it("caps the thread rows and omits the thread already on screen", () => {
    renderHost({
      navigation: navigation(
        Array.from({ length: 40 }, (_, index) =>
          thread(`thr_${index}`, index, `Thread ${index}`),
        ),
      ),
      // The newest thread, so it would otherwise head the list.
      currentThreadId: "thr_39",
    });
    const threads = collect().filter(
      (entry) => entry.group === "Recent threads",
    );
    expect(threads).toHaveLength(15);
    expect(threads.map((entry) => entry.id)).not.toContain("thread:thr_39");
  });

  it("opens a thread and starts a project thread where the sidebar would", () => {
    renderHost({ navigation: navigation([thread("thr_x", 1, "Some thread")]) });
    collect()
      .find((entry) => entry.id === "thread:thr_x")
      ?.run();
    expect(navigate).toHaveBeenCalledWith("/projects/proj_a/threads/thr_x");

    navigate.mockClear();
    collect()
      .find((entry) => entry.id === "project:proj_a:new-thread")
      ?.run();
    expect(setRootComposeProjectId).toHaveBeenCalledWith("proj_a");
    expect(navigate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ state: { focusPrompt: true } }),
    );
  });
});
