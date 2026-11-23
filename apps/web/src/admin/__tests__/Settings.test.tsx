import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Settings } from "../Settings";
import { LangContext } from "../../components/lang";
import { STR } from "../../i18n";

vi.mock("../../lib/accessToken", () => ({
  getAccessToken: vi.fn().mockResolvedValue("admin-jwt"),
}));

const ctx = { lang: "en" as const, t: STR.en, toggle: () => {} };

const workerBody = {
  ok: true,
  key: "video_worker_enabled",
  value: { enabled: true },
  updated_at: "2026-11-23T10:00:00.000Z",
  updated_by: "uid-1",
  updated_by_name: "Owner",
  missing: false,
};

const gateBody = {
  ok: true,
  key: "native_gate",
  value: {
    gate_enabled: true,
    min_supported_version: "0.0.0",
    force_update: false,
    message_ar: "",
    message_en: "",
  },
  updated_at: "2026-11-23T11:00:00.000Z",
  updated_by: "uid-1",
  updated_by_name: "Owner",
  missing: false,
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

function mockFetch() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url: String(url), method: String(init?.method ?? "GET"), body });
    const payload = String(url).includes("native_gate") ? gateBody : workerBody;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderSettings() {
  return render(
    <LangContext.Provider value={ctx}>
      <Settings />
    </LangContext.Provider>,
  );
}

describe("Admin Settings — native version gate", () => {
  it("renders the gate section with the current values", async () => {
    mockFetch();
    renderSettings();
    await waitFor(() => expect(screen.getByText("Native app version gate")).toBeTruthy());
    expect(screen.getByText("Minimum supported version")).toBeTruthy();
    const input = screen.getByDisplayValue("0.0.0") as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it("refuses to save an invalid minimum version", async () => {
    const calls = mockFetch();
    renderSettings();
    await waitFor(() => expect(screen.getByText("Native app version gate")).toBeTruthy());

    const input = screen.getByDisplayValue("0.0.0") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "not-a-version");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    const save = screen.getByRole("button", { name: "Save version gate" });
    save.click();

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("saves the gate row with the version and flags", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();
    await waitFor(() => expect(screen.getByText("Native app version gate")).toBeTruthy());

    const input = screen.getByDisplayValue("0.0.0") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "2.1.0");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // switch order in the DOM: worker tier button, gate kill switch, force update.
    const forceBox = screen.getAllByRole("switch")[2] as HTMLInputElement;
    forceBox.click();

    (screen.getByRole("button", { name: "Save version gate" }) as HTMLButtonElement).click();

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST");
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({
        key: "native_gate",
        value: { min_supported_version: "2.1.0", force_update: true },
      });
    });
  });
});
