
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CellFormatting {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bgColor?: string;
  wrap?: boolean;
  fontFamily?: string;
  fontSize?: string;
  borderBottom?: string;
  format?: 'currency' | 'percent' | 'number' | 'text';
}

interface CellData extends CellFormatting {
  value: string; 
  computed?: string; 
}

interface MergeRange {
  sr: number; // start row
  sc: number; // start col
  er: number; // end row
  ec: number; // end col
}

interface GridState {
  data: CellData[][];
  colWidths: number[];
  rowHeights: number[];
  merges: MergeRange[];
}

interface Props {
  initialTitle: string;
  initialData: string;
  onSave: (title: string, data: string) => Promise<void>;
  onClose: () => void;
  isVaultMounted: boolean;
  onMountVault?: () => void;
}

const INITIAL_ROWS = 50;
const INITIAL_COLS = 26;
const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 32;

const ExcelEditor: React.FC<Props> = ({ initialTitle, initialData, onSave, onClose }) => {
  const [title, setTitle] = useState(initialTitle ? initialTitle.replace(/_/g, ' ') : '');
  const [grid, setGrid] = useState<CellData[][]>([]);
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [merges, setMerges] = useState<MergeRange[]>([]);
  
  const [selection, setSelection] = useState<{ sr: number, sc: number, er: number, ec: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  const [resizing, setResizing] = useState<{ type: 'col' | 'row', index: number, startPos: number, startSize: number } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'home' | 'styles' | 'formulas' | 'templates'>('home');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  type Snapshot = { grid: CellData[][]; colWidths: number[]; rowHeights: number[]; merges: MergeRange[] };
  const historyRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const MAX_HISTORY = 50;

  // Call before any mutation so Ctrl+Z can restore the prior state.
  const pushHistory = () => {
    historyRef.current.push({ grid, colWidths, rowHeights, merges });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
    setIsDirty(true);
  };

  const applySnapshot = (snap: Snapshot) => {
    setGrid(snap.grid);
    setColWidths(snap.colWidths);
    setRowHeights(snap.rowHeights);
    setMerges(snap.merges);
    setIsDirty(true);
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push({ grid, colWidths, rowHeights, merges });
    applySnapshot(prev);
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push({ grid, colWidths, rowHeights, merges });
    applySnapshot(next);
  };

  // Initialize/Load Grid
  useEffect(() => {
    try {
      if (initialData && initialData !== "{}") {
        const parsed = JSON.parse(initialData);
        if (parsed.grid || Array.isArray(parsed)) {
          const gridData = Array.isArray(parsed) ? parsed : (parsed.grid || []);
          setGrid(gridData);
          setColWidths(parsed.colWidths || Array(gridData[0]?.length || INITIAL_COLS).fill(DEFAULT_COL_WIDTH));
          setRowHeights(parsed.rowHeights || Array(gridData.length || INITIAL_ROWS).fill(DEFAULT_ROW_HEIGHT));
          setMerges(parsed.merges || []);
        }
      } else {
        const emptyGrid = Array(INITIAL_ROWS).fill(null).map(() => 
          Array(INITIAL_COLS).fill(null).map(() => ({ value: '' }))
        );
        setGrid(emptyGrid);
        setColWidths(Array(INITIAL_COLS).fill(DEFAULT_COL_WIDTH));
        setRowHeights(Array(INITIAL_ROWS).fill(DEFAULT_ROW_HEIGHT));
      }
    } catch (e) {
      const emptyGrid = Array(INITIAL_ROWS).fill(null).map(() => 
        Array(INITIAL_COLS).fill(null).map(() => ({ value: '' }))
      );
      setGrid(emptyGrid);
      setColWidths(Array(INITIAL_COLS).fill(DEFAULT_COL_WIDTH));
      setRowHeights(Array(INITIAL_ROWS).fill(DEFAULT_ROW_HEIGHT));
    }
    setIsDirty(false);
  }, [initialData]);

  const getColLabel = (index: number) => {
    let label = "";
    let i = index;
    while (i >= 0) {
      label = String.fromCharCode((i % 26) + 65) + label;
      i = Math.floor(i / 26) - 1;
    }
    return label;
  };

  const parseCoord = (coord: string) => {
    const match = coord.match(/([A-Z]+)(\d+)/);
    if (!match) return null;
    const colStr = match[1];
    const row = parseInt(match[2]) - 1;
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    return { r: row, c: col - 1 };
  };

  // Safe arithmetic-only expression evaluator. This intentionally avoids
  // new Function()/eval() because sheet data can arrive from a shared
  // project loaded from another collaborator's account — evaluating an
  // arbitrary string as JavaScript would let one collaborator's formula
  // run code in another collaborator's browser session. This parser only
  // ever recognizes numbers, + - * / ^ ( ), comparison operators, and a
  // fixed whitelist of functions (SUM, AVERAGE, MIN, MAX, COUNT, ROUND,
  // ABS, IF), all resolved to plain numbers/arrays before reaching it —
  // there's no path to an arbitrary JS identifier or property access.
  const evalArithmetic = (src: string): number => {
    let i = 0;
    const peek = () => src[i];
    const fail = () => { throw new Error('bad expression'); };
    const skipSpace = () => { while (i < src.length && src[i] === ' ') i++; };

    const parseNumber = (): number => {
      const start = i;
      if (src[i] === '+' || src[i] === '-') i++;
      let sawDigit = false;
      while (i < src.length && /[0-9]/.test(src[i])) { i++; sawDigit = true; }
      if (src[i] === '.') {
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) { i++; sawDigit = true; }
      }
      if (!sawDigit) fail();
      return parseFloat(src.slice(start, i));
    };

    const parseArray = (): number[] => {
      if (src[i] !== '[') fail();
      i++;
      const vals: number[] = [];
      skipSpace();
      if (src[i] === ']') { i++; return vals; }
      while (true) {
        skipSpace();
        vals.push(parseNumber());
        skipSpace();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; break; }
        fail();
      }
      return vals;
    };

    // Accepts a comma-separated mix of bracket-literal arrays (produced by
    // range substitution, e.g. A1:A5) and plain expressions, flattened to numbers.
    const parseNumericArgs = (): number[] => {
      const vals: number[] = [];
      skipSpace();
      if (peek() === ')') return vals;
      while (true) {
        skipSpace();
        if (peek() === '[') {
          vals.push(...parseArray());
        } else {
          vals.push(parseComparison());
        }
        skipSpace();
        if (peek() === ',') { i++; continue; }
        break;
      }
      return vals;
    };

    const parseFactor = (): number => {
      skipSpace();
      if (peek() === '-') { i++; return -parseFactor(); }
      if (peek() === '+') { i++; return parseFactor(); }
      if (src[i] === '(') {
        i++;
        const v = parseComparison();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return v;
      }
      if (src.startsWith('SUM', i) && src[i + 3] === '(') {
        i += 4;
        const args = parseNumericArgs();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return args.reduce((a, b) => a + b, 0);
      }
      if (src.startsWith('AVERAGE', i) && src[i + 7] === '(') {
        i += 8;
        const args = parseNumericArgs();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;
      }
      if (src.startsWith('COUNT', i) && src[i + 5] === '(') {
        i += 6;
        const args = parseNumericArgs();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return args.length;
      }
      if (src.startsWith('MIN', i) && src[i + 3] === '(') {
        i += 4;
        const args = parseNumericArgs();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return args.length ? Math.min(...args) : 0;
      }
      if (src.startsWith('MAX', i) && src[i + 3] === '(') {
        i += 4;
        const args = parseNumericArgs();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return args.length ? Math.max(...args) : 0;
      }
      if (src.startsWith('ROUND', i) && src[i + 5] === '(') {
        i += 6;
        const val = parseComparison();
        let digits = 0;
        skipSpace();
        if (peek() === ',') { i++; digits = parseComparison(); }
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        const factor = Math.pow(10, digits);
        return Math.round(val * factor) / factor;
      }
      if (src.startsWith('ABS', i) && src[i + 3] === '(') {
        i += 4;
        const val = parseComparison();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return Math.abs(val);
      }
      if (src.startsWith('IF', i) && src[i + 2] === '(') {
        i += 3;
        const cond = parseComparison();
        skipSpace();
        if (src[i] !== ',') fail();
        i++;
        const whenTrue = parseComparison();
        skipSpace();
        if (src[i] !== ',') fail();
        i++;
        const whenFalse = parseComparison();
        skipSpace();
        if (src[i] !== ')') fail();
        i++;
        return cond !== 0 ? whenTrue : whenFalse;
      }
      return parseNumber();
    };

    const parsePow = (): number => {
      let base = parseFactor();
      skipSpace();
      if (peek() === '^') {
        i++;
        base = Math.pow(base, parsePow());
      }
      return base;
    };

    const parseTerm = (): number => {
      let val = parsePow();
      skipSpace();
      while (peek() === '*' || peek() === '/') {
        const op = src[i]; i++;
        const rhs = parsePow();
        val = op === '*' ? val * rhs : val / rhs;
        skipSpace();
      }
      return val;
    };

    const parseAdditive = (): number => {
      let val = parseTerm();
      skipSpace();
      while (peek() === '+' || peek() === '-') {
        const op = src[i]; i++;
        const rhs = parseTerm();
        val = op === '+' ? val + rhs : val - rhs;
        skipSpace();
      }
      return val;
    };

    const compOps = ['<=', '>=', '<>', '=', '<', '>'];
    const parseComparison = (): number => {
      const left = parseAdditive();
      skipSpace();
      for (const op of compOps) {
        if (src.startsWith(op, i)) {
          i += op.length;
          const right = parseAdditive();
          switch (op) {
            case '=': return left === right ? 1 : 0;
            case '<>': return left !== right ? 1 : 0;
            case '<=': return left <= right ? 1 : 0;
            case '>=': return left >= right ? 1 : 0;
            case '<': return left < right ? 1 : 0;
            case '>': return left > right ? 1 : 0;
          }
        }
      }
      return left;
    };

    const result = parseComparison();
    skipSpace();
    if (i !== src.length) fail();
    return result;
  };

  const evaluateFormula = useCallback((formula: string, currentGrid: CellData[][]): string => {
    if (!formula.startsWith('=')) return formula;
    const expression = formula.substring(1).toUpperCase();
    try {
      const rangeRegex = /([A-Z]+\d+):([A-Z]+\d+)/g;
      const getRangeValues = (match: string, start: string, end: string) => {
        const s = parseCoord(start);
        const e = parseCoord(end);
        if (!s || !e) return [];
        const values = [];
        for (let r = Math.min(s.r, e.r); r <= Math.max(s.r, e.r); r++) {
          for (let c = Math.min(s.c, e.c); c <= Math.max(s.c, e.c); c++) {
            const val = parseFloat(currentGrid[r]?.[c]?.computed || currentGrid[r]?.[c]?.value || "0");
            values.push(isNaN(val) ? 0 : val);
          }
        }
        return values;
      };
      const evalString = expression.replace(rangeRegex, (match, start, end) => {
        const vals = getRangeValues(match, start, end);
        return `[${vals.join(',')}]`;
      });
      const cellRegex = /\b([A-Z]+\d+)\b(?!\()/g;
      const finalEval = evalString.replace(cellRegex, (match) => {
        const coord = parseCoord(match);
        if (!coord) return "0";
        const val = parseFloat(currentGrid[coord.r]?.[coord.c]?.computed || currentGrid[coord.r]?.[coord.c]?.value || "0");
        return isNaN(val) ? "0" : val.toString();
      });
      const result = evalArithmetic(finalEval.replace(/\s+/g, ''));
      return String(result);
    } catch (err) {
      return "#VALUE!";
    }
  }, []);

  // Recompute every formula cell against a given grid snapshot.
  const recomputeAll = (sourceGrid: CellData[][]): CellData[][] =>
    sourceGrid.map((row) => row.map((cell) => {
      if (cell.value.startsWith('=')) {
        return { ...cell, computed: evaluateFormula(cell.value, sourceGrid) };
      }
      return { ...cell, computed: cell.value };
    }));

  const formatDisplayValue = (cell: CellData): string => {
    const raw = cell.computed !== undefined ? cell.computed : cell.value;
    if (!cell.format || cell.format === 'text' || !raw || raw === '#VALUE!') return raw || '';
    const num = parseFloat(raw);
    if (isNaN(num)) return raw;
    if (cell.format === 'currency') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
    }
    if (cell.format === 'percent') {
      return (num > 1 ? num : num * 100).toFixed(1) + '%';
    }
    if (cell.format === 'number') {
      return new Intl.NumberFormat('en-US').format(num);
    }
    return raw;
  };

  const loadFinancialStatementTemplate = () => {
    pushHistory();
    const rows = 25;
    const cols = 12;
    const newGrid: CellData[][] = Array(rows).fill(null).map(() => 
      Array(cols).fill(null).map(() => ({ value: '' }))
    );

    // Row 0: Merged Banner Title
    newGrid[0][0] = {
      value: 'EXECUTIVE 5-YEAR COMMERCIAL INCOME STATEMENT',
      bold: true,
      color: '#ffffff',
      bgColor: '#0f2942',
      align: 'center',
      fontSize: '15px'
    };

    // Row 1: Headers
    const headers = ['Financial Line Item', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
    headers.forEach((h, idx) => {
      newGrid[1][idx] = {
        value: h,
        bold: true,
        color: '#ffffff',
        bgColor: '#0d9488',
        align: idx === 0 ? 'left' : 'right',
        fontSize: '12px'
      };
    });

    // Row 2: Units Sold
    newGrid[2][0] = { value: 'Annual Units Sold', bold: true, format: 'text' };
    ['12000', '18000', '25000', '35000', '50000'].forEach((v, idx) => {
      newGrid[2][idx + 1] = { value: v, format: 'number', align: 'right' };
    });

    // Row 3: Unit Price
    newGrid[3][0] = { value: 'Average Retail Unit Price ($)', bold: true, format: 'text' };
    ['48.00', '48.00', '50.00', '50.00', '52.00'].forEach((v, idx) => {
      newGrid[3][idx + 1] = { value: v, format: 'currency', align: 'right' };
    });

    // Row 4: Gross Revenue
    newGrid[4][0] = { value: 'Gross Revenue', bold: true, bgColor: '#f8fafc', format: 'text' };
    ['=B3*B4', '=C3*C4', '=D3*D4', '=E3*E4', '=F3*F4'].forEach((v, idx) => {
      newGrid[4][idx + 1] = { value: v, bold: true, format: 'currency', bgColor: '#f8fafc', align: 'right' };
    });

    // Row 5: Cost of Goods Sold
    newGrid[5][0] = { value: 'Cost of Goods Sold (COGS)', format: 'text' };
    ['=B5*0.42', '=C5*0.40', '=D5*0.38', '=E5*0.36', '=F5*0.35'].forEach((v, idx) => {
      newGrid[5][idx + 1] = { value: v, format: 'currency', align: 'right' };
    });

    // Row 6: Gross Profit
    newGrid[6][0] = { value: 'Gross Operating Profit', bold: true, bgColor: '#f0fdfa', format: 'text' };
    ['=B5-B6', '=C5-C6', '=D5-D6', '=E5-E6', '=F5-F6'].forEach((v, idx) => {
      newGrid[6][idx + 1] = { value: v, bold: true, color: '#0f766e', bgColor: '#f0fdfa', format: 'currency', align: 'right' };
    });

    // Row 7: Fixed OPEX
    newGrid[7][0] = { value: 'Fixed Operating Overhead (OPEX)', format: 'text' };
    ['140000', '180000', '230000', '290000', '360000'].forEach((v, idx) => {
      newGrid[7][idx + 1] = { value: v, format: 'currency', align: 'right' };
    });

    // Row 8: Net EBIT
    newGrid[8][0] = { value: 'Net Operating Profit (EBIT)', bold: true, bgColor: '#0f2942', color: '#ffffff', format: 'text' };
    ['=B7-B8', '=C7-C8', '=D7-D8', '=E7-E8', '=F7-F8'].forEach((v, idx) => {
      newGrid[8][idx + 1] = { value: v, bold: true, bgColor: '#0f2942', color: '#ffffff', format: 'currency', align: 'right' };
    });

    const newMerges: MergeRange[] = [{ sr: 0, sc: 0, er: 0, ec: 5 }];
    const newWidths = [...colWidths];
    newWidths[0] = 260;
    for (let c = 1; c <= 5; c++) newWidths[c] = 135;

    setMerges(newMerges);
    setColWidths(newWidths);
    setGrid(recomputeAll(newGrid));
  };

  const loadUnitCostingTemplate = () => {
    pushHistory();
    const rows = 20;
    const cols = 8;
    const newGrid: CellData[][] = Array(rows).fill(null).map(() => 
      Array(cols).fill(null).map(() => ({ value: '' }))
    );

    newGrid[0][0] = {
      value: 'PRODUCT UNIT ECONOMICS & BILL OF MATERIALS (BOM)',
      bold: true,
      color: '#ffffff',
      bgColor: '#0f2942',
      align: 'center',
      fontSize: '15px'
    };

    const headers = ['Cost Component Item', 'Expense Category', 'Unit Cost ($)', 'Target Share %'];
    headers.forEach((h, idx) => {
      newGrid[1][idx] = {
        value: h,
        bold: true,
        color: '#ffffff',
        bgColor: '#0d9488',
        align: idx >= 2 ? 'right' : 'left'
      };
    });

    const items = [
      ['Primary Raw Material / Substrate', 'Direct Materials', '8.50', '=C3/C8'],
      ['Custom Print & Box Packaging', 'Packaging', '2.20', '=C4/C8'],
      ['Direct Assembly & Finishing Labor', 'Direct Labor', '4.75', '=C5/C8'],
      ['Freight & Inbound Procurement', 'Logistics', '1.40', '=C6/C8'],
      ['Batch Quality Assurance & Testing', 'Quality', '0.65', '=C7/C8'],
    ];

    items.forEach((item, rIdx) => {
      const r = rIdx + 2;
      newGrid[r][0] = { value: item[0], format: 'text' };
      newGrid[r][1] = { value: item[1], format: 'text', color: '#64748b' };
      newGrid[r][2] = { value: item[2], format: 'currency', align: 'right' };
      newGrid[r][3] = { value: item[3], format: 'percent', align: 'right' };
    });

    // Row 7: Total COGS
    newGrid[7][0] = { value: 'Total Cost of Goods Sold (Unit COGS)', bold: true, bgColor: '#f1f5f9', format: 'text' };
    newGrid[7][1] = { value: 'Total Direct', bold: true, bgColor: '#f1f5f9', color: '#64748b' };
    newGrid[7][2] = { value: '=SUM(C3:C7)', bold: true, bgColor: '#f1f5f9', format: 'currency', align: 'right' };
    newGrid[7][3] = { value: '1.00', bold: true, bgColor: '#f1f5f9', format: 'percent', align: 'right' };

    // Row 8: Selling Price
    newGrid[8][0] = { value: 'Suggested Commercial Retail Price', bold: true, bgColor: '#f0fdfa', format: 'text' };
    newGrid[8][1] = { value: 'Commercial Price', color: '#0f766e', bgColor: '#f0fdfa' };
    newGrid[8][2] = { value: '38.00', bold: true, color: '#0f766e', bgColor: '#f0fdfa', format: 'currency', align: 'right' };
    newGrid[8][3] = { value: '', bgColor: '#f0fdfa' };

    // Row 9: Gross Margin
    newGrid[9][0] = { value: 'Gross Profit Margin ($ / Unit)', bold: true, format: 'text' };
    newGrid[9][1] = { value: 'Margin Per Unit', color: '#64748b' };
    newGrid[9][2] = { value: '=C9-C8', bold: true, format: 'currency', align: 'right' };
    newGrid[9][3] = { value: '=C10/C9', bold: true, format: 'percent', align: 'right' };

    const newMerges: MergeRange[] = [{ sr: 0, sc: 0, er: 0, ec: 3 }];
    const newWidths = [...colWidths];
    newWidths[0] = 270;
    newWidths[1] = 160;
    newWidths[2] = 140;
    newWidths[3] = 130;

    setMerges(newMerges);
    setColWidths(newWidths);
    setGrid(recomputeAll(newGrid));
  };

  const updateGridRange = (updates: Partial<CellData>) => {
    if (!selection) return;
    pushHistory();
    const { sr, sc, er, ec } = selection;
    const startR = Math.min(sr, er);
    const endR = Math.max(sr, er);
    const startC = Math.min(sc, ec);
    const endC = Math.max(sc, ec);

    const newGrid = grid.map((row, r) => {
      if (r < startR || r > endR) return row;
      return row.map((cell, c) => {
        if (c < startC || c > endC) return cell;
        return { ...cell, ...updates };
      });
    });

    setGrid(recomputeAll(newGrid));
  };

  const mergeSelection = () => {
    if (!selection) return;
    const { sr, sc, er, ec } = selection;
    const startR = Math.min(sr, er);
    const endR = Math.max(sr, er);
    const startC = Math.min(sc, ec);
    const endC = Math.max(sc, ec);

    if (startR === endR && startC === endC) return; // Cannot merge single cell

    pushHistory();
    const newMerge: MergeRange = { sr: startR, sc: startC, er: endR, ec: endC };
    setMerges([...merges, newMerge]);
  };

  const unmergeSelection = () => {
    if (!selection) return;
    const { sr, sc, er, ec } = selection;
    const startR = Math.min(sr, er);
    const endR = Math.max(sr, er);
    const startC = Math.min(sc, ec);
    const endC = Math.max(sc, ec);

    pushHistory();
    setMerges(merges.filter(m => !(m.sr === startR && m.sc === startC && m.er === endR && m.ec === endC)));
  };

  const clearSelection = () => {
    if (!selection) return;
    updateGridRange({ value: '', computed: '' });
  };

  const insertRow = (before: boolean) => {
    if (!selection) return;
    pushHistory();
    const index = before ? Math.min(selection.sr, selection.er) : Math.max(selection.sr, selection.er) + 1;
    const cols = grid[0]?.length || INITIAL_COLS;
    const newRow: CellData[] = Array(cols).fill(null).map(() => ({ value: '' }));
    const newGrid = [...grid.slice(0, index), newRow, ...grid.slice(index)];
    const newHeights = [...rowHeights.slice(0, index), DEFAULT_ROW_HEIGHT, ...rowHeights.slice(index)];
    const newMerges = merges
      .map(m => m.sr >= index ? { ...m, sr: m.sr + 1, er: m.er + 1 } : (m.er >= index ? { ...m, er: m.er + 1 } : m));
    setGrid(recomputeAll(newGrid));
    setRowHeights(newHeights);
    setMerges(newMerges);
  };

  const deleteRow = () => {
    if (!selection || grid.length <= 1) return;
    pushHistory();
    const index = Math.min(selection.sr, selection.er);
    const newGrid = grid.filter((_, r) => r !== index);
    const newHeights = rowHeights.filter((_, r) => r !== index);
    const newMerges = merges
      .filter(m => !(m.sr === index && m.er === index))
      .map(m => {
        if (m.sr > index && m.er > index) return { ...m, sr: m.sr - 1, er: m.er - 1 };
        if (m.er > index) return { ...m, er: m.er - 1 };
        return m;
      });
    setGrid(recomputeAll(newGrid));
    setRowHeights(newHeights);
    setMerges(newMerges);
    setSelection(null);
  };

  const insertCol = (before: boolean) => {
    if (!selection) return;
    pushHistory();
    const index = before ? Math.min(selection.sc, selection.ec) : Math.max(selection.sc, selection.ec) + 1;
    const newGrid = grid.map(row => [...row.slice(0, index), { value: '' } as CellData, ...row.slice(index)]);
    const newWidths = [...colWidths.slice(0, index), DEFAULT_COL_WIDTH, ...colWidths.slice(index)];
    const newMerges = merges
      .map(m => m.sc >= index ? { ...m, sc: m.sc + 1, ec: m.ec + 1 } : (m.ec >= index ? { ...m, ec: m.ec + 1 } : m));
    setGrid(recomputeAll(newGrid));
    setColWidths(newWidths);
    setMerges(newMerges);
  };

  const deleteCol = () => {
    if (!selection || (grid[0]?.length || 0) <= 1) return;
    pushHistory();
    const index = Math.min(selection.sc, selection.ec);
    const newGrid = grid.map(row => row.filter((_, c) => c !== index));
    const newWidths = colWidths.filter((_, c) => c !== index);
    const newMerges = merges
      .filter(m => !(m.sc === index && m.ec === index))
      .map(m => {
        if (m.sc > index && m.ec > index) return { ...m, sc: m.sc - 1, ec: m.ec - 1 };
        if (m.ec > index) return { ...m, ec: m.ec - 1 };
        return m;
      });
    setGrid(recomputeAll(newGrid));
    setColWidths(newWidths);
    setMerges(newMerges);
    setSelection(null);
  };

  const exportCsv = () => {
    const csv = grid
      .map(row => row.map(cell => {
        const v = (cell.computed ?? cell.value ?? '').replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      }).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'sheet'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (!selection) return;
    e.preventDefault();
    const { sr, sc, er, ec } = selection;
    const startR = Math.min(sr, er), endR = Math.max(sr, er);
    const startC = Math.min(sc, ec), endC = Math.max(sc, ec);
    const tsv = [];
    for (let r = startR; r <= endR; r++) {
      const rowVals = [];
      for (let c = startC; c <= endC; c++) rowVals.push(grid[r]?.[c]?.value ?? '');
      tsv.push(rowVals.join('\t'));
    }
    e.clipboardData.setData('text/plain', tsv.join('\n'));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!selection) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const rows = text.replace(/\r/g, '').split('\n').filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ''));
    const startR = Math.min(selection.sr, selection.er);
    const startC = Math.min(selection.sc, selection.ec);

    pushHistory();
    const newGrid = grid.map(r => [...r]);
    rows.forEach((rowText, rOffset) => {
      const cells = rowText.split('\t');
      cells.forEach((val, cOffset) => {
        const r = startR + rOffset;
        const c = startC + cOffset;
        if (newGrid[r]?.[c]) newGrid[r][c] = { ...newGrid[r][c], value: val };
      });
    });
    setGrid(recomputeAll(newGrid));
  };

  const handleMouseDown = (r: number, c: number) => {
    setIsSelecting(true);
    setSelection({ sr: r, sc: c, er: r, ec: c });
  };

  const handleMouseEnter = (r: number, c: number) => {
    if (isSelecting && selection) {
      setSelection({ ...selection, er: r, ec: c });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setResizing(null);
  };

  const moveSelection = (dr: number, dc: number, extend: boolean) => {
    if (!selection) return;
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    if (extend) {
      const er = Math.max(0, Math.min(rows - 1, selection.er + dr));
      const ec = Math.max(0, Math.min(cols - 1, selection.ec + dc));
      setSelection({ ...selection, er, ec });
    } else {
      const r = Math.max(0, Math.min(rows - 1, selection.sr + dr));
      const c = Math.max(0, Math.min(cols - 1, selection.sc + dc));
      setSelection({ sr: r, sc: c, er: r, ec: c });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (!selection) return;
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); moveSelection(-1, 0, e.shiftKey); return;
      case 'ArrowDown': e.preventDefault(); moveSelection(1, 0, e.shiftKey); return;
      case 'ArrowLeft': e.preventDefault(); moveSelection(0, -1, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveSelection(0, 1, e.shiftKey); return;
      case 'Tab': e.preventDefault(); moveSelection(0, e.shiftKey ? -1 : 1, false); return;
      case 'Enter': e.preventDefault(); moveSelection(1, 0, false); return;
      case 'Escape': e.preventDefault(); (document.activeElement as HTMLElement)?.blur?.(); return;
      case 'Delete':
      case 'Backspace':
        // Only hijack Delete/Backspace for a multi-cell range; a single active
        // cell keeps normal in-place text editing behavior in its textarea.
        if (selection.sr !== selection.er || selection.sc !== selection.ec) {
          e.preventDefault();
          clearSelection();
        }
        return;
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent, type: 'col' | 'row', index: number) => {
    e.stopPropagation();
    const startPos = type === 'col' ? e.clientX : e.clientY;
    const startSize = type === 'col' ? colWidths[index] : rowHeights[index];
    setResizing({ type, index, startPos, startSize });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (resizing) {
      const { type, index, startPos, startSize } = resizing;
      const currentPos = type === 'col' ? e.clientX : e.clientY;
      const delta = currentPos - startPos;
      const newSize = Math.max(30, startSize + delta);

      if (type === 'col') {
        const newWidths = [...colWidths];
        newWidths[index] = newSize;
        setColWidths(newWidths);
      } else {
        const newHeights = [...rowHeights];
        newHeights[index] = newSize;
        setRowHeights(newHeights);
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataToSave = {
        grid, colWidths, rowHeights, merges
      };
      await onSave(title, JSON.stringify(dataToSave));
      setIsDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setIsSaving(false);
    }
  };

  const isCellHidden = (r: number, c: number) => {
    return merges.some(m => 
      r >= m.sr && r <= m.er && c >= m.sc && c <= m.ec && (r !== m.sr || c !== m.sc)
    );
  };

  const getMergeInfo = (r: number, c: number) => {
    const merge = merges.find(m => m.sr === r && m.sc === c);
    if (!merge) return { rowSpan: 1, colSpan: 1 };
    return {
      rowSpan: merge.er - merge.sr + 1,
      colSpan: merge.ec - merge.sc + 1
    };
  };

  if (grid.length === 0) return (
    <div className="fixed inset-0 z-[250] bg-white flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
    </div>
  );

  const activeCell = selection ? grid[selection.sr][selection.sc] : null;

  return (
    <div 
      className="fixed inset-0 z-[250] bg-stone-100 flex flex-col animate-in fade-in duration-300 overflow-hidden text-stone-900 select-none outline-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* RIBBON */}
      <div className="w-full bg-white border-b border-stone-300 shadow-sm shrink-0">
        <div className="px-6 py-2 flex items-center justify-between border-b border-stone-100 bg-stone-50/50">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              title="Back to Documents (or press browser back arrow)"
              aria-label="Back to documents"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition shadow-xs border border-stone-200"
            >
              <i className="fas fa-arrow-left text-xs"></i>
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-600 rounded-lg shadow-lg">
              <i className="fas fa-file-excel text-white text-lg"></i>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Cell Matrix Pro</span>
            </div>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
              className="bg-transparent border-none outline-none font-bold text-stone-700 text-sm w-64 focus:ring-2 focus:ring-emerald-500 rounded px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} title="Undo (Ctrl+Z)" className="w-8 h-8 flex items-center justify-center bg-stone-50 text-stone-500 hover:text-stone-800 rounded-lg border border-stone-200 transition-colors">
              <i className="fas fa-rotate-left"></i>
            </button>
            <button onClick={redo} title="Redo (Ctrl+Y)" className="w-8 h-8 flex items-center justify-center bg-stone-50 text-stone-500 hover:text-stone-800 rounded-lg border border-stone-200 transition-colors">
              <i className="fas fa-rotate-right"></i>
            </button>
            <button onClick={exportCsv} title="Export CSV" className="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-white border-stone-200 text-stone-600 hover:bg-stone-50 flex items-center gap-2">
              <i className="fas fa-download"></i> CSV
            </button>
            <button onClick={() => window.print()} title="Print / PDF Preview" className="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-stone-900 border-stone-900 text-white hover:bg-stone-800 flex items-center gap-2 shadow-xs">
              <i className="fas fa-print"></i> Print / PDF
            </button>
            <div className="w-px h-8 bg-stone-200"></div>
            <button 
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title={!isDirty && !isSaving ? 'No unsaved changes' : undefined}
              className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md transition flex items-center gap-2 ${
                isSaving
                  ? 'bg-stone-100 text-stone-400 cursor-wait'
                  : !isDirty
                  ? 'bg-stone-100 text-stone-400 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isSaving ? <i className="fas fa-sync fa-spin"></i> : <i className={`fas ${isDirty ? 'fa-floppy-disk' : 'fa-check'}`}></i>}
              {isSaving ? 'Saving...' : isDirty ? 'Save Matrix' : 'Saved'}
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-stone-50 text-stone-400 hover:text-rose-600 rounded-lg border border-stone-200 transition-colors">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="flex px-6 border-b border-stone-150 bg-white">
          {(['home', 'styles', 'formulas', 'templates'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 text-[10px] font-extrabold uppercase tracking-wider border-b-2 transition-all ${activeTab === tab ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
            >
              {tab === 'home' ? 'Font & Layout' : tab === 'styles' ? 'Cell Styles & Formats' : tab === 'formulas' ? 'Formulas & Math' : 'Starter Templates'}
            </button>
          ))}
        </div>

        <div className="px-6 py-2.5 flex items-center gap-6 bg-white/70 min-h-14 overflow-x-auto no-scrollbar">
          {activeTab === 'home' && (
            <div className="flex items-center gap-3 shrink-0">
              {/* Font Family Dropdown */}
              <select
                value={activeCell?.fontFamily || "'Inter', sans-serif"}
                onChange={(e) => updateGridRange({ fontFamily: e.target.value })}
                className="h-8 px-2 bg-stone-50 border border-stone-200 rounded text-xs font-medium text-stone-700 outline-none hover:bg-white"
                title="Font Family"
              >
                <option value="'Inter', sans-serif">Inter (Modern Sans)</option>
                <option value="Arial, sans-serif">Arial (Corporate)</option>
                <option value="Georgia, serif">Georgia (Formal Serif)</option>
                <option value="'JetBrains Mono', monospace">Mono (Financial)</option>
              </select>

              {/* Font Size Dropdown */}
              <select
                value={activeCell?.fontSize || '13px'}
                onChange={(e) => updateGridRange({ fontSize: e.target.value })}
                className="h-8 px-2 bg-stone-50 border border-stone-200 rounded text-xs font-medium text-stone-700 outline-none hover:bg-white"
                title="Font Size"
              >
                <option value="11px">11px (Fine)</option>
                <option value="12px">12px (Small)</option>
                <option value="13px">13px (Normal)</option>
                <option value="14px">14px (Medium)</option>
                <option value="16px">16px (Large)</option>
                <option value="18px">18px (Title)</option>
              </select>

              <div className="w-px h-6 bg-stone-200"></div>

              {/* Bold & Italic */}
              <button onClick={() => updateGridRange({ bold: !activeCell?.bold })} className={`w-8 h-8 rounded flex items-center justify-center border text-xs font-bold ${activeCell?.bold ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`} title="Bold"><i className="fas fa-bold"></i></button>
              <button onClick={() => updateGridRange({ italic: !activeCell?.italic })} className={`w-8 h-8 rounded flex items-center justify-center border text-xs ${activeCell?.italic ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`} title="Italic"><i className="fas fa-italic"></i></button>

              <div className="w-px h-6 bg-stone-200"></div>

              {/* Alignments */}
              <button onClick={() => updateGridRange({ align: 'left' })} className={`w-8 h-8 rounded flex items-center justify-center ${activeCell?.align === 'left' ? 'bg-stone-200 text-stone-900 font-bold' : 'hover:bg-stone-100 text-stone-500'}`} title="Align Left"><i className="fas fa-align-left text-xs"></i></button>
              <button onClick={() => updateGridRange({ align: 'center' })} className={`w-8 h-8 rounded flex items-center justify-center ${activeCell?.align === 'center' ? 'bg-stone-200 text-stone-900 font-bold' : 'hover:bg-stone-100 text-stone-500'}`} title="Align Center"><i className="fas fa-align-center text-xs"></i></button>
              <button onClick={() => updateGridRange({ align: 'right' })} className={`w-8 h-8 rounded flex items-center justify-center ${activeCell?.align === 'right' ? 'bg-stone-200 text-stone-900 font-bold' : 'hover:bg-stone-100 text-stone-500'}`} title="Align Right"><i className="fas fa-align-right text-xs"></i></button>
              <button onClick={() => updateGridRange({ wrap: !activeCell?.wrap })} className={`px-2.5 h-8 rounded flex items-center gap-1.5 border text-[10px] font-bold ${activeCell?.wrap ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-600'}`} title="Wrap Text"><i className="fas fa-text-width text-xs"></i> Wrap</button>

              <div className="w-px h-6 bg-stone-200"></div>

              {/* Text & Fill Colors */}
              <div className="flex items-center gap-1" title="Text Color">
                <i className="fas fa-font text-stone-400 text-xs"></i>
                <input type="color" value={activeCell?.color || '#1e293b'} onChange={(e) => updateGridRange({ color: e.target.value })} className="w-7 h-7 border border-stone-200 rounded cursor-pointer p-0.5" />
              </div>
              <div className="flex items-center gap-1" title="Fill Color">
                <i className="fas fa-fill-drip text-stone-400 text-xs"></i>
                <input type="color" value={activeCell?.bgColor || '#ffffff'} onChange={(e) => updateGridRange({ bgColor: e.target.value })} className="w-7 h-7 border border-stone-200 rounded cursor-pointer p-0.5" />
              </div>

              <div className="w-px h-6 bg-stone-200"></div>

              {/* Merge & Grid structure */}
              <button onClick={mergeSelection} className="px-2.5 h-8 rounded flex items-center gap-1.5 border bg-white border-stone-200 text-stone-700 text-[10px] font-bold hover:bg-stone-50"><i className="fas fa-object-group text-xs"></i> Merge</button>
              <button onClick={unmergeSelection} className="px-2.5 h-8 rounded flex items-center gap-1.5 border bg-white border-stone-200 text-stone-700 text-[10px] font-bold hover:bg-stone-50"><i className="fas fa-object-ungroup text-xs"></i> Unmerge</button>

              <div className="w-px h-6 bg-stone-200"></div>

              {/* Rows & Cols */}
              <button onClick={() => insertRow(false)} className="px-2 h-8 rounded border bg-white border-stone-200 text-stone-600 text-[10px] font-bold hover:bg-stone-50" title="Insert Row Below">+ Row</button>
              <button onClick={deleteRow} className="px-2 h-8 rounded border bg-white border-stone-200 text-rose-500 text-[10px] font-bold hover:bg-rose-50" title="Delete Selected Row">- Row</button>
              <button onClick={() => insertCol(false)} className="px-2 h-8 rounded border bg-white border-stone-200 text-stone-600 text-[10px] font-bold hover:bg-stone-50" title="Insert Column Right">+ Col</button>
              <button onClick={deleteCol} className="px-2 h-8 rounded border bg-white border-stone-200 text-rose-500 text-[10px] font-bold hover:bg-rose-50" title="Delete Selected Col">- Col</button>
            </div>
          )}

          {activeTab === 'styles' && (
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Presets:</span>
              <button
                onClick={() => updateGridRange({ bold: true, bgColor: '#0f2942', color: '#ffffff', align: 'center', fontSize: '13px' })}
                className="px-3 py-1.5 bg-[#0f2942] text-white rounded text-[10px] font-bold hover:opacity-90 shadow-xs"
              >
                Executive Navy Header
              </button>
              <button
                onClick={() => updateGridRange({ bold: true, bgColor: '#0d9488', color: '#ffffff', align: 'center', fontSize: '13px' })}
                className="px-3 py-1.5 bg-[#0d9488] text-white rounded text-[10px] font-bold hover:opacity-90 shadow-xs"
              >
                Teal Accent Header
              </button>
              <button
                onClick={() => updateGridRange({ bold: true, bgColor: '#f1f5f9', color: '#0f172a', borderBottom: '3px double #0f2942' })}
                className="px-3 py-1.5 bg-stone-100 border border-stone-300 text-stone-800 rounded text-[10px] font-bold hover:bg-stone-200 shadow-xs"
              >
                Summary Total Row
              </button>
              <button
                onClick={() => updateGridRange({ bgColor: '#f8fafc' })}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 text-stone-600 rounded text-[10px] font-medium hover:bg-stone-100"
              >
                Zebra Light Row
              </button>
              <button
                onClick={() => updateGridRange({ bold: false, italic: false, bgColor: '#ffffff', color: '#1e293b', borderBottom: undefined, format: 'text', fontSize: '13px' })}
                className="px-2.5 py-1.5 bg-white border border-stone-200 text-stone-400 hover:text-rose-500 rounded text-[10px] font-bold"
              >
                Clear Styles
              </button>

              <div className="w-px h-6 bg-stone-200"></div>

              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Format:</span>
              <button
                onClick={() => updateGridRange({ format: 'currency', align: 'right' })}
                className={`px-3 py-1.5 rounded text-[10px] font-extrabold border ${activeCell?.format === 'currency' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
              >
                $ Currency
              </button>
              <button
                onClick={() => updateGridRange({ format: 'percent', align: 'right' })}
                className={`px-3 py-1.5 rounded text-[10px] font-extrabold border ${activeCell?.format === 'percent' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
              >
                % Percent
              </button>
              <button
                onClick={() => updateGridRange({ format: 'number', align: 'right' })}
                className={`px-3 py-1.5 rounded text-[10px] font-extrabold border ${activeCell?.format === 'number' ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'}`}
              >
                1,234 Number
              </button>
              <button
                onClick={() => updateGridRange({ format: 'text' })}
                className={`px-2.5 py-1.5 rounded text-[10px] font-medium border ${activeCell?.format === 'text' || !activeCell?.format ? 'bg-stone-100 border-stone-300 text-stone-800' : 'bg-white border-stone-200 text-stone-600'}`}
              >
                Plain Text
              </button>
            </div>
          )}

          {activeTab === 'formulas' && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
               <button onClick={() => updateGridRange({ value: '=SUM(A1:A10)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">SUM</button>
               <button onClick={() => updateGridRange({ value: '=AVERAGE(A1:A10)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">AVERAGE</button>
               <button onClick={() => updateGridRange({ value: '=MIN(A1:A10)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">MIN</button>
               <button onClick={() => updateGridRange({ value: '=MAX(A1:A10)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">MAX</button>
               <button onClick={() => updateGridRange({ value: '=COUNT(A1:A10)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">COUNT</button>
               <button onClick={() => updateGridRange({ value: '=ROUND(A1,2)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">ROUND</button>
               <button onClick={() => updateGridRange({ value: '=ABS(A1)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">ABS</button>
               <button onClick={() => updateGridRange({ value: '=IF(A1>0,1,0)' })} className="px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded text-[10px] font-bold border border-emerald-200 hover:bg-emerald-100">IF(cond,true,false)</button>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => {
                  if (confirm('Load 5-Year Executive Financial Statement template into grid?')) {
                    loadFinancialStatementTemplate();
                  }
                }}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors"
              >
                <i className="fas fa-chart-line"></i>
                5-Year Income Statement Model
              </button>

              <button
                onClick={() => {
                  if (confirm('Load Unit Economics & BOM Breakdown template into grid?')) {
                    loadUnitCostingTemplate();
                  }
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-xs transition-colors"
              >
                <i className="fas fa-boxes-stacked"></i>
                Unit Economics & BOM Model
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FORMULA BAR */}
      <div className="w-full bg-stone-50 border-b border-stone-200 px-4 py-2 flex items-center gap-3">
        <div className="bg-white border border-stone-300 rounded px-4 py-1.5 text-[11px] font-black text-stone-600 min-w-[70px] text-center shadow-sm">
          {selection ? `${getColLabel(selection.sc)}${selection.sr + 1}` : '--'}
        </div>
        <div className="flex-1 bg-white border border-stone-300 rounded-lg px-4 flex items-center shadow-sm focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
          <span className="italic text-stone-300 font-serif mr-3 text-lg font-bold">fx</span>
          <input 
            type="text"
            className="w-full py-2 text-sm font-medium outline-none text-stone-700"
            value={selection ? grid[selection.sr][selection.sc].value : ''}
            onChange={(e) => updateGridRange({ value: e.target.value })}
            placeholder="Enter formula or value..."
          />
        </div>
      </div>

      {/* GRID CONTAINER */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-stone-200 p-1">
        <div className="inline-block">
          <table className="border-collapse table-fixed bg-white shadow-lg">
            <thead>
              <tr className="bg-stone-100">
                <th className="w-12 border border-stone-300 sticky left-0 top-0 z-40 bg-stone-100"></th>
                {grid[0]?.map((_, c) => (
                  <th 
                    key={c} 
                    style={{ width: colWidths[c] }}
                    className="h-8 border border-stone-300 text-[10px] font-black text-stone-500 uppercase tracking-widest sticky top-0 z-30 bg-stone-100 group relative"
                  >
                    {getColLabel(c)}
                    <div 
                      onMouseDown={(e) => handleHeaderMouseDown(e, 'col', c)}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-400 z-50"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, r) => (
                <tr key={r} style={{ height: rowHeights[r] }}>
                  <td className="w-12 border border-stone-300 bg-stone-100 text-[10px] font-black text-stone-400 text-center sticky left-0 z-20 group relative">
                    {r + 1}
                    <div 
                      onMouseDown={(e) => handleHeaderMouseDown(e, 'row', r)}
                      className="absolute left-0 right-0 bottom-0 h-1.5 cursor-row-resize hover:bg-emerald-400 z-50"
                    />
                  </td>
                  {row.map((cell, c) => {
                    if (isCellHidden(r, c)) return null;
                    const { rowSpan, colSpan } = getMergeInfo(r, c);
                    
                    const isSelected = selection && (
                      r >= Math.min(selection.sr, selection.er) && 
                      r <= Math.max(selection.sr, selection.er) &&
                      c >= Math.min(selection.sc, selection.ec) &&
                      c <= Math.max(selection.sc, selection.ec)
                    );

                    const isActive = selection && selection.sr === r && selection.sc === c;

                    return (
                      <td 
                        key={c}
                        rowSpan={rowSpan}
                        colSpan={colSpan}
                        onMouseDown={() => handleMouseDown(r, c)}
                        onMouseEnter={() => handleMouseEnter(r, c)}
                        className={`border border-stone-200 relative p-0 overflow-hidden ${isSelected ? 'bg-emerald-50/50' : ''}`}
                        style={{
                          textAlign: cell.align || (cell.format === 'currency' || cell.format === 'percent' || cell.format === 'number' ? 'right' : 'left'),
                          fontWeight: cell.bold ? '700' : 'normal',
                          fontStyle: cell.italic ? 'italic' : 'normal',
                          backgroundColor: cell.bgColor,
                          color: cell.color,
                          fontFamily: cell.fontFamily || "'Inter', sans-serif",
                          fontSize: cell.fontSize || '13px',
                          borderBottom: cell.borderBottom || undefined,
                          verticalAlign: 'middle'
                        }}
                      >
                        {isActive ? (
                          <textarea 
                            autoFocus
                            className={`w-full h-full p-2 text-[13px] outline-none bg-white font-medium text-stone-800 resize-none ${cell.wrap ? 'whitespace-pre-wrap' : 'whitespace-nowrap overflow-hidden'}`}
                            value={cell.value}
                            onChange={(e) => updateGridRange({ value: e.target.value })}
                          />
                        ) : (
                          <div className={`w-full h-full p-2 text-[13px] font-medium text-stone-800 ${cell.wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>
                            {formatDisplayValue(cell)}
                          </div>
                        )}
                        {isSelected && !isActive && <div className="absolute inset-0 ring-1 ring-emerald-500/30 pointer-events-none" />}
                        {isActive && <div className="absolute inset-0 ring-2 ring-emerald-500 z-10 pointer-events-none" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER */}
      <div className="w-full bg-emerald-700 text-white h-8 flex items-center justify-between px-6 text-[10px] font-bold z-40 shrink-0">
         <div className="flex items-center gap-6">
            <span>Spreadsheet Mode</span>
            <span>Rows: {grid.length} | Cols: {grid[0]?.length} | Merges: {merges.length}</span>
         </div>
         <div className="flex items-center gap-4">
            {saveSuccess && <span className="animate-in slide-in-from-right-4">SAVED TO VAULT</span>}
            <span className="opacity-50">Cell Matrix v1.5 • Arrows/Tab/Enter to navigate • Ctrl+Z/Y undo/redo • Ctrl+C/V copy/paste</span>
         </div>
      </div>
    </div>
  );
};

export default ExcelEditor;
