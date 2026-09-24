import fs from "node:fs/promises";
import JSZip from "jszip";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

globalThis.JSZip = JSZip;
await import("../registry-excel.js");

const outputDir = "outputs/registry-excel-export";
await fs.mkdir(outputDir, { recursive: true });
const outputPath = `${outputDir}/Ведомость №109.xlsx`;
const blob = await globalThis.RegistryExcel.buildRegistryWorkbook({
  id: 109,
  sheetName: "Ведомость №109",
  title: "Ведомость Кухни Березка (10.08.2026–16.08.2026)",
  period: "10.08.2026–16.08.2026",
  people: [
    { position: "Повар", name: "Камилова Диля", amount: 3000 },
    { position: "Бренд-шеф", name: "Канапиев Равшан", amount: 9350 },
    { position: "Су-шеф", name: "Анна Орлова", amount: 1650 },
  ],
});
await fs.writeFile(outputPath, new Uint8Array(await blob.arrayBuffer()));

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
workbook.recalculate();
const check = await workbook.inspect({
  kind: "table",
  range: "Ведомость №109!A1:D7",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 6,
  maxChars: 5000,
});
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
const preview = await workbook.render({ sheetName: "Ведомость №109", range: "A1:D7", scale: 2, format: "png" });
await fs.writeFile(`${outputDir}/preview.png`, new Uint8Array(await preview.arrayBuffer()));

console.log(check.ndjson);
console.log(errors.ndjson);
console.log(outputPath);
