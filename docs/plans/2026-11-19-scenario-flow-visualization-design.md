# Thiết kế: Biểu đồ luồng chạy thử kịch bản (Hybrid Stepper + Flowchart / Sequence Dialog)

**Ngày:** 2026-11-19  
**Trạng thái:** Đã duyệt & Triển khai  
**Mục tiêu:** Giúp cả người dùng mới (`Tổng quan / Public`) và lập trình viên/QA (`Kỹ thuật / Internal`) nhìn rõ luồng chạy từng bước và tương tác giữa các thành phần khi chọn **Chạy thử kịch bản**.

---

## 1. Kiến trúc Hybrid 2 tầng

### Tầng A — Stepper ngay trên `ScenarioBar` & Canvas chính
- Khi người dùng chọn một kịch bản ở góc dưới-trái (`ScenarioBar`), state chuyển ngay vào bước đầu tiên (`activeScenarioStepIndex = 0`).
- Thanh điều khiển hiển thị `◀ Bước X / N ▶`, nút **Tự chạy / Tạm dừng** (chu kỳ `1.8s`/bước, tự dừng ở bước cuối) và nút **Xem biểu đồ luồng**.
- Trên `FlowCanvas` & `AppFlowNode`:
  - Node của bước hiện tại sáng nổi bật (`ring-2 ring-blue-600 shadow-lg`), các node trong kịch bản mang badge thứ tự `#1..#N`.
  - Cạnh đi vào bước hiện tại chạy animation mũi tên đậm; các cạnh đã đi qua sáng đậm, cạnh sắp tới sáng vừa; node/cạnh ngoài kịch bản làm mờ.
  - Camera tự trượt mượt theo từng bước (`CameraTarget.kind = 'scenario_step'`).

### Tầng B — Dialog biểu đồ rộng (`ScenarioFlowDialog`)
- Mở dạng modal rộng (`max-w-5xl`, chia 2 cột `Biểu đồ 7/12` | `Chi tiết bước 5/12`):
  - **Chế độ Tổng quan / Public:** Chỉ hiển thị **Sơ đồ luồng từng bước (Flowchart)** với nhãn điều kiện, giải thích dễ hiểu và ảnh minh họa (nếu có), cùng nút **Xem trên sơ đồ chính**. Không nạp code/chuỗi kỹ thuật.
  - **Chế độ Kỹ thuật / Internal:** Có thêm tab chuyển đổi **Sơ đồ luồng** ↔ **Biểu đồ tuần tự (Sequence)** (tự ưu tiên mở Sequence cho các kịch bản có Mini App hoặc đa làn), bộ lọc `iOS | Android | So sánh`, xuất SVG/PNG riêng cho kịch bản, và cột phải hiển thị chi tiết `summary.tech`, chênh lệch iOS/Android, API/Event, JSON Payload/Response mẫu (Copy 1-click) và `codeRefs`.

---

## 2. Suy luận dữ liệu từ JSON sẵn có (Zero JSON re-authoring)
1. **`src/core/scenarioFlowEngine.ts`:**
   - Nhận `Scenario` + `VisibleFlowResult` (đã qua `filterAndBridgeSubtree`) + `ViewMode` để tạo `ScenarioTimelineModel` gồm `ScenarioStep[]` và `stepEdgeIds[]`.
   - Khi ở bản Public (`overview`), tự động nối tắt qua các node `tech` bị ẩn và chỉ lấy `label`, `summary.overview`, `edge.label`.
   - Cung cấp `renderScenarioFlowchartSvg(model)` xuất SVG Flowchart độc lập DOM.
2. **`src/core/scenarioSequenceBuilder.ts` *(chỉ nạp ở Internal)*:**
   - Từ `ScenarioTimelineModel` & `PlatformViewMode` tự suy luận tối đa 4 làn thực sự tham gia: **Người dùng** ↔ **Host App (iOS / Android)** ↔ **Mini App** ↔ **Server / Tổng đài**.
   - Suy luận chiều gọi từ `kind` (`action`, `miniapp`, `external`, `process`/`decision`/`error`) và `techDetail.miniAppBridge.messages` (`miniapp_to_host` vs `host_to_miniapp` / `host_init`).
   - Cung cấp `renderScenarioSequenceSvg(model, activeStepIndex)` xuất SVG Sequence Diagram hoàn chỉnh.

---

## 3. Cách ly bảo mật Public Bundle (`BUILD_TARGET=public`)
- Các module chỉ dành cho Kỹ thuật (`scenarioSequenceBuilder.ts`, `ScenarioSequenceDiagram.vue`, `ScenarioStepTechDetail.vue`, `TechPlatformSwitcher.vue`) chỉ được import động sau cờ biên dịch `__ENABLE_TECH_MODE__` (`defineAsyncComponent` / dynamic `import()`).
- Các file chạy ở Public (`scenarioFlowEngine.ts`, `ScenarioFlowchartView.vue`, `ScenarioFlowDialog.vue`, `ScenarioBar.vue`) tuyệt đối không chứa từ khóa hay logic kỹ thuật.
