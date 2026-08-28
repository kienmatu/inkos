import { describe, expect, it } from "vitest";
import { extractStageDetail, mapStageMessageToStatus } from "../interaction/project-tools.js";

/**
 * Stage lines are localized, and the run status is derived by matching their
 * text. Adding a language without teaching the matcher its wording silently
 * downgrades every stage to "no status".
 */
describe("stage log parsing across languages", () => {
  it.each([
    ["Stage: generating foundation", "generating foundation", "planning"],
    ["阶段：生成基础设定", "生成基础设定", "planning"],
    ["Bước: Tạo thiết lập nền tảng", "Tạo thiết lập nền tảng", "planning"],
  ])("reads %s", (line, detail, status) => {
    expect(extractStageDetail(line)).toBe(detail);
    expect(mapStageMessageToStatus(detail)).toBe(status);
  });

  it.each([
    ["Chuẩn bị dữ liệu chương", "planning"],
    ["Dựng ngữ cảnh chạy của chương", "composing"],
    ["Viết bản nháp chương", "writing"],
    ["Kiểm duyệt bản nháp", "assessing"],
    ["Chỉnh sửa chương 3", "repairing"],
    ["Lưu chương hoàn chỉnh", "persisting"],
    ["Đồng bộ chỉ mục bộ nhớ", "persisting"],
    ["Tạo snapshot ban đầu", "persisting"],
  ])("maps the Vietnamese stage %s", (detail, status) => {
    expect(mapStageMessageToStatus(detail)).toBe(status);
  });

  it("returns no status for a line that is not a stage", () => {
    expect(extractStageDetail("something else entirely")).toBeUndefined();
    expect(mapStageMessageToStatus("something else entirely")).toBeUndefined();
  });
});
