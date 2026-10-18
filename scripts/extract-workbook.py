"""Read XLSX XML and cached formula values without modifying/recalculating the source.
Usage: bundled-python scripts/extract-workbook.py source.xlsx private-output.json
"""
import hashlib
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

def extract(path):
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        workbook = ET.fromstring(z.read('xl/workbook.xml'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        sheets = {}
        for sheet in workbook.findall('s:sheets/s:sheet', ns):
            target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            rows = []
            for row in ET.fromstring(z.read(target)).findall('s:sheetData/s:row', ns):
                cells = {}
                for cell in row.findall('s:c', ns):
                    raw = cell.findtext('s:v', default='', namespaces=ns)
                    kind = cell.attrib.get('t', 'n')
                    value = shared[int(raw)] if kind == 's' else ''.join(cell.find('s:is', ns).itertext()) if kind == 'inlineStr' else float(raw) if raw and kind == 'n' else raw
                    formula = cell.find('s:f', ns)
                    cells[cell.attrib['r']] = {'value': value, 'type': kind, **({'formula': formula.text or '', 'sharedFormula': formula.attrib} if formula is not None else {})}
                rows.append({'row': int(row.attrib['r']), 'cells': cells})
            sheets[sheet.attrib['name']] = rows
        props = workbook.find('s:workbookPr', ns)
        return {'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'date1904': props is not None and props.attrib.get('date1904') in ('1', 'true'), 'sheets': sheets}

if __name__ == '__main__':
    Path(sys.argv[2]).write_text(json.dumps(extract(sys.argv[1]), indent=2), encoding='utf-8')
    print('Private workbook extraction written; source unchanged.')
