import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppUpdateRequired } from "../AppUpdateRequired";
import { LangContext } from "../lang";
import { STR } from "../../i18n";
import { UPDATE_REQUIRED_EVENT } from "../../lib/appGate";

const ctx = { lang: "en" as const, t: STR.en, toggle: () => {} };

function renderScreen() {
  return render(
    <LangContext.Provider value={ctx}>
      <AppUpdateRequired />
    </LangContext.Provider>,
  );
}

const gateResponse = (gate: Record<string, unknown>) =>
  vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, native_gate: gate }),
  });

beforeEach(() => {
  // The shell injects these into the page; the window flag is what the web
  // layer reads to know the installed app version.
  (window as unknown as { __KT_APP_VERSION__?: string }).__KT_APP_VERSION__ = "1.0.0";
});

afterEach(() => {
  delete (window as unknown as { __KT_APP_VERSION__?: string }).__KT_APP_VERSION__;
  vi.unstubAllGlobals();
});

describe("AppUpdateRequired", () => {
  it("renders nothing when the gate allows this client", async () => {
    vi.stubGlobal(
      "fetch",
      gateResponse({ gate_enabled: true, min_supported_version: "0.5.0", force_update: true }),
    );
    const { container } = renderScreen();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when /api/app-config is unreachable (fail-open)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { container } = renderScreen();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a browser client (no version)", async () => {
    delete (window as unknown as { __KT_APP_VERSION__?: string }).__KT_APP_VERSION__;
    vi.stubGlobal(
      "fetch",
      gateResponse({ gate_enabled: true, min_supported_version: "9.0.0", force_update: true }),
    );
    const { container } = renderScreen();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("blocks an outdated client with the update screen", async () => {
    vi.stubGlobal(
      "fetch",
      gateResponse({ gate_enabled: true, min_supported_version: "2.0.0", force_update: true }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByText("Update required")).toBeTruthy());
    expect(screen.getByText("1.0.0")).toBeTruthy();
    expect(screen.getByText("2.0.0")).toBeTruthy();
  });

  it("blocks on a 426 event even if the config says the version is fine", async () => {
    vi.stubGlobal(
      "fetch",
      gateResponse({ gate_enabled: true, min_supported_version: "0.0.0", force_update: true }),
    );
    renderScreen();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Update required")).toBeNull();

    window.dispatchEvent(
      new CustomEvent(UPDATE_REQUIRED_EVENT, { detail: { en: "Please update", minSupportedVersion: "2.0.0" } }),
    );
    await waitFor(() => expect(screen.getByText("Update required")).toBeTruthy());
  });

  it("does not block when force_update is off", async () => {
    vi.stubGlobal(
      "fetch",
      gateResponse({ gate_enabled: true, min_supported_version: "9.0.0", force_update: false }),
    );
    const { container } = renderScreen();
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});
