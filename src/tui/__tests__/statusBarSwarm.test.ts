import { describe, expect, it } from "vitest";
import { theme, tc } from "../colors.js";
import {
  buildStatusBarSegments,
  fitStatusBarSegments,
  flattenStatusBarSegments,
  swarmTrendColor,
} from "../components/StatusBar.js";

describe("StatusBar swarm status", () => {
  it("displays experiment count, trend, and best score when swarm is initialized", () => {
    const bar = flattenStatusBarSegments(
      buildStatusBarSegments({
        selectedCode: "PM-E063-S002",
        filter: "all",
        swarmStatus: {
          trend: "improving",
          trendColor: "green",
          experimentCount: 4,
          bestScore: 0.84,
          activeClaims: 2,
          activeExperimentClaims: [],
          recentResults: [],
        },
      }),
    );

    expect(bar).toContain("Swarm: 4 experiments | improving | best: 0.84");
  });

  it("colors the trend text using the loader color mapping", () => {
    const segments = buildStatusBarSegments({
      selectedCode: "PM-E063-S002",
      filter: "all",
      swarmStatus: {
        trend: "plateaued",
        trendColor: "yellow",
        experimentCount: 3,
        bestScore: 0.71,
        activeClaims: 0,
        activeExperimentClaims: [],
        recentResults: [],
      },
    });

    expect(swarmTrendColor("green")).toBe(tc(theme.success));
    expect(swarmTrendColor("yellow")).toBe(tc(theme.warning));
    expect(swarmTrendColor("red")).toBe(tc(theme.error));
    expect(segments[1]).toMatchObject({
      text: "plateaued",
      color: tc(theme.warning),
    });
  });

  it("keeps the status bar unchanged when swarm is not initialized", () => {
    const bar = flattenStatusBarSegments(
      buildStatusBarSegments({
        selectedCode: "PM-E063-S002",
        filter: "all",
        swarmStatus: null,
      }),
    );

    expect(bar).not.toContain("Swarm:");
    expect(bar).toContain("PM-E063-S002");
    expect(bar).toContain("[Tab] panel");
  });

  it("renders correctly when the swarm data loader returns null", () => {
    const bar = flattenStatusBarSegments(
      fitStatusBarSegments(
        buildStatusBarSegments({
          selectedCode: "PM-E063-S002",
          filter: "in_progress",
          swarmStatus: null,
        }),
        160,
      ),
    );

    expect(bar).not.toContain("Swarm:");
    expect(bar).toContain("[In Progress]");
    expect(bar.length).toBe(160);
  });
});
