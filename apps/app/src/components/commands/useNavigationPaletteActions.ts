import { useNavigate } from "react-router-dom";
import type { ThreadListEntry } from "@bb/domain";
import type { SidebarBootstrapResponse } from "@bb/server-contract";
import { useRegisterPaletteActions } from "@/lib/command-palette/palette-registry";
import type { PaletteAction } from "@/lib/command-palette/palette-action";
import { useSetRootComposeProjectId } from "@/lib/root-compose-selection";
import { getRootComposeRoutePath, getThreadRoutePath } from "@/lib/route-paths";
import { getThreadDisplayTitle } from "@/lib/thread-title";

/**
 * Threads offered by title. Enough to cover "the one I was just in" without
 * turning an empty query into a thread list; anything older is a search away.
 */
const RECENT_THREAD_LIMIT = 15;

interface NavigationPaletteArgs {
  navigation: SidebarBootstrapResponse | undefined;
  /** Excluded from the thread rows: reopening the current thread does nothing. */
  currentThreadId: string | undefined;
}

function mostRecentThreads(
  navigation: SidebarBootstrapResponse,
  currentThreadId: string | undefined,
): ThreadListEntry[] {
  return [
    ...navigation.projects.flatMap((project) => project.threads),
    ...navigation.personalProject.threads,
  ]
    .filter((thread) => thread.id !== currentThreadId)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_THREAD_LIMIT);
}

/**
 * Palette rows for the sidebar's projects and threads: start a thread in a
 * named project, or open a recent thread by title. Registered once by
 * `AppLayout`, which already holds the sidebar bootstrap.
 */
export function useNavigationPaletteActions(args: NavigationPaletteArgs): void {
  const navigate = useNavigate();
  const setRootComposeProjectId = useSetRootComposeProjectId();

  useRegisterPaletteActions(() => {
    const navigation = args.navigation;
    if (navigation === undefined) return [];
    const actions: PaletteAction[] = [];

    for (const project of [
      navigation.personalProject,
      ...navigation.projects,
    ]) {
      actions.push({
        id: `project:${project.id}:new-thread`,
        group: "Projects",
        title: `New thread in ${project.name}`,
        shortcut: null,
        run: () => {
          setRootComposeProjectId(project.id);
          void navigate(getRootComposeRoutePath(), {
            state: { focusPrompt: true },
          });
        },
      });
    }

    for (const thread of mostRecentThreads(navigation, args.currentThreadId)) {
      actions.push({
        id: `thread:${thread.id}`,
        group: "Recent threads",
        title: getThreadDisplayTitle(thread),
        shortcut: null,
        run: () => {
          void navigate(
            getThreadRoutePath({
              projectId: thread.projectId,
              threadId: thread.id,
            }),
          );
        },
      });
    }

    return actions;
  });
}
