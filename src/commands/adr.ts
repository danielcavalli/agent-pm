import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { getPmDir } from "../lib/codes.js";
import {
  ADRSchema,
  ADRIndexSchema,
  type ADR,
  type ADRStatus,
} from "../schemas/adr.schema.js";

export async function adrCreate(options: {
  projectCode: string;
  title: string;
  status: string;
  context: string;
  decision: string;
  positiveConsequences: string[];
  negativeConsequences: string[];
  authorType: "agent" | "human";
  authorName?: string;
  authorId?: string;
  tags?: string[];
}): Promise<{ adrId: string; filePath: string }> {
  const {
    title,
    status,
    context,
    decision,
    positiveConsequences,
    negativeConsequences,
    authorType,
    authorName,
    authorId,
    tags = [],
  } = options;

  const pmDir = getPmDir();
  const adrsDir = path.join(pmDir, "adrs");
  fs.mkdirSync(adrsDir, { recursive: true });

  const adrId = await nextAdrNumber();

  const now = new Date().toISOString();

  const adr: ADR = {
    id: adrId,
    title,
    status: status as ADRStatus,
    context,
    decision,
    consequences: {
      positive: positiveConsequences,
      negative: negativeConsequences,
    },
    author:
      authorType === "agent"
        ? { type: "agent", agent_id: authorId || "unknown" }
        : { type: "human", name: authorName || "anonymous" },
    timestamp: now,
    tags,
    references: [],
    created_at: now,
    updated_at: now,
  };

  const validated = ADRSchema.parse(adr);

  const fileName = `${adrId}.yaml`;
  const filePath = path.join(adrsDir, fileName);

  const yaml = await import("js-yaml");
  const content = yaml.dump(validated, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(filePath, content, "utf8");

  await updateAdrIndex(validated);

  console.log(chalk.green(`Created ${adrId} at ${filePath}`));

  return { adrId, filePath };
}

export async function nextAdrNumber(): Promise<string> {
  const index = await getAdrIndex();

  let maxNum = 0;
  for (const adr of index.adrs) {
    const match = adr.id.match(/^ADR-(\d{3})$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  const next = maxNum + 1;
  return `ADR-${String(next).padStart(3, "0")}`;
}

export async function getAdrIndex(): Promise<{
  adrs: ADR[];
  last_updated: string;
}> {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "ADR-000.yaml");

  if (!fs.existsSync(indexPath)) {
    return { adrs: [], last_updated: new Date().toISOString() };
  }

  const yaml = await import("js-yaml");
  const raw = yaml.load(fs.readFileSync(indexPath, "utf8")) as {
    adrs?: ADR[];
    last_updated?: string;
  };

  return {
    adrs: Array.isArray(raw.adrs) ? raw.adrs : [],
    last_updated: raw.last_updated || new Date().toISOString(),
  };
}

export async function updateAdrIndex(newAdr: ADR): Promise<void> {
  const pmDir = getPmDir();
  const indexPath = path.join(pmDir, "ADR-000.yaml");

  const index = await getAdrIndex();

  const existingIndex = index.adrs.findIndex((a) => a.id === newAdr.id);
  if (existingIndex >= 0) {
    index.adrs[existingIndex] = newAdr;
  } else {
    index.adrs.push(newAdr);
  }

  index.last_updated = new Date().toISOString();

  const yaml = await import("js-yaml");
  const content = yaml.dump(index, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  fs.writeFileSync(indexPath, content, "utf8");
}

export async function adrList(_projectCode: string): Promise<void> {
  const index = await getAdrIndex();

  if (index.adrs.length === 0) {
    console.log(chalk.yellow("No ADRs found."));
    return;
  }

  const projectCode = _projectCode || "PROJECT";
  console.log(chalk.bold(`\nADR Index for ${projectCode}\n`));
  console.log(
    chalk.dim("ID        Title                          Status       Tags"),
  );
  console.log(chalk.dim("─".repeat(70)));

  for (const adr of index.adrs) {
    const tagsStr = adr.tags?.join(", ") || "";
    console.log(
      `${adr.id}   ${adr.title.substring(0, 30).padEnd(30)}  ${adr.status.padEnd(11)} ${tagsStr}`,
    );
  }
}

export interface AdrQueryOptions {
  projectCode: string;
  id?: string;
  status?: string;
  tag?: string;
  authorType?: "agent" | "human";
  author?: string;
  search?: string;
  limit?: number;
  format?: "summary" | "full";
}

export async function adrQuery(options: AdrQueryOptions): Promise<void> {
  const {
    id,
    status,
    tag,
    authorType,
    author,
    search,
    limit = 20,
    format = "summary",
  } = options;

  const pmDir = getPmDir();
  const projectYaml = path.join(pmDir, "project.yaml");
  if (!fs.existsSync(projectYaml)) {
    throw new Error(`No project found at ${pmDir}`);
  }

  const index = await getAdrIndex();

  let results = index.adrs;

  if (id) {
    const idPattern = new RegExp(id.replace(/\*/g, ".*"), "i");
    results = results.filter((adr) => idPattern.test(adr.id));
  }

  if (status) {
    results = results.filter((adr) => adr.status === status);
  }

  if (tag) {
    results = results.filter((adr) => adr.tags?.includes(tag));
  }

  if (authorType) {
    results = results.filter((adr) => adr.author.type === authorType);
  }

  if (author) {
    const authorSearch = author.toLowerCase();
    results = results.filter((adr) => {
      if (adr.author.type === "agent") {
        return adr.author.agent_id.toLowerCase().includes(authorSearch);
      } else {
        return adr.author.name.toLowerCase().includes(authorSearch);
      }
    });
  }

  if (search) {
    const searchLower = search.toLowerCase();
    results = results.filter(
      (adr) =>
        adr.title.toLowerCase().includes(searchLower) ||
        adr.context.toLowerCase().includes(searchLower) ||
        adr.decision.toLowerCase().includes(searchLower),
    );
  }

  results = results.slice(0, limit);

  if (results.length === 0) {
    console.log(chalk.yellow("No ADRs match the query."));
    return;
  }

  if (format === "full") {
    for (const adr of results) {
      console.log(chalk.bold(`\n${adr.id}: ${adr.title}`));
      console.log(chalk.dim("─".repeat(50)));
      console.log(chalk.cyan("Status:") + " " + adr.status);
      console.log(
        chalk.cyan("Author:") +
          " " +
          (adr.author.type === "agent"
            ? `agent:${adr.author.agent_id}`
            : adr.author.name),
      );
      console.log(chalk.cyan("Created:") + " " + adr.timestamp);
      if (adr.tags && adr.tags.length > 0) {
        console.log(chalk.cyan("Tags:") + " " + adr.tags.join(", "));
      }
      console.log(chalk.cyan("\nContext:"));
      console.log("  " + adr.context);
      console.log(chalk.cyan("\nDecision:"));
      console.log("  " + adr.decision);
      if (adr.consequences.positive.length > 0) {
        console.log(chalk.cyan("\nPositive consequences:"));
        for (const c of adr.consequences.positive) {
          console.log("  - " + c);
        }
      }
      if (adr.consequences.negative.length > 0) {
        console.log(chalk.cyan("\nNegative consequences:"));
        for (const c of adr.consequences.negative) {
          console.log("  - " + c);
        }
      }
    }
  } else {
    console.log(
      chalk.dim(
        "ID        Title                          Status       Author                 Tags",
      ),
    );
    console.log(chalk.dim("─".repeat(85)));

    for (const adr of results) {
      const authorStr =
        adr.author.type === "agent"
          ? `agent:${adr.author.agent_id}`
          : adr.author.name;
      const tagsStr = adr.tags?.join(", ") || "";
      console.log(
        `${adr.id}   ${adr.title.substring(0, 30).padEnd(30)}  ${adr.status.padEnd(11)} ${authorStr.substring(0, 20).padEnd(20)} ${tagsStr}`,
      );
    }

    if (results.length === limit) {
      console.log(chalk.dim(`\n(reached limit of ${limit} results)`));
    }
  }

  console.log(chalk.dim(`\n${results.length} result(s)`));
}
