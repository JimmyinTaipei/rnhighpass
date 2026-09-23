// 科目主檔：序號、簡稱、全名、代表 emoji。
// 序號一律兩碼，避免破十之後排序錯亂。
// 簡稱必須與來源資料夾名稱（例如 01_生解）以及檔名中的科目欄位一致。
export const SUBJECTS = [
  { no: "01", name: "生解", fullName: "解剖生理學",     emoji: "🫀" },
  { no: "02", name: "病理", fullName: "病理學",         emoji: "🔬" },
  { no: "03", name: "藥理", fullName: "藥理學",         emoji: "💊" },
  { no: "04", name: "微免", fullName: "微生物免疫學",   emoji: "🦠" },
  { no: "05", name: "基護", fullName: "基本護理學",     emoji: "🩺" },
  { no: "06", name: "行政", fullName: "護理行政",       emoji: "📋" },
  { no: "07", name: "內外", fullName: "內外科護理學",   emoji: "🏥" },
  { no: "08", name: "產科", fullName: "產科護理學",     emoji: "🤰" },
  { no: "09", name: "兒科", fullName: "兒科護理學",     emoji: "🧸" },
  { no: "10", name: "精神", fullName: "精神科護理學",   emoji: "🧠" },
  { no: "11", name: "社區", fullName: "社區衛生護理學", emoji: "🏘️" },
];

export const SUBJECT_BY_NO = new Map(SUBJECTS.map((s) => [s.no, s]));
export const SUBJECT_BY_NAME = new Map(SUBJECTS.map((s) => [s.name, s]));

/**
 * R2 的資料夾前綴一律用 ASCII。
 *
 * 為什麼不用中文當 key：`wrangler r2 object put` 會把非 ASCII 的 key
 * 百分比編碼後才存進 R2（實測 v3、v4 皆然），但 R2 網頁後台拖拉上傳存的是
 * 原始 UTF-8。兩邊編碼不一致會讓檔案「看起來有、抓不到」，而且不會有任何錯誤訊息。
 * 改用 ASCII key 之後，不管用哪個工具上傳結果都一致。
 *
 * 使用者下載到的仍然是中文檔名 —— 檔名存在 manifest 的 name 欄位，
 * 由 Worker 透過 Content-Disposition 還原。
 */
export const PREFIXES = {
  explanations: "explanations",
  workbooks: "workbooks",
  bundles: "bundles",
  pastExams: "past-exams",
};

/** 分章類型 → ASCII。 */
export const TYPE_SLUG = { 詳解: "explanation", 題本: "workbook" };

/**
 * 考古題的五份考卷 → ASCII。
 * 這五份是國考固定的考卷組成，26 個學期都一樣。
 * 順序同科目序號（基礎醫學 → 基護行政 → 內外 → 產兒 → 精神社區），網站依此排列。
 * 若之後出現新的考卷名稱，build-manifest 會報錯要求在這裡補上，不會默默略過。
 */
export const PAPER_SLUG = {
  基礎醫學: "basic",
  基本護理與護理行政: "fundamentals",
  內外科護理學: "medsurg",
  產科與兒科護理學: "obgyn-peds",
  精神科與社區衛生護理: "psych-community",
};

/** 學期代號 → ASCII（把「補考」轉成 makeup）。 */
export function termSlug(term) {
  return term.replace("補考", "makeup");
}
