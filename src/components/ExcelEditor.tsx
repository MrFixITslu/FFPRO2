
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface CellFormatting {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  bgColor?: string;
  wrap?: boolean;
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
  const [title, setTitle] = useState(initialTitle);
  const [grid, setGrid] = useState<CellData[][]>([]);
  const [colWidths, setColWidths] = useState<number[]>([]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [merges, setMerges] = useState<MergeRange[]>([]);
  
  const [selection, setSelection] = useState<{ sr: number, sc: number, er: number, ec: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  const [resizing, setResizing] = useState<{ type: 'col' | 'row', index: number, startPos: number, startSize: number } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'home' | 'formulas'>('home');
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
      className="fixed inset-0 z-[250] bg-slate-100 flex flex-col animate-in fade-in duration-300 overflow-hidden text-slate-900 select-none outline-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* RIBBON */}
      <div className="w-full bg-white border-b border-slate-300 shadow-sm shrink-0">
        <div className="px-6 py-2 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-600 rounded-lg shadow-lg">
              <i className="fas fa-file-excel text-white text-lg"></i>
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Cell Matrix Pro</span>
            </div>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
              className="bg-transparent border-none outline-none font-bold text-slate-700 text-sm w-64 focus:ring-2 focus:ring-emerald-500 rounded px-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={undo} title="Undo (Ctrl+Z)" className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 transition-colors">
              <i className="fas fa-rotate-left"></i>
            </button>
            <button onClick={redo} title="Redo (Ctrl+Y)" className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 transition-colors">
              <i className="fas fa-rotate-right"></i>
            </button>
            <button onClick={exportCsv} title="Export CSV" className="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2">
              <i className="fas fa-download"></i> CSV
            </button>
            <div className="w-px h-8 bg-slate-200"></div>
            <button 
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title={!isDirty && !isSaving ? 'No unsaved changes' : undefined}
              className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-md transition flex items-center gap-2 ${
                isSaving
                  ? 'bg-slate-100 text-slate-400 cursor-wait'
                  : !isDirty
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isSaving ? <i className="fas fa-sync fa-spin"></i> : <i className={`fas ${isDirty ? 'fa-floppy-disk' : 'fa-check'}`}></i>}
              {isSaving ? 'Saving...' : isDirty ? 'Save Matrix' : 'Saved'}
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-rose-600 rounded-lg border border-slate-200 transition-colors">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="flex px-6 border-b border-slate-100 bg-white">
          {(['home', 'formulas'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab ? 'border-emerald-500 text-emerald-600 bg-emerald-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="px-6 py-3 flex items-center gap-8 bg-white/50 h-16">
          {activeTab === 'home' && (
            <div className="flex items-center gap-4">
              <button onClick={() => updateGridRange({ bold: !activeCell?.bold })} className={`w-10 h-10 rounded flex items-center justify-center border ${activeCell?.bold ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><i className="fas fa-bold"></i></button>
              <button onClick={() => updateGridRange({ italic: !activeCell?.italic })} className={`w-10 h-10 rounded flex items-center justify-center border ${activeCell?.italic ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><i className="fas fa-italic"></i></button>
              <div className="w-px h-8 bg-slate-200"></div>
              <button onClick={() => updateGridRange({ align: 'left' })} className={`w-8 h-8 rounded ${activeCell?.align === 'left' ? 'bg-slate-200' : 'hover:bg-slate-100'} text-slate-500`}><i className="fas fa-align-left"></i></button>
              <button onClick={() => updateGridRange({ align: 'center' })} className={`w-8 h-8 rounded ${activeCell?.align === 'center' ? 'bg-slate-200' : 'hover:bg-slate-100'} text-slate-500`}><i className="fas fa-align-center"></i></button>
              <button onClick={() => updateGridRange({ align: 'right' })} className={`w-8 h-8 rounded ${activeCell?.align === 'right' ? 'bg-slate-200' : 'hover:bg-slate-100'} text-slate-500`}><i className="fas fa-align-right"></i></button>
              <div className="w-px h-8 bg-slate-200"></div>
              <button onClick={() => updateGridRange({ wrap: !activeCell?.wrap })} className={`px-3 py-1.5 rounded flex items-center gap-2 border text-[9px] font-black uppercase tracking-widest ${activeCell?.wrap ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-600'}`}><i className="fas fa-text-width"></i> Wrap</button>
              <div className="flex items-center gap-1" title="Text color">
                <i className="fas fa-font text-slate-400 text-xs"></i>
                <input type="color" value={activeCell?.color || '#1e293b'} onChange={(e) => updateGridRange({ color: e.target.value })} className="w-7 h-7 border border-slate-200 rounded cursor-pointer p-0.5" />
              </div>
              <div className="flex items-center gap-1" title="Fill color">
                <i className="fas fa-fill-drip text-slate-400 text-xs"></i>
                <input type="color" value={activeCell?.bgColor || '#ffffff'} onChange={(e) => updateGridRange({ bgColor: e.target.value })} className="w-7 h-7 border border-slate-200 rounded cursor-pointer p-0.5" />
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <button onClick={mergeSelection} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-object-group"></i> Merge</button>
              <button onClick={unmergeSelection} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-object-ungroup"></i> Unmerge</button>
              <div className="w-px h-8 bg-slate-200"></div>
              <button onClick={() => insertRow(true)} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-arrow-up"></i> Row</button>
              <button onClick={() => insertRow(false)} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-arrow-down"></i> Row</button>
              <button onClick={deleteRow} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-rose-500 text-[9px] font-black uppercase tracking-widest hover:bg-rose-50"><i className="fas fa-trash"></i> Row</button>
              <button onClick={() => insertCol(true)} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-arrow-left"></i> Col</button>
              <button onClick={() => insertCol(false)} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50"><i className="fas fa-arrow-right"></i> Col</button>
              <button onClick={deleteCol} className="px-3 py-1.5 rounded flex items-center gap-2 border bg-white border-slate-200 text-rose-500 text-[9px] font-black uppercase tracking-widest hover:bg-rose-50"><i className="fas fa-trash"></i> Col</button>
            </div>
          )}
          {activeTab === 'formulas' && (
            <div className="flex items-center gap-3 flex-wrap">
               <button onClick={() => updateGridRange({ value: '=SUM(A1:A10)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Sum Range</button>
               <button onClick={() => updateGridRange({ value: '=AVERAGE(A1:A10)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Average Range</button>
               <button onClick={() => updateGridRange({ value: '=MIN(A1:A10)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Min Range</button>
               <button onClick={() => updateGridRange({ value: '=MAX(A1:A10)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Max Range</button>
               <button onClick={() => updateGridRange({ value: '=COUNT(A1:A10)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Count Range</button>
               <button onClick={() => updateGridRange({ value: '=ROUND(A1,2)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Round</button>
               <button onClick={() => updateGridRange({ value: '=ABS(A1)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">Abs</button>
               <button onClick={() => updateGridRange({ value: '=IF(A1>0,1,0)' })} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase border border-emerald-200 hover:bg-emerald-100">If</button>
            </div>
          )}
        </div>
      </div>

      {/* FORMULA BAR */}
      <div className="w-full bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center gap-3">
        <div className="bg-white border border-slate-300 rounded px-4 py-1.5 text-[11px] font-black text-slate-600 min-w-[70px] text-center shadow-sm">
          {selection ? `${getColLabel(selection.sc)}${selection.sr + 1}` : '--'}
        </div>
        <div className="flex-1 bg-white border border-slate-300 rounded-lg px-4 flex items-center shadow-sm focus-within:ring-2 focus-within:ring-emerald-500 transition-all">
          <span className="italic text-slate-300 font-serif mr-3 text-lg font-bold">fx</span>
          <input 
            type="text"
            className="w-full py-2 text-sm font-medium outline-none text-slate-700"
            value={selection ? grid[selection.sr][selection.sc].value : ''}
            onChange={(e) => updateGridRange({ value: e.target.value })}
            placeholder="Enter formula or value..."
          />
        </div>
      </div>

      {/* GRID CONTAINER */}
      <div className="flex-1 overflow-auto custom-scrollbar bg-slate-200 p-1">
        <div className="inline-block">
          <table className="border-collapse table-fixed bg-white shadow-lg">
            <thead>
              <tr className="bg-slate-100">
                <th className="w-12 border border-slate-300 sticky left-0 top-0 z-40 bg-slate-100"></th>
                {grid[0]?.map((_, c) => (
                  <th 
                    key={c} 
                    style={{ width: colWidths[c] }}
                    className="h-8 border border-slate-300 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-30 bg-slate-100 group relative"
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
                  <td className="w-12 border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-400 text-center sticky left-0 z-20 group relative">
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
                        className={`border border-slate-200 relative p-0 overflow-hidden ${isSelected ? 'bg-emerald-50/50' : ''}`}
                        style={{
                          textAlign: cell.align || 'left',
                          fontWeight: cell.bold ? '900' : 'normal',
                          fontStyle: cell.italic ? 'italic' : 'normal',
                          backgroundColor: cell.bgColor,
                          color: cell.color,
                          verticalAlign: 'top'
                        }}
                      >
                        {isActive ? (
                          <textarea 
                            autoFocus
                            className={`w-full h-full p-2 text-[13px] outline-none bg-white font-medium text-slate-800 resize-none ${cell.wrap ? 'whitespace-pre-wrap' : 'whitespace-nowrap overflow-hidden'}`}
                            value={cell.value}
                            onChange={(e) => updateGridRange({ value: e.target.value })}
                          />
                        ) : (
                          <div className={`w-full h-full p-2 text-[13px] font-medium text-slate-800 ${cell.wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>
                            {cell.computed || cell.value}
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
