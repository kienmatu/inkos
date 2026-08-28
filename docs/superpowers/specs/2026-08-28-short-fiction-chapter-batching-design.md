# Short fiction: chia lô sinh chương

> Bản v2, sau vòng review độc lập. Thay đổi so với v1: kích thước lô 4 → 3, thêm
> cơ chế tự chia đôi lô khi chạm trần, thêm xử lý code fence khi ghép fragment,
> thêm chế độ "batch" cho prompt continuation. Lý do từng thay đổi ghi ở
> phần [Ghi chú review](#ghi-chú-review).

## Bối cảnh

inkos có nhiều pipeline sáng tác; một trong số đó là **short fiction** (truyện
ngắn nhiều chương). Pipeline này chạy qua
`packages/core/src/pipeline/short-fiction-runner.ts` theo trình tự: sinh dàn ý →
review dàn ý → **viết draft** → review draft → **sửa draft** → đóng gói bán.

Hai bước in đậm do `packages/core/src/agents/short-fiction.ts` đảm nhiệm, và cả
hai hiện đều sinh **toàn bộ truyện trong một lần gọi LLM duy nhất**. Mặc định
truyện ngắn là 12 chương (`SHORT_FICTION_DEFAULT_CHAPTERS`), tối thiểu 12, tối đa
18. Độ dài mỗi chương tính theo đơn vị bản địa của ngôn ngữ: tiếng Trung 900–1200
**chữ**, tiếng Anh 600–800 **từ**. Tức là một response duy nhất phải chứa
12.000–21.600 chữ (zh) hoặc 7.200–14.400 từ (en).

Khi model dừng vì chạm trần output, lớp provider
(`packages/core/src/llm/provider.ts`) ném `PartialResponseError` với
`reason: "output-limit"`. Đây là lỗi cố ý không nuốt: trả về nửa bài sẽ tạo ra
chương viết dở nằm trong file kết quả.

## Vấn đề

Người dùng chạy "Tạo truyện ngắn" với endpoint custom `cc/claude-opus-5` và nhận:

```
Stream interrupted after 5900 chars: Error: model reached the output limit (length)
```

Sau 2 phút 51 giây, toàn bộ tác vụ thất bại và không có kết quả nào được giữ lại.

Nguyên nhân là sự chênh lệch giữa cái pipeline yêu cầu và cái endpoint cho phép:

| | Giá trị |
|---|---|
| Draft yêu cầu (12 × 1000 chữ zh) | ~12.000 chữ ≈ 7.000–8.500 token |
| `maxTokens` gửi lên | 30.496 |
| Endpoint thực sự trả về trước khi cắt | 5.900 ký tự ≈ **~4.096 token** |

Endpoint bỏ qua `max_tokens` được gửi và áp trần riêng của nó. Không có cách nào
phía client biết trước trần thật đó là bao nhiêu — chính `service-resolver.ts`
cũng phải rơi về mặc định 16384 cho model lạ.

Ngoài ra, `retryShortFictionCall` (`agents/short-fiction.ts:508`) chỉ retry lỗi
tầng vận chuyển (`econnreset`, `fetch failed`, `socket hang up`…). Lỗi
`output-limit` không nằm trong danh sách đó, nên nó fail cứng ngay lần đầu — và
retry nguyên văn cũng vô nghĩa vì lần gọi lại sẽ chạm đúng trần cũ.

Hệ quả: **pipeline short fiction không chạy được trên bất kỳ endpoint nào có trần
output dưới ~9k token**, bất kể model mạnh đến đâu.

## Giải pháp: chia lô 3 chương, tự thu nhỏ khi chạm trần

Thay vì đặt cược cả truyện vào một response, sinh theo lô 3 chương. Quan trọng
hơn con số 3: **khi một lô vẫn chạm `output-limit`, chia đôi lô đó và viết lại,
xuống tới 1 chương.** Con số 3 chỉ là điểm khởi đầu, không phải giả định sống
còn — nhờ vậy thiết kế sống được cả với endpoint trần 2k mà không cần biết trước
trần là bao nhiêu.

Ngân sách token mỗi lô, tính ở mức chữ **tối đa** mà cấu hình cho phép:

| Lô 3 chương | Chữ/từ | Token ước tính | So với trần quan sát 4.096 |
|---|---|---|---|
| zh 3 × 1200 chữ | 3.600 chữ | ~2.100–2.600 | 51–63% |
| en 3 × 800 từ | 2.400 từ | ~3.100 | 76% |

Biên còn lại dành cho reasoning token, thứ cũng bị tính vào ngân sách output trên
các API dạng Anthropic. Trường hợp biên vẫn không đủ thì cơ chế chia đôi lo nốt.

### Ví dụ cụ thể: truyện 12 chương

Hiện tại — **1 lần gọi**:

```
call 1 → TITLE + OPENING_HOOK + chương 1..12    (~12.000 chữ)  ← bị cắt ở chương 6
```

Sau khi sửa — **4 lần gọi**:

| Call | Prompt | Output |
|---|---|---|
| 1 | `buildShortFictionWriterUserPrompt` + `chapterRange: [1, 3]` | `SHORT_FICTION_TITLE`, `SHORT_FICTION_OPENING_HOOK`, chương 1–3 |
| 2 | `buildShortFictionDraftContinuationUserPrompt`, `mode: "batch"`, `missingChapters: [4,5,6]` | chương 4–6 |
| 3 | như trên, `missingChapters: [7,8,9]` | chương 7–9 |
| 4 | như trên, `missingChapters: [10,11,12]` | chương 10–12 |

Truyện 18 chương → 6 call. Truyện 13 chương → 5 call, lô cuối 1 chương.

Nếu call 3 chạm `output-limit`, nó tự tách thành hai call `[7, 8]` và `[9]` rồi
viết lại — các lô đã xong không bị đụng tới.

### Vì sao ghép nối được

`parseShortFictionBatchDraft` (`agents/short-fiction.ts:283`) không phụ thuộc vào
cấu trúc tổng thể của response — nó quét từng block `=== CHAPTER N CONTENT ===`
trên toàn chuỗi `rawContent`, với `N` chạy từ 1 tới `expectedChapters`. Vì vậy
việc nối các fragment bằng `\n\n` rồi parse **một lần duy nhất** ở cuối cho kết
quả giống hệt như parse một response liền mạch.

Điều này đã được kiểm chứng bằng cách chạy parser thật trên ba fragment ghép lại:
title và hook lấy từ fragment đầu, cả 12 chương đều có nội dung, và nội dung
chương 4 kết thúc đúng ở tag của chương 5 — không tràn, không giả định
end-of-string.

Đây cũng chính xác là cách `continueDraft` đã hoạt động hôm nay
(`agents/short-fiction.ts:201`):

```ts
return parseShortFictionBatchDraft(
  `${input.draft.rawContent.trim()}\n\n${response.content.trim()}`,
  { expectedChapters: input.chapterCount, language: input.language },
);
```

### Một cạm bẫy khi ghép: code fence

Nếu model bọc reply trong ```` ```markdown … ``` ````, dấu đóng fence sẽ dính vào
**chương cuối của mọi lô không phải lô cuối**. Đã tái hiện được với parser thật:

```
CH3 tail: "…第3章正文内容。\n```\n\n```markdown"
```

`sanitizeChapterContent` chỉ cắt fence bằng `/```\s*$/i`, tức chỉ khi fence nằm ở
cuối chuỗi. Đường 1-call hiện tại vì thế an toàn, đường ghép thì không. Và
`validateShortFictionDraftForFinal` chỉ kiểm tra chương rỗng, nên rác này lọt
thẳng vào `final/full.md`.

Xử lý: bóc fence bao ngoài của **từng fragment** trước khi đẩy vào mảng, bằng một
helper `stripOuterCodeFence`. Có test hồi quy riêng với fragment bọc fence.

### Prompt cho lô 2 trở đi: tái dùng, nhưng đổi câu mở đầu

`buildShortFictionDraftContinuationUserPrompt` (`prompts/short-fiction.ts:301`)
vốn được viết cho tình huống sửa lỗi. Phần thân của nó đúng nguyên vẹn nhu cầu
của lô tiếp theo:

- `"Write ONLY the missing chapters: 4, 5, 6."`
- `"Do not rewrite finished chapters, do not write summary notes…"`
- nhận `existingDraftMarkdown` để giữ mạch truyện
- khối Output Format chỉ liệt kê đúng các chương cần viết

Nhưng **câu mở đầu thì sai** trên đường sinh bình thường:

```
上一次正文被截断或漏章。现在只补写缺失章节：4, 5, 6。
The previous draft was truncated or skipped chapters. Write ONLY the missing chapters: 4, 5, 6.
```

Ở lô 2 của một lần sinh bình thường thì chẳng có gì bị cắt cả. Mồi cho model một
khung "đang đi sửa lỗi" trong khi nó viết 2/3 số chữ của cả truyện là cách chắc
chắn nhất để giọng văn trôi đi.

Xử lý: thêm `mode?: "repair" | "batch"` vào
`ShortFictionDraftContinuationPromptInput`. Mặc định `"repair"` giữ nguyên chữ cũ
(nên `continueDraft` không đổi output). `"batch"` đổi đúng câu đầu:

```
继续同一篇的写作：现在写第 4-6 章。
Continue the same story: now write chapters 4-6.
```

Phần còn lại của prompt giữ nguyên. Nguy cơ lặp tình tiết vốn đã được chặn tốt:
prompt mang theo toàn bộ chữ đã viết cộng câu `不要重写已完成章节`.

## Thay đổi cụ thể

### 1. `packages/core/src/prompts/short-fiction.ts`

Thêm trường tuỳ chọn vào ba interface:

```ts
export interface ShortFictionDraftPromptInput {
  readonly direction: string;
  readonly outlineMarkdown: string;
  readonly chapterCount: number;
  readonly charsPerChapter: number;
  readonly chapterRange?: readonly [number, number];   // MỚI
}

export interface ShortFictionDraftContinuationPromptInput extends ShortFictionDraftPromptInput {
  readonly existingDraftMarkdown: string;
  readonly missingChapters: readonly number[];
  readonly mode?: "repair" | "batch";                  // MỚI, mặc định "repair"
}

export interface ShortFictionDraftRevisionPromptInput extends ShortFictionDraftPromptInput {
  readonly review: string;
  readonly revisedSoFarMarkdown?: string;              // MỚI
}
```

Khi `chapterRange` **không có** và `mode` không có, cả ba builder giữ nguyên
output byte-for-byte như hiện tại. Khi có `chapterRange`, hai chỗ đổi:

*Dòng nhiệm vụ* — trước:

```
一次写完整 12 章，每章约 1000 字。
Write the complete 12-chapter story in one pass, about 1000 words per chapter.
```

sau (với `chapterRange: [1, 3]`):

```
只写第 1-3 章，每章约 1000 字。整篇共 12 章，节奏按整篇校准，不要按这一批校准。
Write ONLY chapters 1-3, about 1000 words each. The complete story is 12 chapters
— calibrate pacing to the whole story, not to this batch.
```

Lô một chương (truyện 13 hoặc 17 chương, cả hai đều hợp lệ) phải đọc là
`只写第 13 章` / `Write ONLY chapter 13`, không phải `13-13`.

*Khối Output Format* — `Array.from({ length: input.chapterCount })` đổi thành
vòng lặp trên đúng khoảng `chapterRange`, nên response chỉ được yêu cầu chứa
chương 1–3 thay vì 1–12. `SHORT_FICTION_TITLE` và `SHORT_FICTION_OPENING_HOOK`
chỉ xuất hiện ở lô đầu (`chapterRange[0] === 1`).

Đồng thời sửa một dòng trong system prompt cho khỏi mâu thuẫn với việc chia lô:

| | Trước | Sau |
|---|---|---|
| zh | 你要根据故事方案**一次 API** 写完整短篇正文。 | 你要根据故事方案写短篇正文。 |
| en | You write the complete short story **in one API pass**, following the story plan. | You write short-story prose following the story plan. |

### 2. `packages/core/src/agents/short-fiction.ts`

Hằng số mới, export để test và cấu hình tương lai dùng được:

```ts
export const SHORT_FICTION_CHAPTERS_PER_BATCH = 3;
```

Ba helper mới:

- `chunkChapters(chapters, size)` — chia danh sách chương thành nhóm.
- `stripOuterCodeFence(text)` — bóc ```` ```lang … ``` ```` bao ngoài một fragment.
- một vòng lặp lô private, dùng chung cho cả ba đường gọi, có **tự chia đôi**:
  bắt `PartialResponseError` với `reason === "output-limit"`, tách nhóm hiện tại
  làm đôi và thử lại từng nửa; đệ quy tới nhóm 1 chương. Nhóm 1 chương mà vẫn
  chạm trần thì ném ra ngoài — không còn gì để chia.

Ba call site:

- `writeDraft` — chia `[1..chapterCount]` thành lô 3; lô đầu dùng writer prompt
  kèm range, lô sau dùng continuation prompt ở `mode: "batch"`. Parse một lần ở
  cuối.
- `reviseDraft` — chia tương tự; mỗi lô vẫn gửi kèm draft v1 ở lượt `assistant`
  như hiện nay, cộng thêm phần v2 đã sửa xong (`revisedSoFarMarkdown`) để giữ
  nhất quán giọng và tình tiết.
- `continueDraft` — giữ nguyên vai trò lưới an toàn và giữ nguyên
  `mode: "repair"`, nhưng chunk danh sách chương thiếu theo 3 thay vì bù tất cả
  trong một call.

`retryShortFictionCall` giữ nguyên và bọc **từng lô**, nên một lô lỗi mạng vẫn
được retry một lần mà không phải viết lại các lô đã xong. Không có nguy cơ nhân
đôi chương: `retryShortFictionCall` vứt hẳn lần thử hỏng, và `partialContent` của
`PartialResponseError` không bao giờ đi vào mảng fragment.

`maxTokens` mỗi lô = `estimateShortFictionMaxTokens(batchSize, charsPerChapter)`.
Sàn 12.288 trong hàm này giữ nguyên — đó là trần chứ không phải mục tiêu. Việc hạ
từ 30.496 xuống 12.288 còn giúp phần dự trữ context trong `runWorkerAgent`.

### 3. `packages/core/src/pipeline/short-fiction-runner.ts`

Chỉ nối dây báo tiến trình, không đổi logic. Runner truyền một callback xuống
`writeDraft` / `reviseDraft` / `continueDraft` để UI hiện "Writing chapters 4-6
(batch 2/4)..." thay vì im lặng gần 3 phút. Vòng lặp sửa lỗi hiện có
(`SHORT_FICTION_DRAFT_COMPLETION_ATTEMPTS = 3` quanh `continueDraft`) giữ nguyên
và trở thành lớp phòng thủ thứ hai.

Đã kiểm: không nơi nào trong `packages/studio` hay `packages/cli` so khớp chuỗi
trên các thông điệp tiến trình này — chúng được truyền thẳng ra log và UI — nên
đổi định dạng thông điệp là an toàn.

## Không thay đổi

- `packages/core/src/llm/provider.ts` — cách phát hiện và gắn nhãn `output-limit`
  đã đúng.
- `packages/core/src/llm/long-form-completion.ts` — cơ chế nối tiếp dành cho
  script/storyboard; không đưa short fiction vào đây, vì chia lô chủ động
  (phòng ngừa) tốt hơn nối tiếp bị động (chữa cháy) khi số chương đã biết trước.
- Mọi pipeline khác: novel, script, storyboard, interactive film, translation.
- Ngưỡng số chương và số chữ (`SHORT_FICTION_MIN_CHAPTERS` = 12 v.v.) — không
  nới ra để né lỗi.

## Đánh đổi đã chấp nhận

**Chi phí input của `reviseDraft` tăng.** Mỗi lô gửi lại toàn bộ writer prompt,
toàn bộ draft v1 ở lượt `assistant`, cộng phần v2 đã sửa. Truyện 18 chương thành
6 call, mỗi call mang ~18k chữ v1 cộng tối đa ~16k chữ v2. Chấp nhận vì: lỗi đang
phải chữa nằm ở phía **output**, còn context window của các model đang dùng thừa
sức chứa; và cắt bớt v1 xuống chỉ vài chương lân cận sẽ làm mất đúng thứ mà bước
sửa cần — cái nhìn toàn bài. Nếu sau này gặp endpoint chặt cả context, mới tính
tới việc tỉa.

## Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Một lô chạm `output-limit` | Chia đôi lô, viết lại từng nửa; đệ quy tới 1 chương. Các lô đã xong không bị đụng. |
| Lô 1 chương vẫn chạm `output-limit` | Ném ra ngoài. Không trả về draft nửa vời. Không còn gì để chia. |
| Một lô lỗi mạng tạm thời | `retryShortFictionCall` retry đúng lô đó một lần; các lô đã xong không bị viết lại. |
| Một lô trả về thiếu chương | Không xử lý ở tầng lô. Parse cuối cùng để chương đó rỗng, và vòng `continueDraft` của runner bù vào. |
| `reviseDraft` lỗi ở lô bất kỳ | Như hiện nay: runner bắt lỗi, ghi `draft-v002-warning.md`, dùng draft v1 làm bản cuối. |

## Tiêu chí nghiệm thu

1. Truyện 12 chương phát ra đúng 4 lần gọi LLM, với range chương đúng và không
   chồng lấn.
2. Truyện 18 chương phát ra 6 lần gọi; truyện 13 chương phát ra 5 lần, lô cuối
   một chương và prompt đọc là "chương 13" chứ không phải "13-13".
3. Draft ghép lại parse ra đủ `chapterCount` chương, mọi chương có nội dung.
4. Fragment bọc trong code fence không để lại ```` ``` ```` ở cuối chương nào.
5. Một lô chạm `output-limit` thì tự chia đôi và hoàn thành; số call tăng lên
   tương ứng, kết quả vẫn đủ chương.
6. Lô 1 chương chạm `output-limit` thì `writeDraft` ném ra ngoài, không trả về
   draft thiếu chương.
7. Prompt của lô 2 chứa nội dung chương 1–3 để giữ mạch, yêu cầu rõ ràng *không*
   viết lại chúng, và **không** nói bản trước bị cắt.
8. Khi không truyền `chapterRange` / `mode`, prompt sinh ra giống hệt hiện tại —
   các test prompt đang có vẫn xanh.
9. Không có test hiện có nào hồi quy, và `tsc --noEmit` sạch.

## Ghi chú review

Bản v1 của spec này đã qua một vòng review độc lập. Những gì đổi và vì sao:

- **Kích thước lô 4 → 3, cộng cơ chế chia đôi.** v1 so 4.000 *ký tự* với mốc
  5.900 *ký tự* quan sát được và kết luận là an toàn. Sai đơn vị: trần là token.
  5.900 ký tự zh ≈ 4.096 token, và lô 4 chương tiếng Anh ở 800 từ/chương rơi vào
  khoảng ~4.200 token — vượt trần ngay lô đầu. Cơ chế chia đôi được thêm vào để
  con số hằng thôi làm điểm chết.
- **Thêm xử lý code fence.** Review chạy parser thật trên fragment ghép và tái
  hiện được rác ```` ``` ```` ở cuối chương cuối mỗi lô.
- **Thêm `mode: "batch"` cho prompt continuation.** v1 khẳng định prompt này dùng
  lại được nguyên vẹn; câu mở đầu của nó thì không.
- **Sửa tham chiếu dòng.** `retryShortFictionCall` ở dòng 508 (không phải 526,
  đó là `isTransientShortFictionError`); builder continuation ở dòng 301 (không
  phải 302).
- **Ghi rõ đánh đổi chi phí input của `reviseDraft`**, thay vì im lặng.

Những khẳng định của v1 đã được review xác nhận đúng và giữ nguyên: parser hoạt
động trên chuỗi ghép; parse giữa vòng lặp với `expectedChapters` nhỏ hơn cho ra
draft từng phần đúng; các sửa đổi prompt giữ byte-identity khi không có tham số
mới; `retryShortFictionCall` bọc từng lô không gây nhân đôi chương; sàn 12.288 vô
hại; và không có nơi nào khác trong repo phụ thuộc vào số lần gọi LLM của các
agent này.
