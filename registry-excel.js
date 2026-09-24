(function registryExcelModule(global) {
  const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function inlineCell(ref, value, style) {
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  }

  function numberCell(ref, value, style) {
    const numeric = Number(value);
    return `<c r="${ref}" s="${style}"><v>${Number.isFinite(numeric) ? numeric : 0}</v></c>`;
  }

  function blankCell(ref, style) {
    return `<c r="${ref}" s="${style}"/>`;
  }

  function safeSheetName(value) {
    return String(value || 'Ведомость').replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Ведомость';
  }

  function safeFileName(value) {
    return String(value || 'Ведомость').replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function sheetXml(data) {
    const people = data.people || [];
    const totalRow = people.length + 4;
    const title = data.title || `Ведомость Кухни (${data.period || ''})`;
    const dataRows = people.map((item, index) => {
      const row = index + 4;
      return `<row r="${row}" ht="20" customHeight="1">${inlineCell(`A${row}`, item.position || '', 3)}${inlineCell(`B${row}`, item.name || '', 3)}${numberCell(`C${row}`, item.amount, 4)}${blankCell(`D${row}`, 3)}</row>`;
    }).join('');
    const firstAmountRow = people.length ? 4 : totalRow;
    const lastAmountRow = people.length ? totalRow - 1 : totalRow;
    const total = people.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D${totalRow}"/><sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="25" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/></cols><sheetData><row r="1" ht="24" customHeight="1">${inlineCell('A1', title, 1)}${blankCell('B1', 1)}${blankCell('C1', 1)}${blankCell('D1', 1)}</row><row r="2" ht="22" customHeight="1">${inlineCell('A2', 'Должность', 2)}${inlineCell('B2', 'ФИО', 2)}${inlineCell('C2', 'Сумма', 2)}${inlineCell('D2', 'Подпись', 2)}</row><row r="3" ht="8" customHeight="1">${blankCell('A3', 3)}${blankCell('B3', 3)}${blankCell('C3', 3)}${blankCell('D3', 3)}</row>${dataRows}<row r="${totalRow}" ht="22" customHeight="1">${blankCell(`A${totalRow}`, 5)}${inlineCell(`B${totalRow}`, 'Итого сумма:', 5)}<c r="C${totalRow}" s="6"><f>SUM(C${firstAmountRow}:C${lastAmountRow})</f><v>${total}</v></c>${blankCell(`D${totalRow}`, 3)}</row></sheetData><mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
  }

  function stylesXml() {
    return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 [$₽-419]"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1" applyFill="1" applyFont="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Обычный" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  }

  async function buildRegistryWorkbook(data) {
    if (!global.JSZip) throw new Error('Модуль Excel не загружен');
    const zip = new global.JSZip();
    const sheetName = safeSheetName(data.sheetName || `Ведомость №${data.id || ''}`);
    zip.file('[Content_Types].xml', `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    zip.folder('_rels').file('.rels', `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    const now = new Date().toISOString();
    zip.folder('docProps').file('core.xml', `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(data.title || 'Ведомость кухни')}</dc:title><dc:creator>PLUM</dc:creator><cp:lastModifiedBy>PLUM</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.folder('docProps').file('app.xml', `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PLUM</Application><AppVersion>1.0</AppVersion></Properties>`);
    zip.folder('xl').file('workbook.xml', `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1"/></workbook>`);
    zip.folder('xl').folder('_rels').file('workbook.xml.rels', `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.folder('xl').file('styles.xml', stylesXml());
    zip.folder('xl').folder('worksheets').file('sheet1.xml', sheetXml(data));
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  async function downloadRegistryWorkbook(data) {
    const blob = await buildRegistryWorkbook(data);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(data.fileName || `Ведомость №${data.id || ''}`)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  global.RegistryExcel = { buildRegistryWorkbook, downloadRegistryWorkbook };

  if (typeof document !== 'undefined') {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action="download-registry"]');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const registry = state.registries.find((item) => item.id === Number(button.dataset.id));
      if (!registry) {
        toast('Ведомость не найдена');
        return;
      }
      const previousText = button.textContent;
      button.disabled = true;
      button.textContent = 'Готовим…';
      try {
        const items = registryItems(registry);
        const rows = items.map((item) => {
          const employee = person(Number(item.personId));
          return employee ? { position: employee.position || '', name: employee.name || '', amount: Number(item.amount) || 0, location: employee.location || '' } : null;
        }).filter(Boolean);
        if (!rows.length) throw new Error('В ведомости нет сотрудников');
        const locations = [...new Set(rows.map((row) => row.location).filter(Boolean))];
        const locationLabel = locations.length === 1 ? ` ${locations[0]}` : '';
        const period = [registry.from, registry.to].filter(Boolean).join('–') || registry.period || '';
        await downloadRegistryWorkbook({
          id: registry.id,
          sheetName: `Ведомость №${registry.id}`,
          fileName: `Ведомость №${registry.id} ${registry.engagement} ${period}`,
          title: `Ведомость Кухни${locationLabel} (${period})`,
          period,
          people: rows,
        });
        toast(`Ведомость №${registry.id} скачана в Excel`);
      } catch (error) {
        console.error(error);
        toast(`Не удалось скачать Excel: ${error.message || 'ошибка файла'}`);
      } finally {
        button.disabled = false;
        button.textContent = previousText;
      }
    }, true);
  }
})(globalThis);
