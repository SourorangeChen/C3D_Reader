import { test, expect } from "@playwright/test";
import {
  chineseError,
  DESKTOP_ERROR_MARKER,
  errorMessage,
  localizedError,
} from "../frontend/src/errors";

test("coded errors render in both languages with parameters", () => {
  const english = localizedError("channel_count_invalid", { maximum: 8 }, "x");
  expect(english).toBe("Select between 1 and 8 valid channels.");
  expect(chineseError(english)).toBe("请选择 1 到 8 个有效通道。");
  expect(localizedError("unknown_code", {}, "fallback text")).toBe(
    "fallback text",
  );
  expect(localizedError(null, null, "plain")).toBe("plain");
});

test("desktop IPC errors keep the backend code", () => {
  const body = {
    detail: "Select a valid .c3d file.",
    code: "c3d_file_required",
  };
  const ipc = new Error(
    `Error invoking remote method 'c3d:open': Error: ${DESKTOP_ERROR_MARKER}${JSON.stringify(body)}`,
  );
  const message = errorMessage(ipc);
  expect(message).toBe("Select a valid .c3d file.");
  expect(chineseError(message)).toBe("请选择有效的 .c3d 文件。");
  expect(
    errorMessage(
      new Error(
        "Error invoking remote method 'c3d:open': Error: 无法读取文件。",
      ),
    ),
  ).toBe("无法读取文件。");
});
