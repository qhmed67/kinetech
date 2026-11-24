import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const directBody = {
  ok: true,
  key: "direct_drive_enabled",
  value: { enabled: true },
  updated_at: "2026-11-25T09:00:00.000Z",
  updated_by: "uid-1",
  updated_by_name: "Owner",
  missing: false,
};

const limitsBody = {
  ok: true,
  key: "session_limits",
  value: {
    mode: "log",
    max_concurrent_sessions: 2,
    max_concurrent_devices: 3,
    heartbeat_ttl_minutes: 30,
    ip_binding: false,
  },
  updated_at: "2026-11-25T09:00:00.000Z",
  updated_by: "uid-1",
  updated_by_name: "Owner",
  missing: false,
};

const ttlBody = {
  ok: true,
  key: "stream_token_ttl_seconds",
  value: { seconds: 3600 },
  updated_at: "2026-11-25T09:00:00.000Z",
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
    const u = String(url);
    let payload = workerBody;
    if (u.includes("native_gate")) payload = gateBody;
    else if (u.includes("direct_drive_enabled")) payload = directBody;
    else if (u.includes("session_limits")) payload = limitsBody;
    else if (u.includes("stream_token_ttl_seconds")) payload = ttlBody;
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

describe("Admin Settings — Direct tier, session limits and token lifetime", () => {
  it("shows the Direct Drive tier in its stored state", async () => {
    mockFetch();
    renderSettings();
    await waitFor(() => expect(screen.getByText("Direct Drive tier")).toBeTruthy());
    expect(screen.getByRole("switch", { name: /Direct tier enabled/i })).toBeTruthy();
  });

  it("turns the Direct tier off only after the confirmation", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();
    await waitFor(() => expect(screen.getByText("Direct Drive tier")).toBeTruthy());

    (screen.getByRole("switch", { name: /Direct tier enabled/i }) as HTMLButtonElement).click();

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && (c.body as { key?: string })?.key === "direct_drive_enabled");
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({ key: "direct_drive_enabled", value: { enabled: false } });
    });
  });

  it("keeps the Direct tier as it is when the confirmation is declined", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSettings();
    await waitFor(() => expect(screen.getByText("Direct Drive tier")).toBeTruthy());

    (screen.getByRole("switch", { name: /Direct tier enabled/i }) as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("ships the session limits in log-only mode", async () => {
    mockFetch();
    renderSettings();
    await waitFor(() => expect(screen.getByText("Concurrent sessions & devices")).toBeTruthy());
    const select = screen.getByDisplayValue("Log only (recommended)") as HTMLSelectElement;
    expect(select.value).toBe("log");
  });

  it("saves the limits in enforce mode with the typed numbers", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();
    await waitFor(() => expect(screen.getByText("Concurrent sessions & devices")).toBeTruthy());

    fireEvent.change(screen.getByDisplayValue("Log only (recommended)"), { target: { value: "enforce" } });
    fireEvent.change(screen.getByDisplayValue("2"), { target: { value: "5" } });
    (screen.getByRole("button", { name: "Save limits" }) as HTMLButtonElement).click();

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && (c.body as { key?: string })?.key === "session_limits");
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({
        key: "session_limits",
        value: {
          mode: "enforce",
          max_concurrent_sessions: 5,
          max_concurrent_devices: 3,
          heartbeat_ttl_minutes: 30,
          ip_binding: false,
        },
      });
    });
  });

  it("saves the stream token lifetime", async () => {
    const calls = mockFetch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderSettings();
    await waitFor(() => expect(screen.getByText("Stream token lifetime")).toBeTruthy());

    fireEvent.change(screen.getByDisplayValue("3600"), { target: { value: "1800" } });
    (screen.getByRole("button", { name: "Save lifetime" }) as HTMLButtonElement).click();

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && (c.body as { key?: string })?.key === "stream_token_ttl_seconds");
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({ key: "stream_token_ttl_seconds", value: { seconds: 1800 } });
    });
  });
});
