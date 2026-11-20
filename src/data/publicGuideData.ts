// src/data/publicGuideData.ts
export interface PublicGuideStep {
  title: string;
  description: string;
}

export interface PublicConceptItem {
  term: string;
  description: string;
  relatedNodeId?: string;
}

export const PUBLIC_GUIDE_STEPS: PublicGuideStep[] = [
  {
    title: '1. Bấm vào thẻ bất kỳ để đọc chi tiết',
    description:
      'Bảng thông tin bên phải sẽ mở ra với mô tả dễ hiểu, ảnh minh họa màn hình (khi có) và các mục liên quan.',
  },
  {
    title: '2. Bấm nút +N hoặc bấm đúp để bung luồng',
    description:
      'Các thẻ có nút tròn +N ở mép phải còn chứa các bước chi tiết bên trong. Bấm vào +N (hoặc bấm đúp thẻ) để mở rộng hoặc thu gọn nhánh.',
  },
  {
    title: '3. Di chuyển & thu phóng sơ đồ',
    description:
      'Giữ chuột trên vùng trống để kéo sơ đồ, cuộn chuột để phóng to/thu nhỏ, hoặc dùng các nút điều khiển ở góc dưới bên phải.',
  },
  {
    title: '4. Chạy thử kịch bản & Tìm kiếm nhanh (⌘K)',
    description:
      'Khi mở một nhánh có sẵn kịch bản mẫu, hộp "Chạy thử kịch bản" ở góc dưới bên trái sẽ giúp làm nổi bật từng đường đi cụ thể.',
  },
];

export const PUBLIC_CONCEPTS: PublicConceptItem[] = [
  {
    term: 'Hotline',
    description:
      'Đầu số tổng đài đại diện cho doanh nghiệp khi nghe cuộc gọi đến hoặc hiển thị với khách hàng lúc nhân viên gọi ra.',
    relatedNodeId: 'hotline-project',
  },
  {
    term: 'Dự án (Project)',
    description:
      'Không gian làm việc tách biệt theo từng doanh nghiệp hoặc chi nhánh; mỗi dự án quản lý danh sách đầu số Hotline, nhân sự và lịch sử gọi riêng.',
    relatedNodeId: 'hotline-project',
  },
  {
    term: 'Xác thực 2 lớp (2FA / OTP)',
    description:
      'Lớp bảo vệ bổ sung ngoài mật khẩu: người dùng cần nhập thêm mã xác thực 6 chữ số khi đăng nhập để bảo đảm an toàn tài khoản.',
    relatedNodeId: 'auth-login-2fa',
  },
  {
    term: 'Chuyển tiếp cuộc gọi (Chuyển ngay vs Hỏi trước)',
    description:
      'Chuyển ngay đưa khách sang đồng nghiệp hoặc số ngoài ngay lập tức; Hỏi trước giữ máy khách để nhân viên trao đổi riêng với người nhận rồi mới bàn giao.',
    relatedNodeId: 'call-transfer',
  },
  {
    term: 'Quay số tự động (Autodial)',
    description:
      'Tính năng tự động gọi lần lượt danh sách khách hàng trong chiến dịch, giúp nhân viên không phải bấm từng số thủ công.',
    relatedNodeId: 'ma-autodial',
  },
  {
    term: 'Mini App',
    description:
      'Các tiện ích mở rộng chạy ngay bên trong VBot (như Danh bạ, Lịch sử cuộc gọi, Giám sát, Chiến dịch gọi tự động) giúp cập nhật tính năng nhanh mà không cần cài lại app.',
    relatedNodeId: 'miniapp-list',
  },
  {
    term: 'Danh bạ cá nhân vs Danh bạ chuyển tiếp',
    description:
      'Danh bạ cá nhân là danh sách liên hệ riêng của từng tài khoản đăng nhập (được đồng bộ đa thiết bị); Danh bạ chuyển tiếp là danh sách đơn vị/khách hàng dùng chung khi tra cứu và chuyển tiếp cuộc gọi.',
    relatedNodeId: 'contact-personal',
  },
];
