# Bộ Dữ Liệu Mẫu — VBot App Flow Explorer

Thư mục này chứa bộ dữ liệu JSON chuẩn (`schemaVersion: "1.0"`) trích xuất từ mã nguồn và tài liệu thực tế của `VBot-iOS`, sẵn sàng copy sang repo web Vue 3 mới để dựng giao diện biểu đồ **1 cây–luồng thống nhất (Expand/Collapse)**.

---

## 1. Cấu trúc thư mục

```text
docs/flow-explorer-sample/
  app.json                 # Gốc VBot App + 7 nhánh chức năng lớn + inlineSubtrees cho 4 nhánh phụ
  modules/
    calling.json           # Luồng sâu: Gọi đến (PushKit/CallKit/CRM), Gọi đi, Chuyển tiếp, Điều khiển
    auth.json              # Luồng sâu: Đăng nhập 2FA (RAM-only), Khóa 429, SETUP_2FA Socket, Quên mật khẩu
    contacts.json          # Luồng sâu: Danh bạ cá nhân (SQLite theo uid), Đồng bộ/Quyền, CRUD 50, Contact V2
  README.md
```

---

## 2. Cách sử dụng khi khởi tạo repo web Vue 3 mới

Thực hiện theo kế hoạch chi tiết tại [2026-11-19-app-flow-explorer-web-plan.md](file:///Users/namhoang/Documents/GitHub/VBot/VBot-iOS/docs/plans/2026-11-19-app-flow-explorer-web-plan.md):

```bash
# Copy toàn bộ JSON mẫu vào thư mục data/ của repo web mới
mkdir -p ../vbot-flow-explorer/data
cp -R docs/flow-explorer-sample/* ../vbot-flow-explorer/data/

# Kiểm tra tính toàn vẹn dữ liệu bằng Zod validator trong repo web
cd ../vbot-flow-explorer
npm run validate:data
```

---

## 3. Danh sách ảnh minh họa gợi ý (`public/media/`)

Các file JSON đã gắn sẵn đường dẫn ảnh chuẩn bị cho chế độ **Gallery / Phone Frame** trong Side Drawer và nút **Hiện ảnh trên sơ đồ**. Khi chưa đặt ảnh thật, giao diện tự ẩn khung ảnh an toàn. Khi có ảnh chụp màn hình hoặc sơ đồ, đặt đúng vào `public/media/` của repo web mới (khuyên dùng `.webp` cho nhẹ):

| Đường dẫn trong `public/` | Đối tượng (`audience`) | Nội dung màn hình cần chụp |
| :--- | :--- | :--- |
| `media/app/vbot-home.webp` | `all` | Màn hình chính VBot với 4 tab điều hướng dưới cùng và thanh trạng thái tổng đài |
| `media/app/vbot-architecture.webp` | `tech` | Sơ đồ kiến trúc Host App, Linphone/CallKit, WebSocket và Mini App SDK |
| `media/calling/calling-overview.webp` | `all` | Giao diện màn hình gọi tổng quan của VBot |
| `media/calling/incoming-callkit.webp` | `all` | Màn hình đổ chuông CallKit khi có cuộc gọi đến (hiển thị tên khách hàng) |
| `media/calling/in-call-active.webp` | `all` | Màn hình đàm thoại chính với các nút tiện ích (Mute, Loa, Giữ máy, Chuyển tiếp...) |
| `media/calling/dialpad.webp` | `all` | Bàn phím số gọi đi kèm gợi ý liên hệ |
| `media/calling/transfer-sheet.webp` | `all` | Popup chọn thành viên / danh bạ để chuyển tiếp cuộc gọi |
| `media/auth/login-screen.webp` | `all` | Màn hình đăng nhập VBot |
| `media/auth/2fa-otp.webp` | `all` | Màn hình nhập 6 ô OTP xác thực 2 lớp kèm đồng hồ đếm ngược 05:00 |
| `media/contacts/contacts-list.webp` | `all` | Tab Danh bạ cá nhân có thanh chữ cái A–Z và biểu tượng Điện thoại / VBot |
| `media/contacts/contacts-menu-plus.webp` | `all` | Popover menu dấu `+` ở góc trên bên phải Tab Danh bạ |
| `media/contacts/contact-v2.webp` | `all` | Màn hình Danh bạ chuyển tiếp (Contact V2) theo địa bàn/đơn vị |

---

## 4. Kiểm tra nhanh JSON bằng Python (không cần cài Node)

```bash
python3 -m json.tool docs/flow-explorer-sample/app.json > /dev/null && \
python3 -m json.tool docs/flow-explorer-sample/modules/calling.json > /dev/null && \
python3 -m json.tool docs/flow-explorer-sample/modules/auth.json > /dev/null && \
python3 -m json.tool docs/flow-explorer-sample/modules/contacts.json > /dev/null && \
echo "JSON_SYNTAX_OK"
```
