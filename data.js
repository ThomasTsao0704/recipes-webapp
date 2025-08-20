// data.js
window.CSV_SCHEMA = [
  "id",
  "title",
  "category",
  "tags",           // 分號分隔
  "ingredients",    // 以 | 分隔
  "steps",          // 以 \n 分隔
  "prep_minutes",
  "cook_minutes",
  "servings",
  "calories",
  "image_url"
];

// 物件陣列 -> CSV 文字
window.arrayToCSV = function(rows, header = window.CSV_SCHEMA) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(header.join(","));
  for (const row of rows) {
    const line = header.map(k => escape(row[k])).join(",");
    lines.push(line);
  }
  return lines.join("\n");
};

// 以 PapaParse 解析 CSV 文字 -> { header, rows[] }
window.csvTextToArray = async function(csvText){
  return new Promise((res, rej) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: (r) => res({ header: r.meta.fields, rows: r.data }),
      error: rej
    });
  });
};