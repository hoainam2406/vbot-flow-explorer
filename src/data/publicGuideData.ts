// src/data/publicGuideData.ts
import type {
  AppTourStep,
  GuideFeatureCategory,
  GuideWorkflowRecipe,
} from '../core/appTourEngine';

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

export const PUBLIC_TOUR_STEPS: AppTourStep[] = [
  {
    id: 'public-brand',
    stepNumber: 1,
    title: 'Thanh tiêu đề & Đường dẫn nhánh (Breadcrumb)',
    description:
      'Hiển thị tên hệ thống và vị trí nhánh bạn đang xem. Bấm vào nút gốc hoặc tên từng cấp trong thanh đường dẫn để quay về toàn cảnh sơ đồ nhanh chóng.',
    tip: 'Khi đang phóng to riêng một nhánh (Focus), nút "Xem toàn bộ" sẽ xuất hiện ngay bên cạnh.',
    targetSelector: '[data-tour="topbar-brand"]',
  },
  {
    id: 'public-search',
    stepNumber: 2,
    title: 'Tìm kiếm nhanh & Bảng lệnh (⌘K)',
    description:
      'Gõ bất kỳ tên màn hình, tính năng hoặc thao tác nào để nhảy ngay tới thẻ tương ứng, kể cả khi nhánh đó đang thu gọn.',
    tip: 'Hỗ trợ gõ tiếng Việt không dấu (ví dụ gõ "chuyen tiep", "dang nhap") và bật nhanh các lệnh điều hướng.',
    targetSelector: '[data-tour="topbar-search"]',
  },
  {
    id: 'public-canvas',
    stepNumber: 3,
    title: 'Sơ đồ luồng tương tác',
    description:
      'Kéo nền trống để di chuyển, cuộn chuột để phóng to/thu nhỏ. Bấm vào thẻ bất kỳ để mở bảng chi tiết bên phải, hoặc bấm nút +N để bung các bước con bên trong.',
    tip: 'Có thể dùng 4 phím mũi tên ↑ ↓ ← → để di chuyển giữa các thẻ và Enter để bung/thu gọn nhánh.',
    targetSelector: '[data-tour="canvas-area"]',
  },
  {
    id: 'public-scenario',
    stepNumber: 4,
    title: 'Chạy thử kịch bản từng bước',
    description:
      'Mỗi khi mở một nhánh có kịch bản mẫu, thanh ở góc dưới bên trái giúp bạn chọn từng tình huống và chạy qua từng bước đi kèm sơ đồ trình tự trực quan.',
    tip: 'Dùng phím [ hoặc ] để tiến/lùi từng bước hoặc bấm Phát tự động.',
    targetSelector: '[data-tour="scenario-bar"]',
    fallbackHint: 'Thanh này xuất hiện ở góc dưới trái khi nhánh đang mở có kịch bản mẫu (ví dụ Gọi thoại).',
    ensureSampleExpanded: true,
  },
  {
    id: 'public-dock',
    stepNumber: 5,
    title: 'Thanh điều khiển, Hướng sơ đồ & Chú giải',
    description:
      'Góc dưới bên phải tập trung nút Thu/Phóng, Căn vừa màn hình (F), Đổi hướng ngang/dọc, Bật/Tắt ảnh trên thẻ, Zen Mode (Z) và Bảng chú giải màu sắc.',
    tip: 'Khi thuyết trình cho khách hàng hoặc đội nhóm, hãy bấm Zen Mode (Z) để ẩn các thanh công cụ.',
    targetSelector: '[data-tour="canvas-dock"]',
  },
  {
    id: 'public-export-guide',
    stepNumber: 6,
    title: 'Xuất tài liệu & Mở lại Hướng dẫn (?)',
    description:
      'Bấm "Xuất" ở góc trên phải sơ đồ để tải ảnh PNG/SVG sắc nét, mã Mermaid hoặc file Markdown. Bấm nút dấu hỏi (?) ở thanh trên cùng hoặc phím ? bất kỳ lúc nào để mở lại Sổ tay toàn tập hoặc chạy lại Tour.',
    tip: 'Chúc bạn khám phá VBot App hiệu quả!',
    targetSelector: '[data-tour="topbar-export"]',
  },
];

export const PUBLIC_FEATURE_CATEGORIES: GuideFeatureCategory[] = [
  {
    id: 'canvas-nav',
    label: 'Khám phá Sơ đồ & Chi tiết',
    description: 'Các thao tác cốt lõi để đọc luồng nghiệp vụ, xem ảnh màn hình và chạy kịch bản mẫu.',
    items: [
      {
        id: 'feat-node-drawer',
        categoryId: 'canvas-nav',
        title: 'Xem chi tiết thẻ & Ảnh minh họa màn hình',
        summary: 'Mở bảng chi tiết bên phải để đọc mô tả nghiệp vụ, điều kiện rẽ nhánh và ảnh giao diện.',
        whenToUse: 'Khi bạn muốn hiểu ý nghĩa của một màn hình hoặc bước thao tác cụ thể.',
        steps: [
          'Bấm chuột trái 1 lần vào bất kỳ thẻ nào trên sơ đồ.',
          'Đọc mô tả tổng quan, danh sách bước liên quan và xem ảnh minh họa (nếu có) ở cột bên phải.',
          'Bấm vào các thẻ "Bước trước / Bước tiếp" trong bảng để đi tiếp theo luồng.',
        ],
        actionLabel: 'Mở thử nhánh Gọi thoại',
        action: { type: 'jump_node', nodeId: 'mod-calling', expand: true },
      },
      {
        id: 'feat-expand-focus',
        categoryId: 'canvas-nav',
        title: 'Bung nhánh (+N), Thu gọn & Focus một module',
        summary: 'Mở rộng từng nhánh con khi cần xem sâu hoặc khóa góc nhìn chỉ tập trung vào một module lớn.',
        whenToUse: 'Khi sơ đồ tổng thể có nhiều nhánh và bạn chỉ muốn đào sâu một mảng nghiệp vụ.',
        steps: [
          'Bấm nút tròn +N ở cạnh phải thẻ (hoặc bấm đúp vào thẻ) để bung hoặc thu gọn nhánh con.',
          'Trong bảng chi tiết bên phải, bấm nút "Tập trung nhánh này" để ẩn tạm các module khác.',
          'Bấm "Xem toàn bộ" trên thanh Breadcrumb ở trên cùng để trở lại toàn cảnh.',
        ],
        shortcut: 'Enter / Double Click',
        actionLabel: 'Xem nhánh Đăng nhập & Bảo mật',
        action: { type: 'jump_node', nodeId: 'mod-auth', expand: true },
      },
      {
        id: 'feat-scenarios',
        categoryId: 'canvas-nav',
        title: 'Chạy thử Kịch bản & Sơ đồ Trình tự',
        summary: 'Làm nổi bật đường đi của từng tình huống thực tế và theo dõi theo từng bước tuần tự.',
        whenToUse: 'Khi cần giải thích hoặc kiểm tra trọn vẹn một tình huống (ví dụ: nhận cuộc gọi đến, chuyển tiếp cuộc gọi).',
        steps: [
          'Mở rộng một module chính (như Gọi thoại hoặc Đăng nhập).',
          'Chọn một kịch bản ở hộp "Chạy thử kịch bản" tại góc dưới bên trái.',
          'Dùng nút Trước/Sau (hoặc phím [ và ]) để đi từng bước, hoặc mở hộp thoại sơ đồ trình tự trực quan.',
        ],
        shortcut: '[ / ]',
        actionLabel: 'Thử ngay với Gọi thoại',
        action: { type: 'jump_node', nodeId: 'mod-calling', expand: true },
      },
      {
        id: 'feat-dock-zen',
        categoryId: 'canvas-nav',
        title: 'Thu phóng, Đổi hướng (Ngang/Dọc), Chú giải & Zen Mode',
        summary: 'Tùy chỉnh cách hiển thị sơ đồ theo màn hình của bạn và bật chế độ trình chiếu toàn màn hình.',
        whenToUse: 'Khi demo cho team, chụp ảnh báo cáo hoặc làm việc trên màn hình nhỏ.',
        steps: [
          'Dùng thanh điều khiển góc dưới bên phải để phóng to/thu nhỏ hoặc bấm nút Căn vừa (phím F).',
          'Bấm nút Đổi hướng để chuyển giữa luồng Ngang (LR) và luồng Dọc (TB).',
          'Bấm nút Chú giải để xem ý nghĩa màu sắc của từng loại thẻ, hoặc bấm Zen Mode (Z) để ẩn thanh công cụ.',
        ],
        shortcut: 'F / Z',
        actionLabel: 'Đổi hướng Ngang/Dọc ngay',
        action: { type: 'toggle_direction' },
      },
    ],
  },
  {
    id: 'search-export',
    label: 'Tìm kiếm nhanh & Xuất tài liệu',
    description: 'Tra cứu nhanh mọi màn hình và xuất sơ đồ ra nhiều định dạng chia sẻ.',
    items: [
      {
        id: 'feat-search-palette',
        categoryId: 'search-export',
        title: 'Tìm kiếm nhanh & Bảng lệnh (⌘K / Ctrl+K)',
        summary: 'Tìm bất kỳ bước nào trên toàn app (kể cả trong nhánh đang đóng) và gọi nhanh các lệnh thao tác.',
        whenToUse: 'Khi bạn nhớ tên tính năng nhưng chưa biết nó nằm ở nhánh nào.',
        steps: [
          'Nhấn tổ hợp ⌘K (Mac) hoặc Ctrl+K (Windows), hoặc bấm ô "Tìm nhanh & Lệnh" trên thanh trên cùng.',
          'Gõ từ khóa (hỗ trợ tiếng Việt không dấu) để tìm thẻ hoặc lệnh điều khiển.',
          'Nhấn Enter để nhảy thẳng tới vị trí đó trên sơ đồ và tự động mở các nhánh cha.',
        ],
        shortcut: '⌘K / Ctrl+K',
        actionLabel: 'Mở Tìm nhanh ngay',
        action: { type: 'open_search' },
      },
      {
        id: 'feat-export-docs',
        categoryId: 'search-export',
        title: 'Xuất ảnh PNG / SVG, Mermaid & Tài liệu Markdown',
        summary: 'Đóng gói góc nhìn hiện tại thành ảnh chất lượng cao hoặc tài liệu văn bản để gửi đồng nghiệp.',
        whenToUse: 'Khi cần chèn sơ đồ vào slide, Notion, GitHub hoặc tài liệu bàn giao.',
        steps: [
          'Bung sẵn các nhánh bạn muốn xuất và chọn chế độ hiển thị phù hợp.',
          'Bấm nút "Xuất" ở góc trên bên phải.',
          'Chọn PNG (2×), SVG Vector, Tài liệu (.md) hoặc Copy/Tải mã Mermaid (.mmd).',
        ],
      },
    ],
  },
];

export const PUBLIC_WORKFLOW_RECIPES: GuideWorkflowRecipe[] = [
  {
    id: 'recipe-find-screen',
    goal: 'Tôi muốn tìm nhanh một màn hình hoặc tính năng bất kỳ trên app',
    answer: 'Dùng hộp Tìm nhanh & Bảng lệnh (⌘K) — gõ có dấu hay không dấu đều tìm được.',
    steps: [
      'Nhấn ⌘K (hoặc Ctrl+K)',
      'Gõ từ khóa như "otp", "chuyen tiep", "mini app"',
      'Nhấn Enter để sơ đồ tự mở tới đúng thẻ',
    ],
    badge: 'Nhanh nhất',
    actionLabel: 'Mở Tìm nhanh (⌘K)',
    action: { type: 'open_search' },
  },
  {
    id: 'recipe-walk-scenario',
    goal: 'Tôi muốn xem từng bước người dùng đi qua trong một luồng gọi điện',
    answer: 'Mở nhánh Gọi thoại và dùng thanh "Chạy thử kịch bản" ở góc dưới bên trái.',
    steps: [
      'Bấm nút bên dưới để bung sẵn nhánh Gọi thoại',
      'Chọn 1 kịch bản ở góc dưới trái (ví dụ cuộc gọi đến)',
      'Bấm phím ] hoặc [ để đi qua từng bước',
    ],
    actionLabel: 'Mở luồng Gọi thoại',
    action: { type: 'jump_node', nodeId: 'mod-calling', expand: true },
  },
  {
    id: 'recipe-present-zen',
    goal: 'Tôi muốn trình chiếu sơ đồ gọn đẹp để họp với team',
    answer: 'Bật Zen Mode (phím Z) để ẩn các thanh công cụ và chỉ giữ lại sơ đồ.',
    steps: [
      'Bung các nhánh cần trình bày',
      'Nhấn phím Z (hoặc bấm nút Zen Mode dưới góc phải)',
      'Nhấn Esc hoặc Z để thoát lại bình thường',
    ],
    actionLabel: 'Bật / tắt Zen Mode',
    action: { type: 'toggle_zen' },
  },
  {
    id: 'recipe-tour-again',
    goal: 'Tôi là người mới và muốn được chỉ từng nút trên màn hình',
    answer: 'Chạy Interactive Spotlight Tour — hệ thống sẽ khoanh sáng từng khu vực và giải thích lần lượt.',
    steps: [
      'Bấm nút bên dưới để bắt đầu Tour',
      'Dùng mũi tên ← / → để đi từng bước',
    ],
    badge: 'Người mới',
    actionLabel: 'Bắt đầu Tour 6 bước',
    action: { type: 'start_tour', track: 'overview' },
  },
];
