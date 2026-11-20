# Thiết kế Hướng dẫn Người mới & Kịch bản Thực hành 1-Click cho Mini App Dev Studio

**Ngày:** 2026-11-20  
**Mục tiêu:** Bổ sung hệ thống onboarding tương tác (**Hướng 1**) ngay trong `MiniAppDevStudio` và `MiniAppBridgeModal` để người mới biết cách khai thác hết toàn bộ chức năng (Hợp đồng 2 Chiều, Starter Code, Giả lập Host iOS/Android, Fault Injection, Wire Console, và Localhost Iframe + Dev Bridge Shim), đồng thời đảm bảo người dùng quay lại lần 2+ **không bao giờ bị mất đường mở lại hướng dẫn**.

---

## 1. Nguyên tắc "Không ẩn vĩnh viễn" cho lần truy cập sau

- **Chỉ thanh Banner gợi ý 1 dòng** ở đầu `MiniAppDevStudio` là tự ẩn sau khi người dùng bấm đóng (`X`) hoặc hoàn tất Tour (lưu khóa `vbot-miniapp-studio-banner-v1` vào `localStorage`).
- **Nút `? Hướng dẫn` ghim cố định** trên thanh header của `MiniAppBridgeModal` (hiển thị ở mọi tab) mở ra `MiniAppStudioGuidePopover`, cho phép bất kỳ lúc nào cũng có thể:
  1. Chạy lại **Spotlight Tour tương tác (6 bước)**.
  2. Chạy ngay **5 Kịch bản thực hành 1-Click**.
  3. Tra cứu **Quy trình 4 bước cho Dev mới** & **Bản đồ 6 Tab** (bấm để chuyển tab).
  4. Bấm **`Hiện lại thanh gợi ý đầu trang`** nếu muốn bật lại Banner.
- **Các Tooltip `?` ngữ cảnh** cạnh `Role`, `Giả lập lỗi`, `Mini App → Host`, `Host → Mini App`, `Wire Console`, và `Iframe Localhost` luôn hiển thị thường trực.

---

## 2. Kiến trúc 4 phần triển khai

1. **`src/core/miniAppStudioGuide.ts`**
   - Lưu/đọc trạng thái banner (`loadStudioBannerDismissed`, `saveStudioBannerDismissed`) an toàn khi `localStorage` bị chặn.
   - `STUDIO_TOUR_STEPS` (6 bước highlight tương ứng 6 `[data-studio-tour="..."]`), tự điều hướng sang tab UI cần thiết (`sandbox` / `contract` / `iframe`).
   - `STUDIO_QUICK_RECIPES` (5 kịch bản mẫu cấu hình sẵn app, nền tảng iOS/Android, fault injection, phone mode và lệnh chạy ngay).
   - `BRIDGE_MODAL_TABS_GUIDE` (6 tab) & `MINI_APP_WORKFLOW_STEPS` (4 bước).

2. **`src/components/MiniAppStudioTourOverlay.vue`**
   - Overlay `<Teleport to="body">` thuần TypeScript + DOM `getBoundingClientRect()` (không phụ thuộc thư viện ngoài), khoét sáng vùng UI đang chọn, tự cuộn vào khung hình và tự căn vị trí thẻ giải thích tránh tràn viền trên mọi độ phân giải, hỗ trợ `← / → / Esc`.

3. **`src/components/MiniAppStudioGuidePopover.vue`**
   - Cửa sổ hướng dẫn trung tâm mở từ nút `? Hướng dẫn`, tích hợp nút chạy lại Tour, nút khôi phục Banner, 5 Kịch bản 1-Click, Quy trình 4 bước và Bản đồ 6 tab.

4. **Tích hợp & Liên kết chéo (bảo toàn OWASP A01)**
   - Gắn `data-studio-tour`, Banner lần đầu, Tooltip `?`, `prepareForTourStep` & `runQuickRecipe` vào `MiniAppPhonePreview.vue` và `MiniAppDevStudio.vue`.
   - Gắn nút `? Hướng dẫn`, `MiniAppStudioTourOverlay` và `MiniAppStudioGuidePopover` vào `MiniAppBridgeModal.vue` (ưu tiên xử lý `Esc` đúng thứ tự Tour → Guide → Modal).
   - Thêm nút mở thẳng **Mini App Dev Studio** ở bước 4 trong `TechGuidePanel.vue` / `GuideGlossaryModal.vue` / `App.vue` phía sau guard `__ENABLE_TECH_MODE__`, bảo đảm `dist-public/` sạch 100%.
