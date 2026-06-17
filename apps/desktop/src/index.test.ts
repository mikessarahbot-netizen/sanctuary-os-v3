import { describe, expect, it } from "vitest";
import { DESKTOP_APP_NAME, describePresenterDesktopLocalSyncRuntime } from "./index.js";

describe("Sanctuary OS desktop scaffold", () => {
  it("exposes the desktop app name", () => {
    expect(DESKTOP_APP_NAME).toBe("sanctuary-os-desktop");
  });

  it("describes a default SQLite-backed local sync runtime", () => {
    const description = describePresenterDesktopLocalSyncRuntime();

    expect(description.appName).toBe("sanctuary-os-desktop");
    expect(description.persistence.database.runtime).toBe("sqlite");
    expect(description.persistence.environment).toBe("development");
  });

  it("passes a supplied environment through to the runtime description", () => {
    const description = describePresenterDesktopLocalSyncRuntime({ environment: "production" });

    expect(description.persistence.environment).toBe("production");
  });
});
