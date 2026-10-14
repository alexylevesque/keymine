import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottle } from "@/lib/race/throttle";

// PERF-02 / TECH-06 : le client n'envoie pas un message par frappe.
describe("regroupement des envois d'avancement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("une rafale de 100 frappes en 1 s donne au plus 11 envois", () => {
    const fn = vi.fn();
    const t = createThrottle(100, fn);
    for (let i = 0; i < 100; i++) {
      t.schedule();
      vi.advanceTimersByTime(10);
    }
    vi.advanceTimersByTime(200);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("la première frappe part tout de suite et la dernière n'est jamais perdue", () => {
    const fn = vi.fn();
    const t = createThrottle(100, fn);
    t.schedule();
    expect(fn).toHaveBeenCalledTimes(1);
    t.schedule();
    t.schedule();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("un envoi immédiat (fin du texte) remplace l'envoi en attente", () => {
    const fn = vi.fn();
    const t = createThrottle(100, fn);
    t.schedule();
    t.schedule();
    t.schedule(true);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel annule l'envoi en attente", () => {
    const fn = vi.fn();
    const t = createThrottle(100, fn);
    t.schedule();
    t.schedule();
    t.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
