import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/LOFTHALL/Desktop/ved.xlsx";
const outputDir = "accounting-prototype/tmp/ved-template";

await fs.mkdir(outputDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
await fs.writeFile(`${outputDir}/summary.ndjson`, summary.ndjson, "utf8");

const sheets = [];
for (let index = 0; index < workbook.worksheets.items.length; index += 1) {
  const sheet = workbook.worksheets.getItemAt(index);
  const used = sheet.getUsedRange();
  const address = used?.address || "A1";
  const table = await workbook.inspect({
    kind: "table",
    sheetId: sheet.name,
    range: address,
    include: "values,formulas",
    maxChars: 30000,
    tableMaxRows: 80,
    tableMaxCols: 40,
    tableMaxCellChars: 160,
  });
  const styles = await workbook.inspect({
    kind: "computedStyle",
    sheetId: sheet.name,
    range: address,
    maxChars: 20000,
    options: { maxResults: 300 },
  });
  await fs.writeFile(`${outputDir}/sheet-${index + 1}-table.ndjson`, table.ndjson, "utf8");
  await fs.writeFile(`${outputDir}/sheet-${index + 1}-styles.ndjson`, styles.ndjson, "utf8");
  const preview = await workbook.render({ sheetName: sheet.name, autoCrop: "all", scale: 1.5, format: "png" });
  await fs.writeFile(`${outputDir}/sheet-${index + 1}.png`, new Uint8Array(await preview.arrayBuffer()));
  sheets.push({ index, name: sheet.name, usedRange: address });
}

console.log(JSON.stringify({ sheets }, null, 2));
