const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");
const blessed = require("blessed");

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, "utf8"));
}

function loadProjectTree(rootDir) {
  const pmDir = path.join(rootDir, ".pm");
  const project = readYaml(path.join(pmDir, "project.yaml"));
  const epicsDir = path.join(pmDir, "epics");
  const epicFiles = fs
    .readdirSync(epicsDir)
    .filter((file) => /^E\d{3}-.+\.yaml$/.test(file))
    .sort();

  const epics = epicFiles.map((file) => {
    const epic = readYaml(path.join(epicsDir, file));
    return {
      code: epic.code,
      title: epic.title,
      status: epic.status,
      description: epic.description || "",
      stories: (epic.stories || []).map((story) => ({
        code: story.code,
        title: story.title,
        status: story.status,
        priority: story.priority,
        description: story.description || "",
        acceptance_criteria: story.acceptance_criteria || [],
        depends_on: story.depends_on || [],
      })),
    };
  });

  return {
    projectName: project.name,
    epics,
  };
}

function statusIcon(status) {
  switch (status) {
    case "done":
    case "complete":
      return "[x]";
    case "in_progress":
    case "active":
      return "[>]";
    case "cancelled":
    case "archived":
      return "[!]";
    default:
      return "[ ]";
  }
}

function flattenTree(epics, expanded) {
  const rows = [];

  for (const epic of epics) {
    rows.push({
      kind: "epic",
      code: epic.code,
      title: epic.title,
      node: epic,
      label: `${expanded.has(epic.code) ? "v" : ">"} ${statusIcon(epic.status)} ${epic.code} ${epic.title} [${epic.stories.filter((story) => story.status === "done").length}/${epic.stories.length}]`,
    });

    if (!expanded.has(epic.code)) {
      continue;
    }

    for (const story of epic.stories) {
      rows.push({
        kind: "story",
        code: story.code,
        title: story.title,
        node: story,
        label: `  ${statusIcon(story.status)} [${String(story.priority || "low")
          .charAt(0)
          .toUpperCase()}] ${story.code} ${story.title}`,
      });
    }
  }

  return rows;
}

function buildDetail(row) {
  if (!row) {
    return "No selection";
  }

  if (row.kind === "epic") {
    const doneStories = row.node.stories.filter(
      (story) => story.status === "done",
    ).length;
    return [
      `${row.code}`,
      "",
      row.title,
      "",
      `Status: ${row.node.status}`,
      `Stories: ${doneStories}/${row.node.stories.length} done`,
      "",
      row.node.description || "No description.",
    ].join("\n");
  }

  const criteria =
    row.node.acceptance_criteria.length > 0
      ? row.node.acceptance_criteria.map((item) => `- ${item}`).join("\n")
      : "- None";
  const deps =
    row.node.depends_on.length > 0 ? row.node.depends_on.join(", ") : "None";

  return [
    `${row.code}`,
    "",
    row.title,
    "",
    `Status: ${row.node.status}`,
    `Priority: ${row.node.priority}`,
    `Depends on: ${deps}`,
    "",
    row.node.description || "No description.",
    "",
    "Acceptance criteria:",
    criteria,
  ].join("\n");
}

function main() {
  const cwd = process.cwd();
  const tree = loadProjectTree(cwd);
  const expanded = new Set(tree.epics.map((epic) => epic.code));
  let rows = flattenTree(tree.epics, expanded);
  let cursor = 0;

  const screen = blessed.screen({
    smartCSR: true,
    title: "agent-pm blessed tree prototype",
    dockBorders: true,
    fullUnicode: false,
  });

  function exit(code) {
    screen.destroy();
    process.exit(code);
  }

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: false,
    style: {
      fg: "black",
      bg: "yellow",
    },
    content: ` blessed spike - ${tree.projectName}`,
  });

  const treeList = blessed.list({
    parent: screen,
    label: " Tree ",
    top: 1,
    left: 0,
    width: "45%",
    height: "100%-2",
    border: "line",
    keys: false,
    mouse: true,
    vi: false,
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: " ",
      track: {
        bg: "gray",
      },
      style: {
        bg: "yellow",
      },
    },
    style: {
      item: {
        fg: "white",
      },
      selected: {
        fg: "black",
        bg: "cyan",
        bold: true,
      },
      border: {
        fg: "cyan",
      },
      label: {
        fg: "cyan",
      },
    },
  });

  const detail = blessed.box({
    parent: screen,
    label: " Detail ",
    top: 1,
    left: "45%",
    width: "55%",
    height: "100%-2",
    border: "line",
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: false,
    vi: false,
    padding: {
      left: 1,
      right: 1,
    },
    scrollbar: {
      ch: " ",
      track: {
        bg: "gray",
      },
      style: {
        bg: "green",
      },
    },
    style: {
      fg: "white",
      border: {
        fg: "green",
      },
      label: {
        fg: "green",
      },
    },
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    style: {
      fg: "black",
      bg: "green",
    },
    content:
      " j/k or arrows move | enter toggles epic | click selects | wheel scrolls | q quits ",
  });

  function syncSelection() {
    cursor = Math.max(0, Math.min(cursor, rows.length - 1));
    treeList.setItems(rows.map((row) => row.label));
    treeList.select(cursor);
    detail.setContent(buildDetail(rows[cursor]));
    screen.render();
  }

  function refreshRows() {
    rows = flattenTree(tree.epics, expanded);
    if (cursor >= rows.length) {
      cursor = rows.length - 1;
    }
    syncSelection();
  }

  function moveCursor(delta) {
    cursor = Math.max(0, Math.min(rows.length - 1, cursor + delta));
    syncSelection();
  }

  function toggleCurrentEpic() {
    const row = rows[cursor];
    if (!row || row.kind !== "epic") {
      return;
    }
    if (expanded.has(row.code)) {
      expanded.delete(row.code);
    } else {
      expanded.add(row.code);
    }
    refreshRows();
  }

  treeList.on("keypress", () => {
    cursor = typeof treeList.selected === "number" ? treeList.selected : cursor;
    detail.setContent(buildDetail(rows[cursor]));
    screen.render();
  });

  treeList.on("select item", (_, index) => {
    if (typeof index === "number") {
      cursor = index;
      detail.setContent(buildDetail(rows[cursor]));
      screen.render();
    }
  });

  treeList.on("element click", (_, element) => {
    const index = treeList.children.indexOf(element);
    if (index >= 0) {
      cursor = index;
      syncSelection();
    }
  });

  treeList.on("mouse", (data) => {
    if (!data || !data.action) {
      return;
    }
    if (data.action === "wheelup") {
      moveCursor(-3);
    }
    if (data.action === "wheeldown") {
      moveCursor(3);
    }
  });

  detail.on("mouse", (data) => {
    if (!data || !data.action) {
      return;
    }
    if (data.action === "wheelup") {
      detail.scroll(-3);
      screen.render();
    }
    if (data.action === "wheeldown") {
      detail.scroll(3);
      screen.render();
    }
  });

  screen.key(["up", "k"], () => moveCursor(-1));
  screen.key(["down", "j"], () => moveCursor(1));
  screen.key(["pageup"], () => moveCursor(-10));
  screen.key(["pagedown"], () => moveCursor(10));
  screen.key(["enter", "space"], toggleCurrentEpic);
  screen.key(["q", "escape", "C-c"], () => exit(0));

  const autoExitMs = Number(process.env.PM_BLESSED_AUTO_EXIT_MS || 0);
  if (Number.isFinite(autoExitMs) && autoExitMs > 0) {
    setTimeout(() => exit(0), autoExitMs);
  }

  screen.on("resize", () => {
    header.setContent(` blessed spike - ${tree.projectName}`);
    footer.setContent(
      " j/k or arrows move | enter toggles epic | click selects | wheel scrolls | q quits ",
    );
    screen.render();
  });

  syncSelection();
  treeList.focus();
}

main();
