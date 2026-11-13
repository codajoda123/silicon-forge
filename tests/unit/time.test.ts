import { describe, expect, it } from "vitest";

import {
  civilFromDays,
  dateFromWeek,
  daysFromCivil,
  formatGameDate,
} from "../../src/sim/core/time";

describe("game calendar", () => {
  it("maps week 0 to January 1 of the start year", () => {
    expect(dateFromWeek(1971, 0)).toEqual({ year: 1971, month: 1, day: 1 });
    expect(dateFromWeek(1985, 0)).toEqual({ year: 1985, month: 1, day: 1 });
  });

  it("advances seven days per week across a year boundary", () => {
    expect(dateFromWeek(1971, 52)).toEqual({ year: 1971, month: 12, day: 31 });
    expect(dateFromWeek(1971, 53)).toEqual({ year: 1972, month: 1, day: 7 });
  });

  it("handles leap years", () => {
    expect(dateFromWeek(1972, 8)).toEqual({ year: 1972, month: 2, day: 26 });
    expect(daysFromCivil({ year: 1972, month: 2, day: 29 })).toBe(
      daysFromCivil({ year: 1972, month: 2, day: 28 }) + 1,
    );
    expect(dateFromWeek(2000, 8)).toEqual({ year: 2000, month: 2, day: 26 });
  });

  it("round-trips civil dates and epoch days", () => {
    for (let days = -2000; days <= 40000; days += 37) {
      const date = civilFromDays(days);
      expect(daysFromCivil(date)).toBe(days);
    }
  });

  it("formats dates for the UI", () => {
    expect(formatGameDate({ year: 1971, month: 1, day: 1 })).toBe("Jan 1, 1971");
    expect(formatGameDate({ year: 1990, month: 12, day: 31 })).toBe("Dec 31, 1990");
  });

  it("rejects invalid inputs", () => {
    expect(() => dateFromWeek(1971, -1)).toThrow();
    expect(() => dateFromWeek(1971, 1.5)).toThrow();
    expect(() => dateFromWeek(1971.5, 0)).toThrow();
  });
});
