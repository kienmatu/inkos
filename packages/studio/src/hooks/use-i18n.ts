import { useApi } from "./use-api";
import type { AppLanguage } from "../lib/app-language";

export const strings = {
  // Header
  "nav.books": { zh: "书籍", en: "Books", vi: "Sách" },
  "nav.newBook": { zh: "新建书籍", en: "New Book", vi: "Sách mới" },
  "nav.createSection": { zh: "开始创作", en: "Start Creating", vi: "Bắt đầu sáng tác" },
  "nav.myBooks": { zh: "我的创作", en: "My Works", vi: "Tác phẩm của tôi" },
  "nav.createNovel": { zh: "长篇小说", en: "Long Novel", vi: "Tiểu thuyết dài" },
  "nav.createShort": { zh: "短篇小说", en: "Short Story", vi: "Truyện ngắn" },
  "work.badgeNovel": { zh: "Novel", en: "Novel", vi: "Tiểu thuyết" },
  "work.badgeShort": { zh: "Short", en: "Short", vi: "Truyện ngắn" },
  "work.statusNeedsReview": { zh: "Needs review", en: "Needs review", vi: "Cần xem lại" },
  "nav.createScript": { zh: "剧本创作", en: "Script", vi: "Kịch bản" },
  "nav.createStoryboard": { zh: "分镜创作", en: "Storyboard", vi: "Phân cảnh" },
  "nav.createInteractiveFilm": { zh: "互动影游", en: "Interactive Film", vi: "Phim tương tác" },
  "nav.createPlay": { zh: "InkOS 互动", en: "InkOS Play", vi: "InkOS Play" },
  "nav.createBranching": { zh: "分支互动", en: "Branching Play", vi: "Truyện phân nhánh" },
  "nav.createFree": { zh: "开放世界", en: "Open World", vi: "Thế giới mở" },
  "nav.createFanfic": { zh: "同人创作", en: "Fanfic", vi: "Đồng nhân" },
  "nav.createContinuation": { zh: "续写创作", en: "Continuation", vi: "Viết tiếp" },
  "nav.createSpinoff": { zh: "番外创作", en: "Side-story", vi: "Ngoại truyện" },
  "nav.createImitation": { zh: "仿写创作", en: "Imitation", vi: "Phỏng bút" },
  "nav.createTranslation": { zh: "翻译译介", en: "Translation", vi: "Dịch thuật" },
  "nav.config": { zh: "模型配置", en: "Model Config", vi: "Cấu hình model" },
  "nav.projectSettings": { zh: "项目设置", en: "Project Settings", vi: "Cài đặt dự án" },
  "nav.connected": { zh: "已连接", en: "Connected", vi: "Đã kết nối" },
  "nav.disconnected": { zh: "未连接", en: "Disconnected", vi: "Chưa kết nối" },

  // Dashboard
  "dash.title": { zh: "书籍列表", en: "Books", vi: "Danh sách sách" },
  "dash.noBooks": { zh: "还没有书", en: "No books yet", vi: "Chưa có sách nào" },
  "dash.createFirst": { zh: "创建第一本书开始写作", en: "Create your first book to get started", vi: "Tạo cuốn sách đầu tiên để bắt đầu" },
  "dash.writeNext": { zh: "写下一章", en: "Write Next", vi: "Viết chương tiếp theo" },
  "dash.writing": { zh: "写作中...", en: "Writing...", vi: "Đang viết..." },
  "dash.stats": { zh: "统计", en: "Stats", vi: "Thống kê" },
  "dash.chapters": { zh: "章", en: "chapters", vi: "chương" },
  "dash.recentEvents": { zh: "最近事件", en: "Recent Events", vi: "Hoạt động gần đây" },
  "dash.writingProgress": { zh: "写作进度", en: "Writing Progress", vi: "Tiến độ viết" },

  // Book Detail
  "book.writeNext": { zh: "写下一章", en: "Write Next", vi: "Viết chương tiếp theo" },
  "book.draftOnly": { zh: "仅草稿", en: "Draft Only", vi: "Chỉ bản nháp" },
  "book.approveAll": { zh: "全部通过", en: "Approve All", vi: "Duyệt tất cả" },
  "book.analytics": { zh: "数据分析", en: "Analytics", vi: "Phân tích dữ liệu" },
  "book.noChapters": { zh: "暂无章节，点击「写下一章」开始", en: 'No chapters yet. Click "Write Next" to start.', vi: 'Chưa có chương nào. Nhấn "Viết chương tiếp theo" để bắt đầu.' },
  "book.approve": { zh: "通过", en: "Approve", vi: "Duyệt" },
  "book.reject": { zh: "驳回", en: "Reject", vi: "Từ chối" },
  "book.words": { zh: "字", en: "words", vi: "từ" },

  // Chapter Reader
  "reader.backToList": { zh: "返回列表", en: "Back to List", vi: "Về danh sách" },
  "reader.approve": { zh: "通过", en: "Approve", vi: "Duyệt" },
  "reader.reject": { zh: "驳回", en: "Reject", vi: "Từ chối" },
  "reader.chapterList": { zh: "章节列表", en: "Chapter List", vi: "Danh sách chương" },
  "reader.characters": { zh: "字符", en: "characters", vi: "ký tự" },
  "reader.edit": { zh: "编辑", en: "Edit", vi: "Chỉnh sửa" },
  "reader.preview": { zh: "预览", en: "Preview", vi: "Xem trước" },
  "reader.workspace": { zh: "章节工作台", en: "Chapter Workspace", vi: "Bàn làm việc chương" },
  "reader.workspaceHint": { zh: "提示词会持续作用于本章；重写前会自动保留当前版本。", en: "The brief stays attached to this chapter. Rewrites archive the current version first.", vi: "Ghi chú này gắn với chương hiện tại. Trước khi viết lại, bản hiện tại sẽ được lưu trữ tự động." },
  "reader.chapterBrief": { zh: "本章提示词", en: "Chapter Brief", vi: "Ghi chú cho chương" },
  "reader.chapterBriefPlaceholder": { zh: "写清楚要保留什么、重做什么，以及不能改变的事实。", en: "State what to preserve, what to rework, and which facts must not change.", vi: "Nêu rõ cần giữ gì, cần làm lại gì, và những dữ kiện không được thay đổi." },
  "reader.saveBrief": { zh: "保存提示词", en: "Save Brief", vi: "Lưu ghi chú" },
  "reader.rewriteFromBrief": { zh: "按提示重写", en: "Rewrite from Brief", vi: "Viết lại theo ghi chú" },
  "reader.rewriting": { zh: "重写中...", en: "Rewriting...", vi: "Đang viết lại..." },
  "reader.inspiration": { zh: "随机抽卡", en: "Draw Inspiration", vi: "Rút thẻ cảm hứng" },
  "reader.drawing": { zh: "抽取中...", en: "Drawing...", vi: "Đang rút..." },
  "reader.addToBrief": { zh: "加入提示词", en: "Add to Brief", vi: "Thêm vào ghi chú" },
  "reader.generatedPlan": { zh: "查看系统章节计划", en: "View Generated Chapter Plan", vi: "Xem kế hoạch chương của hệ thống" },
  "reader.noPlan": { zh: "本章没有持久化的系统计划。", en: "No generated plan was persisted for this chapter.", vi: "Chương này không lưu kế hoạch nào từ hệ thống." },
  "reader.versionHistory": { zh: "历史版本", en: "Version History", vi: "Lịch sử phiên bản" },
  "reader.noVersions": { zh: "重写或编辑后，旧版本会出现在这里。", en: "Previous versions appear here after edits or rewrites.", vi: "Các bản cũ sẽ xuất hiện ở đây sau khi chỉnh sửa hoặc viết lại." },
  "reader.viewVersion": { zh: "查看", en: "View", vi: "Xem" },
  "reader.restoreVersion": { zh: "恢复", en: "Restore", vi: "Khôi phục" },
  "reader.restoreConfirm": { zh: "恢复这个版本？当前正文会先自动归档。", en: "Restore this version? The current manuscript will be archived first.", vi: "Khôi phục phiên bản này? Bản thảo hiện tại sẽ được lưu trữ trước." },
  "reader.deleteChapter": { zh: "删除本章", en: "Delete Chapter", vi: "Xóa chương này" },
  "reader.deleteChapterConfirm": { zh: "只允许删除最新章。确认删除并回滚到上一章状态？", en: "Only the latest chapter can be deleted. Delete it and roll state back to the previous chapter?", vi: "Chỉ có thể xóa chương mới nhất. Xóa chương này và đưa trạng thái về chương trước?" },
  "reader.saved": { zh: "已保存", en: "Saved", vi: "Đã lưu" },
  "reader.rewriteComplete": { zh: "重写完成，旧稿已归档。", en: "Rewrite complete. The previous version was archived.", vi: "Đã viết lại xong. Bản cũ đã được lưu trữ." },
  "reader.restoreComplete": { zh: "版本已恢复。", en: "Version restored.", vi: "Đã khôi phục phiên bản." },

  // Book Create
  "create.title": { zh: "创建书籍", en: "Create Book", vi: "Tạo sách" },
  "create.bookTitle": { zh: "书名", en: "Title", vi: "Tên sách" },
  "create.language": { zh: "语言", en: "Language", vi: "Ngôn ngữ" },
  "create.genre": { zh: "题材", en: "Genre", vi: "Thể loại" },
  "create.wordsPerChapter": { zh: "每章字数", en: "Words / Chapter", vi: "Số từ mỗi chương" },
  "create.targetChapters": { zh: "目标章数", en: "Target Chapters", vi: "Số chương mục tiêu" },
  "create.creating": { zh: "创建中...", en: "Creating...", vi: "Đang tạo..." },
  "create.submit": { zh: "创建书籍", en: "Create Book", vi: "Tạo sách" },
  "create.titleRequired": { zh: "请输入书名", en: "Title is required", vi: "Vui lòng nhập tên sách" },
  "create.genreRequired": { zh: "请选择题材", en: "Genre is required", vi: "Vui lòng chọn thể loại" },
  "create.placeholder": { zh: "请输入书名...", en: "Book title...", vi: "Nhập tên sách..." },

  // Analytics
  "analytics.title": { zh: "数据分析", en: "Analytics", vi: "Phân tích dữ liệu" },
  "analytics.totalChapters": { zh: "总章数", en: "Total Chapters", vi: "Tổng số chương" },
  "analytics.totalWords": { zh: "总字数", en: "Total Words", vi: "Tổng số từ" },
  "analytics.avgWords": { zh: "平均字数/章", en: "Avg Words/Chapter", vi: "Từ TB/chương" },
  "analytics.statusDist": { zh: "状态分布", en: "Status Distribution", vi: "Phân bố trạng thái" },

  // Breadcrumb
  "bread.books": { zh: "书籍", en: "Books", vi: "Sách" },
  "bread.newBook": { zh: "新建书籍", en: "New Book", vi: "Sách mới" },
  "bread.config": { zh: "配置", en: "Config", vi: "Cấu hình" },
  "bread.home": { zh: "首页", en: "Home", vi: "Trang chủ" },
  "bread.chapter": { zh: "第{n}章", en: "Chapter {n}", vi: "Chương {n}" },
  "bread.film": { zh: "剧情树", en: "Story Tree", vi: "Cây cốt truyện" },

  // Config
  "config.title": { zh: "项目配置", en: "Project Config", vi: "Cấu hình dự án" },
  "config.project": { zh: "项目名", en: "Project", vi: "Dự án" },
  "config.language": { zh: "语言", en: "Language", vi: "Ngôn ngữ" },
  "config.provider": { zh: "提供方", en: "Provider", vi: "Nhà cung cấp" },
  "config.model": { zh: "模型", en: "Model", vi: "Model" },
  "config.editHint": { zh: "通过 CLI 编辑配置：", en: "Edit via CLI:", vi: "Sửa cấu hình qua CLI:" },

  // Sidebar
  "nav.system": { zh: "系统", en: "System", vi: "Hệ thống" },
  "nav.daemon": { zh: "守护进程", en: "Daemon", vi: "Tiến trình nền" },
  "nav.logs": { zh: "日志", en: "Logs", vi: "Nhật ký" },
  "nav.running": { zh: "运行中", en: "Running", vi: "Đang chạy" },
  "nav.agentOnline": { zh: "代理在线", en: "Agent Online", vi: "Agent trực tuyến" },
  "nav.agentOffline": { zh: "代理离线", en: "Agent Offline", vi: "Agent ngoại tuyến" },
  "nav.tools": { zh: "工具", en: "Tools", vi: "Công cụ" },
  "nav.history": { zh: "会话记录", en: "Sessions", vi: "Phiên làm việc" },
  "nav.style": { zh: "文风", en: "Style", vi: "Văn phong" },
  "nav.translation": { zh: "翻译译介", en: "Translation", vi: "Dịch thuật" },
  "nav.import": { zh: "导入", en: "Import", vi: "Nhập dữ liệu" },
  "nav.radar": { zh: "市场雷达", en: "Radar", vi: "Radar thị trường" },
  "nav.doctor": { zh: "环境诊断", en: "Doctor", vi: "Chẩn đoán môi trường" },

  // Translation
  "translation.title": { zh: "多语翻译 / 译介", en: "Multilingual Translation", vi: "Dịch đa ngôn ngữ" },
  "translation.subtitle": { zh: "导入 EPUB / PDF / TXT / Markdown，设置任意源语言和目标语言，分批翻译、抽取术语、生成审校报告并导出。", en: "Import EPUB / PDF / TXT / Markdown, choose any source and target languages, translate in batches, keep glossary terms, review, and export.", vi: "Nhập EPUB / PDF / TXT / Markdown, chọn ngôn ngữ nguồn và đích bất kỳ, dịch theo lô, giữ thuật ngữ, hiệu đính và xuất bản dịch." },
  "translation.newProject": { zh: "新建翻译项目", en: "New Translation Project", vi: "Dự án dịch mới" },
  "translation.upload": { zh: "上传源文件", en: "Upload Source", vi: "Tải lên tệp nguồn" },
  "translation.source": { zh: "源语言", en: "Source", vi: "Ngôn ngữ nguồn" },
  "translation.target": { zh: "目标语言", en: "Target", vi: "Ngôn ngữ đích" },
  "translation.sourcePlaceholder": { zh: "自动识别 / 日语 / 英语 / 繁体中文...", en: "Auto detect / Japanese / English / Traditional Chinese...", vi: "Tự động nhận diện / Tiếng Nhật / Tiếng Anh / Tiếng Trung phồn thể..." },
  "translation.targetPlaceholder": { zh: "中文（简体） / 英语 / 日语...", en: "English / Chinese (Simplified) / Japanese...", vi: "Tiếng Trung (giản thể) / Tiếng Anh / Tiếng Nhật..." },
  "translation.projectTitle": { zh: "项目标题", en: "Project Title", vi: "Tiêu đề dự án" },
  "translation.segmentMax": { zh: "分段最大字符数", en: "Max Segment Chars", vi: "Số ký tự tối đa mỗi đoạn" },
  "translation.create": { zh: "创建翻译项目", en: "Create Translation Project", vi: "Tạo dự án dịch" },
  "translation.projects": { zh: "翻译项目", en: "Translation Projects", vi: "Dự án dịch" },
  "translation.refresh": { zh: "刷新", en: "Refresh", vi: "Làm mới" },
  "translation.empty": { zh: "还没有翻译项目。上传一个源文件开始。", en: "No translation projects yet. Upload a source file to start.", vi: "Chưa có dự án dịch nào. Tải lên một tệp nguồn để bắt đầu." },
  "translation.chapters": { zh: "章", en: "chapters", vi: "chương" },
  "translation.run": { zh: "运行翻译", en: "Run Translation", vi: "Chạy dịch" },
  "translation.preview": { zh: "译文预览", en: "Translation Preview", vi: "Xem trước bản dịch" },
  "translation.original": { zh: "原文", en: "Original", vi: "Bản gốc" },
  "translation.translated": { zh: "译文", en: "Translation", vi: "Bản dịch" },
  "translation.untranslated": { zh: "尚未翻译", en: "Not translated yet", vi: "Chưa dịch" },
  "translation.report": { zh: "审校报告", en: "Review Report", vi: "Báo cáo hiệu đính" },
  "translation.noReport": { zh: "暂无审校报告。运行翻译后会生成。", en: "No review report yet. Run translation to generate one.", vi: "Chưa có báo cáo hiệu đính. Chạy dịch để tạo báo cáo." },

  // Book Detail extras
  "book.deleteBook": { zh: "删除书籍", en: "Delete Book", vi: "Xóa sách" },
  "book.confirmDelete": { zh: "确认删除此书及所有章节？", en: "Delete this book and all chapters?", vi: "Xóa cuốn sách này và toàn bộ chương?" },
  "book.settings": { zh: "书籍设置", en: "Book Settings", vi: "Cài đặt sách" },
  "book.status": { zh: "状态", en: "Status", vi: "Trạng thái" },
  "book.drafting": { zh: "草稿中...", en: "Drafting...", vi: "Đang tạo nháp..." },
  "book.pipelineWriting": { zh: "后台正在写作，本页会在完成后自动刷新。", en: "Background writing is running. This page will refresh automatically when it finishes.", vi: "Tiến trình nền đang viết. Trang này sẽ tự làm mới khi hoàn tất." },
  "book.pipelineDrafting": { zh: "后台正在生成草稿，本页会在完成后自动刷新。", en: "Background drafting is running. This page will refresh automatically when it finishes.", vi: "Tiến trình nền đang tạo nháp. Trang này sẽ tự làm mới khi hoàn tất." },
  "book.pipelineFailed": { zh: "后台任务失败", en: "Background job failed", vi: "Tác vụ nền thất bại" },
  "book.save": { zh: "保存", en: "Save", vi: "Lưu" },
  "book.saving": { zh: "保存中...", en: "Saving...", vi: "Đang lưu..." },
  "book.rewrite": { zh: "重写", en: "Rewrite", vi: "Viết lại" },
  "book.audit": { zh: "审计", en: "Audit", vi: "Kiểm tra" },
  "book.export": { zh: "导出", en: "Export", vi: "Xuất bản thảo" },
  "book.approvedOnly": { zh: "仅已通过", en: "Approved Only", vi: "Chỉ chương đã duyệt" },
  "book.manuscriptTitle": { zh: "章节标题", en: "Manuscript Title", vi: "Tiêu đề chương" },
  "book.curate": { zh: "操作", en: "Actions", vi: "Thao tác" },
  "book.spotFix": { zh: "精修", en: "Spot Fix", vi: "Sửa cục bộ" },
  "book.polish": { zh: "打磨", en: "Polish", vi: "Trau chuốt" },
  "book.rework": { zh: "重作", en: "Rework", vi: "Làm lại" },
  "book.antiDetect": { zh: "反检测", en: "Anti-Detect", vi: "Chống phát hiện AI" },
  "book.statusActive": { zh: "进行中", en: "Active", vi: "Đang tiến hành" },
  "book.statusPaused": { zh: "已暂停", en: "Paused", vi: "Tạm dừng" },
  "book.statusOutlining": { zh: "大纲中", en: "Outlining", vi: "Đang lập dàn ý" },
  "book.statusCompleted": { zh: "已完成", en: "Completed", vi: "Đã hoàn thành" },
  "book.statusDropped": { zh: "已放弃", en: "Dropped", vi: "Đã bỏ dở" },
  "book.truthFiles": { zh: "真相文件", en: "Truth Files", vi: "Tệp thiết định" },
  "book.evaluate": { zh: "质量评估", en: "Evaluate", vi: "Đánh giá chất lượng" },
  "book.consolidate": { zh: "归并记忆", en: "Consolidate", vi: "Hợp nhất ký ức" },
  "book.reviseFoundation": { zh: "重修设定", en: "Revise Foundation", vi: "Sửa thiết định nền" },
  "book.planNext": { zh: "计划", en: "Plan", vi: "Lập kế hoạch" },
  "book.composeNext": { zh: "组装", en: "Compose", vi: "Dựng chương" },
  "book.repairState": { zh: "修复状态", en: "Repair State", vi: "Sửa trạng thái" },

  // Style
  "style.title": { zh: "文风分析", en: "Style Analyzer", vi: "Phân tích văn phong" },
  "style.sourceName": { zh: "来源名称", en: "Source Name", vi: "Tên nguồn" },
  "style.sourceExample": { zh: "如：参考小说", en: "e.g. Reference Novel", vi: "VD: Tiểu thuyết tham khảo" },
  "style.textSample": { zh: "文本样本", en: "Text Sample", vi: "Mẫu văn bản" },
  "style.pasteHint": { zh: "粘贴参考文本进行文风分析...", en: "Paste reference text for style analysis...", vi: "Dán văn bản tham khảo để phân tích văn phong..." },
  "style.analyze": { zh: "分析", en: "Analyze", vi: "Phân tích" },
  "style.analyzing": { zh: "分析中...", en: "Analyzing...", vi: "Đang phân tích..." },
  "style.results": { zh: "分析结果", en: "Analysis Results", vi: "Kết quả phân tích" },
  "style.avgSentence": { zh: "平均句长", en: "Avg Sentence Length", vi: "Độ dài câu TB" },
  "style.vocabDiversity": { zh: "词汇多样性", en: "Vocabulary Diversity", vi: "Đa dạng từ vựng" },
  "style.avgParagraph": { zh: "平均段落长度", en: "Avg Paragraph Length", vi: "Độ dài đoạn TB" },
  "style.sentenceStdDev": { zh: "句长标准差", en: "Sentence StdDev", vi: "Độ lệch chuẩn độ dài câu" },
  "style.topPatterns": { zh: "主要模式", en: "Top Patterns", vi: "Mẫu chính" },
  "style.rhetoricalFeatures": { zh: "修辞特征", en: "Rhetorical Features", vi: "Đặc điểm tu từ" },
  "style.importToBook": { zh: "导入到书籍", en: "Import to Book", vi: "Nhập vào sách" },
  "style.selectBook": { zh: "选择书籍...", en: "Select book...", vi: "Chọn sách..." },
  "style.importGuide": { zh: "导入文风指南", en: "Import Style Guide", vi: "Nhập hướng dẫn văn phong" },
  "style.emptyHint": { zh: "粘贴文本并点击分析查看文风档案", en: "Paste text and click Analyze to see style profile", vi: "Dán văn bản và nhấn Phân tích để xem hồ sơ văn phong" },

  // Import
  "import.title": { zh: "导入工具", en: "Import Tools", vi: "Công cụ nhập" },
  "import.chapters": { zh: "导入章节", en: "Import Chapters", vi: "Nhập chương" },
  "import.canon": { zh: "导入母本", en: "Import Canon", vi: "Nhập nguyên tác" },
  "import.fanfic": { zh: "同人创作", en: "Fanfic", vi: "Đồng nhân" },
  "import.selectTarget": { zh: "选择目标书籍...", en: "Select target book...", vi: "Chọn sách đích..." },
  "import.splitRegex": { zh: "分割正则（可选）", en: "Split regex (optional)", vi: "Regex phân tách (tùy chọn)" },
  "import.pasteChapters": { zh: "粘贴章节文本...", en: "Paste chapter text...", vi: "Dán nội dung chương..." },
  "import.selectSource": { zh: "选择源（母本）...", en: "Select source (parent)...", vi: "Chọn nguồn (nguyên tác)..." },
  "import.selectDerivative": { zh: "选择目标（衍生）...", en: "Select target (derivative)...", vi: "Chọn đích (phái sinh)..." },
  "import.fanficTitle": { zh: "同人小说标题", en: "Fanfic title", vi: "Tiêu đề truyện đồng nhân" },
  "import.fanficDone": { zh: "同人已创建", en: "Fanfic created", vi: "Đã tạo truyện đồng nhân" },
  "import.pasteMaterial": { zh: "粘贴原作文本/设定/角色资料...", en: "Paste source material...", vi: "Dán văn bản gốc / thiết lập / tư liệu nhân vật..." },
  "import.importing": { zh: "导入中...", en: "Importing...", vi: "Đang nhập..." },
  "import.creating": { zh: "创建中...", en: "Creating...", vi: "Đang tạo..." },
  "import.spinoff": { zh: "番外创作", en: "Side-story", vi: "Ngoại truyện" },
  "import.spinoffHint": { zh: "选一本已有书做正传，系统生成一本独立番外书：继承其角色与世界设定，但讲一个不进主线的侧篇故事。", en: "Pick an existing book as the canon; a standalone side-story book is generated — it inherits the cast and world but tells a side plot outside the main line.", vi: "Chọn một cuốn sách hiện có làm nguyên tác, hệ thống sẽ tạo một cuốn ngoại truyện độc lập: kế thừa nhân vật và bối cảnh nhưng kể một câu chuyện phụ nằm ngoài mạch chính." },
  "import.spinoffTitle": { zh: "番外标题", en: "Side-story title", vi: "Tiêu đề ngoại truyện" },
  "import.selectParent": { zh: "选择正传母书...", en: "Select parent book...", vi: "Chọn sách nguyên tác..." },
  "import.spinoffDirection": { zh: "番外方向（可选）：聚焦哪个角色 / 哪条支线 / 什么 what-if...", en: "Side-story direction (optional): which character / subplot / what-if...", vi: "Hướng ngoại truyện (tùy chọn): tập trung vào nhân vật nào / tuyến truyện nào / giả định what-if nào..." },
  "import.spinoffDone": { zh: "番外已创建", en: "Side-story created", vi: "Đã tạo ngoại truyện" },
  "import.imitation": { zh: "仿写创作", en: "Imitation", vi: "Phỏng bút" },
  "import.imitationHint": { zh: "给一段参考作品文本 + 你的原创故事梗概，系统建一本模仿该文风的原创新书。", en: "Give a reference text + your own story idea; a new original book is created in that writing style.", vi: "Đưa một đoạn văn bản tham khảo cùng tóm tắt cốt truyện gốc của bạn, hệ thống sẽ tạo một cuốn sách mới mô phỏng văn phong đó." },
  "import.imitationTitle": { zh: "新书标题", en: "New book title", vi: "Tiêu đề sách mới" },
  "import.imitationIdea": { zh: "你的原创故事梗概（写什么）...", en: "Your original story idea (what it's about)...", vi: "Tóm tắt cốt truyện gốc của bạn (viết về điều gì)..." },
  "import.imitationRef": { zh: "粘贴参考作品文本（仿其文风，不抄其情节）...", en: "Paste reference text to imitate its style (not its plot)...", vi: "Dán văn bản tham khảo (phỏng theo văn phong, không chép cốt truyện)..." },
  "import.imitationDone": { zh: "仿写新书已创建", en: "Imitation book created", vi: "Đã tạo sách phỏng bút" },

  // Radar
  "radar.title": { zh: "市场雷达", en: "Market Radar", vi: "Radar thị trường" },
  "radar.scan": { zh: "扫描市场", en: "Scan Market", vi: "Quét thị trường" },
  "radar.scanning": { zh: "扫描中...", en: "Scanning...", vi: "Đang quét..." },
  "radar.summary": { zh: "市场概要", en: "Market Summary", vi: "Tổng quan thị trường" },
  "radar.emptyHint": { zh: "点击「扫描市场」分析当前趋势和机会", en: "Click \"Scan Market\" to analyze trends and opportunities", vi: "Nhấn \"Quét thị trường\" để phân tích xu hướng và cơ hội hiện tại" },
  "radar.history": { zh: "扫描历史", en: "Scan History", vi: "Lịch sử quét" },

  // Doctor
  "doctor.title": { zh: "环境诊断", en: "Environment Check", vi: "Kiểm tra môi trường" },
  "doctor.recheck": { zh: "重新检查", en: "Re-check", vi: "Kiểm tra lại" },
  "doctor.inkosJson": { zh: "inkos.json 配置", en: "inkos.json configuration", vi: "Cấu hình inkos.json" },
  "doctor.projectEnv": { zh: "项目 .env 文件", en: "Project .env file", vi: "Tệp .env của dự án" },
  "doctor.globalEnv": { zh: "全局 ~/.inkos/.env", en: "Global ~/.inkos/.env", vi: "Tệp ~/.inkos/.env toàn cục" },
  "doctor.booksDir": { zh: "书籍目录", en: "Books directory", vi: "Thư mục sách" },
  "doctor.llmApi": { zh: "LLM API 连接", en: "LLM API connectivity", vi: "Kết nối LLM API" },
  "doctor.connected": { zh: "已连接", en: "Connected", vi: "Đã kết nối" },
  "doctor.failed": { zh: "失败", en: "Failed", vi: "Thất bại" },
  "doctor.allPassed": { zh: "所有检查通过 — 环境健康", en: "All checks passed — environment is healthy", vi: "Tất cả kiểm tra đều đạt — môi trường ổn định" },
  "doctor.someFailed": { zh: "部分检查失败 — 请查看配置", en: "Some checks failed — review configuration", vi: "Một số kiểm tra thất bại — vui lòng kiểm tra cấu hình" },

  // Genre extras
  "genre.createNew": { zh: "创建新题材", en: "Create New Genre", vi: "Tạo thể loại mới" },
  "genre.name": { zh: "名称", en: "Name", vi: "Tên" },
  "genre.editGenre": { zh: "编辑", en: "Edit", vi: "Sửa" },
  "genre.deleteGenre": { zh: "删除", en: "Delete", vi: "Xóa" },
  "genre.confirmDelete": { zh: "确认删除此题材？", en: "Delete this genre?", vi: "Xác nhận xóa thể loại này?" },
  "genre.chapterTypes": { zh: "章节类型", en: "Chapter Types", vi: "Loại chương" },
  "genre.fatigueWords": { zh: "疲劳词", en: "Fatigue Words", vi: "Từ gây nhàm" },
  "genre.numericalSystem": { zh: "数值系统", en: "Numerical System", vi: "Hệ thống số liệu" },
  "genre.powerScaling": { zh: "力量等级", en: "Power Scaling", vi: "Thang sức mạnh" },
  "genre.eraResearch": { zh: "时代研究", en: "Era Research", vi: "Nghiên cứu bối cảnh thời đại" },
  "genre.pacingRule": { zh: "节奏规则", en: "Pacing Rule", vi: "Quy tắc nhịp độ" },
  "genre.rules": { zh: "规则", en: "Rules", vi: "Quy tắc" },
  "genre.saveChanges": { zh: "保存更改", en: "Save Changes", vi: "Lưu thay đổi" },
  "genre.cancel": { zh: "取消", en: "Cancel", vi: "Hủy" },
  "genre.copyToProject": { zh: "复制到项目", en: "Copy to Project", vi: "Sao chép vào dự án" },
  "genre.selectHint": { zh: "选择题材查看详情", en: "Select a genre to view details", vi: "Chọn thể loại để xem chi tiết" },
  "genre.commaSeparated": { zh: "逗号分隔", en: "comma-separated", vi: "phân tách bằng dấu phẩy" },
  "genre.rulesMd": { zh: "规则（Markdown）", en: "Rules (Markdown)", vi: "Quy tắc (Markdown)" },

  // Config extras
  "config.modelRouting": { zh: "模型路由", en: "Model Routing", vi: "Định tuyến model" },
  "config.agent": { zh: "代理", en: "Agent", vi: "Agent" },
  "config.baseUrl": { zh: "基础 URL", en: "Base URL", vi: "Base URL" },
  "config.default": { zh: "默认", en: "default", vi: "mặc định" },
  "config.optional": { zh: "可选", en: "optional", vi: "tùy chọn" },
  "config.saveOverrides": { zh: "保存路由", en: "Save Overrides", vi: "Lưu định tuyến" },
  "config.save": { zh: "保存", en: "Save", vi: "Lưu" },
  "config.saving": { zh: "保存中...", en: "Saving...", vi: "Đang lưu..." },
  "config.cancel": { zh: "取消", en: "Cancel", vi: "Hủy" },
  "config.edit": { zh: "编辑", en: "Edit", vi: "Sửa" },
  "config.enabled": { zh: "启用", en: "Enabled", vi: "Đã bật" },
  "config.disabled": { zh: "禁用", en: "Disabled", vi: "Đã tắt" },

  // Project Settings
  "settings.title": { zh: "项目设置", en: "Project Settings", vi: "Cài đặt dự án" },
  "settings.subtitle": { zh: "集中管理写作运行时的项目级开关，不替代模型服务商配置。", en: "Manage project-level runtime switches without replacing model service configuration.", vi: "Quản lý tập trung các công tắc cấp dự án cho môi trường viết, không thay thế cấu hình nhà cung cấp model." },
  "settings.modelOverrides": { zh: "Agent 模型路由", en: "Agent Model Routing", vi: "Định tuyến model theo Agent" },
  "settings.modelOverridesHint": { zh: "为每个 agent 指定模型（贵模型写正文、便宜模型审稿等）。服务商、密钥和基础 URL 仍在模型配置页管理。", en: "Route each agent to a model (e.g. premium model for drafting, cheaper for review). Providers, keys, and base URLs stay in Model Config.", vi: "Chỉ định model cho từng agent (model đắt để viết bản chính, model rẻ hơn để review, v.v.). Nhà cung cấp, khóa API và base URL vẫn quản lý ở trang Cấu hình model." },
  "settings.notify": { zh: "通知渠道", en: "Notification Channels", vi: "Kênh thông báo" },
  "settings.notifyHint": { zh: "配置 Telegram、飞书、企微或 webhook 等后台通知渠道。", en: "Configure Telegram, Feishu, WeCom, or webhook notifications for background jobs.", vi: "Cấu hình kênh thông báo nền qua Telegram, Feishu, WeCom hoặc webhook." },
  "settings.detection": { zh: "AI 检测配置", en: "AI Detection Config", vi: "Cấu hình kiểm tra AI" },
  "settings.detectionHint": { zh: "配置外部 AIGC 检测服务、阈值和自动改写策略；关闭即不配置检测。", en: "Configure an external AIGC detection service, threshold, and auto-rewrite policy; turn off to clear it.", vi: "Cấu hình dịch vụ kiểm tra AIGC bên ngoài, ngưỡng và chính sách tự viết lại; tắt để không cấu hình kiểm tra." },
  "settings.openModelConfig": { zh: "打开模型配置", en: "Open Model Config", vi: "Mở Cấu hình model" },
  "settings.saved": { zh: "已保存", en: "Saved", vi: "Đã lưu" },
  "settings.globalDefaultModel": { zh: "全局默认模型", en: "Global Default Model", vi: "Model mặc định toàn cục" },
  "settings.globalDefaultModelHint": { zh: "Chat、书籍操作和 CLI 未指定模型时使用这一组默认服务与模型。", en: "Used by Chat, book actions, and CLI paths when no explicit model is selected.", vi: "Dùng cho Chat, thao tác sách và CLI khi chưa chỉ định model cụ thể." },
  "settings.serviceId": { zh: "服务 ID（如 kkaiapi）", en: "service id (e.g. kkaiapi)", vi: "ID dịch vụ (vd: kkaiapi)" },
  "settings.noOverrides": { zh: "暂无模型路由，所有 agent 使用默认模型。", en: "No overrides — every agent uses the default model.", vi: "Chưa có định tuyến model nào, mọi agent dùng model mặc định." },
  "settings.agentName": { zh: "agent（如 writer / architect）", en: "agent (e.g. writer / architect)", vi: "agent (vd: writer / architect)" },
  "settings.modelId": { zh: "模型 ID", en: "model id", vi: "ID model" },
  "settings.addOverride": { zh: "添加路由", en: "Add override", vi: "Thêm định tuyến" },
  "settings.noChannels": { zh: "暂无通知渠道。", en: "No channels yet.", vi: "Chưa có kênh thông báo nào." },
  "settings.addChannel": { zh: "添加渠道", en: "Add channel", vi: "Thêm kênh" },
  "settings.detectionEnable": { zh: "启用检测配置", en: "Enable detection config", vi: "Bật cấu hình kiểm tra" },
  "settings.detectionProvider": { zh: "检测服务商", en: "Provider", vi: "Nhà cung cấp kiểm tra" },
  "settings.detectionApiKeyEnv": { zh: "API Key 环境变量名", en: "API key env var", vi: "Tên biến env cho API Key" },
  "settings.detectionApiUrl": { zh: "检测 API 地址", en: "Detection API URL", vi: "Địa chỉ API kiểm tra" },
  "settings.detectionThreshold": { zh: "阈值", en: "Threshold", vi: "Ngưỡng" },
  "settings.detectionMaxRetries": { zh: "最大重试", en: "Max retries", vi: "Số lần thử lại tối đa" },
  "settings.detectionAutoRewrite": { zh: "命中后自动反检测改写", en: "Auto anti-detect rewrite on hit", vi: "Tự động viết lại chống phát hiện khi trúng ngưỡng" },
  "settings.chatUi": { zh: "对话界面", en: "Chat Interface", vi: "Giao diện hội thoại" },
  "settings.chatUiHint": { zh: "控制对话页里操作详情的展示方式。该偏好保存在当前浏览器，不写入项目配置。", en: "Controls how operation details render on the chat page. Stored in this browser, not in project config.", vi: "Kiểm soát cách hiển thị chi tiết thao tác trên trang hội thoại. Tùy chọn này lưu ở trình duyệt hiện tại, không ghi vào cấu hình dự án." },
  "settings.toolDetailsDefaultOpen": { zh: "操作详情默认展开", en: "Expand operation details by default", vi: "Mặc định mở rộng chi tiết thao tác" },
  "settings.toolDetailsDefaultOpenHint": { zh: "关闭后，对话中的「查看操作结果」默认收起，仍可手动展开。", en: "When off, \"view result\" blocks in chat start collapsed; you can still expand them manually.", vi: "Khi tắt, mục \"xem kết quả thao tác\" trong hội thoại sẽ mặc định thu gọn; vẫn có thể mở rộng thủ công." },

  // Truth Files extras
  "truth.title": { zh: "真相文件", en: "Truth Files", vi: "Tệp sự thật" },
  "truth.edit": { zh: "编辑", en: "Edit", vi: "Sửa" },
  "truth.chars": { zh: "字", en: "chars", vi: "ký tự" },
  "truth.save": { zh: "保存", en: "Save", vi: "Lưu" },
  "truth.saving": { zh: "保存中...", en: "Saving...", vi: "Đang lưu..." },
  "truth.cancel": { zh: "取消", en: "Cancel", vi: "Hủy" },
  "truth.empty": { zh: "暂无文件", en: "No truth files", vi: "Chưa có tệp nào" },
  "truth.noFiles": { zh: "暂无文件", en: "No truth files", vi: "Chưa có tệp nào" },
  "truth.notFound": { zh: "文件未找到", en: "File not found", vi: "Không tìm thấy tệp" },
  "truth.selectFile": { zh: "选择文件查看内容", en: "Select a file to view", vi: "Chọn tệp để xem nội dung" },
  "truth.selectHint": { zh: "选择文件查看内容", en: "Select a file to view", vi: "Chọn tệp để xem nội dung" },

  // Dashboard
  "dash.subtitle": { zh: "管理你的文学宇宙和 AI 辅助草稿。", en: "Manage your literary universe and AI-assisted drafts.", vi: "Quản lý vũ trụ văn học của bạn và các bản thảo do AI hỗ trợ." },

  // Chapter Reader extras
  "reader.openingManuscript": { zh: "打开书稿中...", en: "Opening manuscript...", vi: "Đang mở bản thảo..." },
  "reader.manuscriptPage": { zh: "书稿页", en: "Manuscript Page", vi: "Trang bản thảo" },
  "reader.minRead": { zh: "分钟阅读", en: "min read", vi: "phút đọc" },
  "reader.endOfChapter": { zh: "本章完", en: "End of Chapter", vi: "Hết chương" },

  // Daemon Control
  "daemon.title": { zh: "守护进程控制", en: "Daemon Control", vi: "Điều khiển Daemon" },
  "daemon.running": { zh: "运行中", en: "Running", vi: "Đang chạy" },
  "daemon.stopped": { zh: "已停止", en: "Stopped", vi: "Đã dừng" },
  "daemon.start": { zh: "启动", en: "Start", vi: "Khởi động" },
  "daemon.stop": { zh: "停止", en: "Stop", vi: "Dừng" },
  "daemon.starting": { zh: "启动中...", en: "Starting...", vi: "Đang khởi động..." },
  "daemon.stopping": { zh: "停止中...", en: "Stopping...", vi: "Đang dừng..." },
  "daemon.waitingEvents": { zh: "等待事件...", en: "Waiting for events...", vi: "Đang chờ sự kiện..." },
  "daemon.startHint": { zh: "启动守护进程查看事件", en: "Start the daemon to see events", vi: "Khởi động daemon để xem sự kiện" },
  "daemon.eventLog": { zh: "事件日志", en: "Event Log", vi: "Nhật ký sự kiện" },

  // Config extras (labels)
  "config.temperature": { zh: "温度", en: "Temperature", vi: "Temperature" },
  "config.maxTokens": { zh: "最大令牌数", en: "Max Tokens", vi: "Số token tối đa" },
  "config.stream": { zh: "流式输出", en: "Stream", vi: "Truyền trực tuyến" },
  "config.chinese": { zh: "中文", en: "Chinese", vi: "Tiếng Trung" },
  "config.english": { zh: "英文", en: "English", vi: "Tiếng Anh" },

  // BookCreate extras
  "create.platform": { zh: "平台", en: "Platform", vi: "Nền tảng" },

  // Common
  "common.save": { zh: "保存", en: "Save", vi: "Lưu" },
  "common.cancel": { zh: "取消", en: "Cancel", vi: "Hủy" },
  "common.delete": { zh: "删除", en: "Delete", vi: "Xóa" },
  "common.edit": { zh: "编辑", en: "Edit", vi: "Chỉnh sửa" },
  "common.error": { zh: "错误", en: "Error", vi: "Lỗi" },
  "common.loading": { zh: "加载中...", en: "Loading...", vi: "Đang tải..." },
  "common.refresh": { zh: "刷新", en: "Refresh", vi: "Làm mới" },
  "common.enterCommand": { zh: "输入指令...", en: "Enter command...", vi: "Nhập lệnh..." },
  "chapter.readyForReview": { zh: "待审核", en: "Ready for Review", vi: "Chờ duyệt" },
  "chapter.approved": { zh: "已通过", en: "Approved", vi: "Đã duyệt" },
  "chapter.drafted": { zh: "草稿", en: "Drafted", vi: "Bản nháp" },
  "chapter.needsRevision": { zh: "需修订", en: "Needs Revision", vi: "Cần sửa" },
  "chapter.imported": { zh: "已导入", en: "Imported", vi: "Đã nhập" },
  "chapter.auditFailed": { zh: "审计失败", en: "Audit Failed", vi: "Kiểm tra thất bại" },
  "chapter.label": { zh: "第{n}章", en: "Chapter {n}", vi: "Chương {n}" },
  "common.exportSuccess": { zh: "已导出到项目目录", en: "Exported to project directory", vi: "Đã xuất ra thư mục dự án" },
  "common.exportFormat": { zh: "导出格式", en: "Export format", vi: "Định dạng xuất" },
  "logs.title": { zh: "日志", en: "Logs", vi: "Nhật ký" },
  "logs.empty": { zh: "暂无日志", en: "No log entries yet", vi: "Chưa có nhật ký" },
  "logs.showingRecent": { zh: "当前展示最近日志记录。", en: "Showing recent log entries.", vi: "Đang hiển thị các bản ghi gần đây." },
} as const;

export type StringKey = keyof typeof strings;
export type TFunction = (key: StringKey) => string;

/**
 * 三语归一：zh / en / vi 原样通过，其余（包括未设置）一律视为越南语——
 * 越南语是新项目的默认界面语言。
 */
export function resolveUiLanguage(value: unknown): AppLanguage {
  if (value === "zh") return "zh";
  if (value === "en") return "en";
  return "vi";
}

/**
 * 纯函数取值，脱离 React 也可测试。
 * 越南语缺失时回退到英文，绝不回退到中文。
 */
export function translate(key: StringKey, lang: AppLanguage): string {
  const entry = strings[key] as { zh: string; en: string; vi?: string };
  if (lang === "vi") return entry.vi ?? entry.en;
  return lang === "en" ? entry.en : entry.zh;
}

export function useI18n() {
  const { data } = useApi<{ language: string }>("/project");
  const lang = resolveUiLanguage(data?.language);

  function t(key: StringKey): string {
    return translate(key, lang);
  }

  return { t, lang };
}
