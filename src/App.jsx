import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, Package, ArrowRightLeft, ChevronRight, Search, X, Database, Plus, Trash2, Move, CheckCircle2, MapPin, 
  ExternalLink, PackageSearch, Sparkles, BarChart3, Box, LayoutGrid, Zap, GripVertical, Activity, ArrowUpRight, 
  Clock, AlertCircle, Download, Printer, RotateCcw, Settings, ClipboardList, Heart, Minus, Upload, ListFilter, PlusCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from './lib/supabase';

// Global Data
import PRODUCTS_DATA_RAW from './data/products.json';
const LOCAL_PRODUCTS = Array.isArray(PRODUCTS_DATA_RAW) ? PRODUCTS_DATA_RAW.filter(p => p !== null) : [];

const BOX_COLORS = [
  { name: 'Red', hex: '#ef4444' }, { name: 'Yellow', hex: '#facc15' }, { name: 'Green', hex: '#22c55e' },
  { name: 'Sky', hex: '#38bdf8' }, { name: 'Navy', hex: '#1e3a8a' }
];

const INITIAL_DATA = { '1F': { name: 'Main Warehouse', pallets: [] }, '2F': { name: 'Sub Storage', pallets: [] }, '3F': { name: 'Overflow', pallets: [] } };

const App = () => {
  const [warehouse, setWarehouse] = useState(INITIAL_DATA);
  const [activeFloor, setActiveFloor] = useState('1F');
  const [selectedPalletUid, setSelectedPalletUid] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeInput, setActiveInput] = useState(null);
  const [dropdownResults, setDropdownResults] = useState([]);
  const [dbProducts, setDbProducts] = useState([]);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [draggedPallet, setDraggedPallet] = useState(null);
  const [dragOverFloor, setDragOverFloor] = useState(null);
  const [selectedPallets, setSelectedPallets] = useState([]); // List of UIDs

  const fileInputRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  // 1. Fetch initial warehouse data from Supabase
  useEffect(() => {
    const initFetch = async () => {
      try {
        setSyncStatus('syncing');
        const { data, error } = await supabase
          .from('warehouse_state')
          .select('data')
          .eq('id', 1)
          .single();
        
        if (!error && data) {
          setWarehouse(data.data);
          setSyncStatus('saved');
        } else if (error && error.code === 'PGRST116') {
          // No data found, keep initial
          setSyncStatus('idle');
        } else {
          console.error("Fetch Error:", error);
          setSyncStatus('error');
        }
      } catch (e) {
        setSyncStatus('error');
      } finally {
        setIsInitialLoad(false);
      }
    };
    initFetch();
  }, []);

  // 2. Save warehouse data to Supabase (Debounced)
  useEffect(() => {
    if (isInitialLoad) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    setSyncStatus('syncing');
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from('warehouse_state')
          .upsert({ id: 1, data: warehouse, updated_at: new Date() });
        
        if (!error) {
          setSyncStatus('saved');
          localStorage.setItem('warehouse_pro_v56', JSON.stringify(warehouse)); // Backup
        } else {
          setSyncStatus('error');
        }
      } catch (e) {
        setSyncStatus('error');
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(saveTimeoutRef.current);
  }, [warehouse, isInitialLoad]);

  useEffect(() => {
    const fetchDB = async () => {
      try { const { data, error } = await supabase.from('products').select('*'); if (!error && data) setDbProducts(data); } catch (e) {}
    };
    fetchDB();
  }, []);

  const cleanVal = (s) => (s || '').toString().trim();
  const normalize = (s) => (s || '').toString().replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

  // Standard Accessors with Splitting logic for "Option" field
  const getPName = (p) => p.name || p.product_name || p.title || p.상품명 || '';
  const getPOpt1 = (p) => {
    let raw = p.color || p.option1 || p.색상 || (p.옵션 && p.옵션.includes('/') ? p.옵션.split('/')[0] : p.옵션) || '';
    return splitColorSize(cleanVal(raw), '').color;
  };
  const getPOpt2 = (p) => {
    let raw = p.size || p.option2 || p.사이즈 || (p.옵션 && p.옵션.includes('/') ? p.옵션.split('/')[1] : '') || '';
    let colorField = p.color || p.option1 || p.색상 || '';
    
    // If size is empty but color field contains a potential size (merged)
    if ((!raw || raw === '') && /[,，\/\s]/.test(colorField)) {
      return splitColorSize(cleanVal(colorField), '').size;
    }
    // Final cleanup
    return splitColorSize('', cleanVal(raw)).size;
  };
  const getPBarcode = (p) => p.barcode || p.바코드 || p.코드 || '';

  const allProducts = useMemo(() => {
    const base = dbProducts.length > 0 ? dbProducts : LOCAL_PRODUCTS;
    // [★리퍼브] 제품은 매칭에서 무조건 제외
    return base.filter(p => !getPName(p).includes('[★리퍼브]'));
  }, [dbProducts, LOCAL_PRODUCTS]);

  const findSmartMatch = (pName, pColor, pSize) => {
    if (!pName || pName.length < 2) return null;
    const q = normalize(pName);
    const matches = allProducts.filter(p => {
      const dbN = normalize(getPName(p));
      return dbN.includes(q) || q.includes(dbN);
    });
    if (matches.length === 0) return null;
    
    const tc = normalize(pColor), ts = normalize(pSize);
    
    // 1. Exact Name + Color + Size Match
    const perfect = matches.find(p => normalize(getPOpt1(p)) === tc && normalize(getPOpt2(p)) === ts);
    if (perfect) return perfect;
    
    // 2. Exact Name + Size Match (Size is usually more critical than color)
    const sizeMatch = matches.find(p => normalize(getPOpt2(p)) === ts);
    if (sizeMatch) return sizeMatch;

    // 3. Exact Name + Color Match
    const colorMatch = matches.find(p => normalize(getPOpt1(p)) === tc);
    if (colorMatch) return colorMatch;
    
    // 4. Default to first match if name is strong match
    return matches[0];
  };

  const findMatchesSorted = (query) => {
    if (!query || query.length < 1) return [];
    const q = normalize(query);
    return allProducts.filter(p => normalize(getPName(p)).includes(q) || normalize(getPBarcode(p)).includes(q))
      .sort((a, b) => (getPOpt1(a)||'').localeCompare(getPOpt1(b)||'') || (getPOpt2(a)||'').localeCompare(getPOpt2(b)||'', undefined, {numeric: true}))
      .slice(0, 20);
  };

  const splitColorSize = (pc, ps) => {
    let cleanC = pc.replace(/^[:\s,]+/, '').trim();
    let cleanS = ps.replace(/^[:\s,]+/, '').trim();
    const delimiters = /[,，\/\s]+/;
    
    // If either field has a delimiter and the other is empty, we split
    if (cleanC.match(delimiters) && (!cleanS || cleanS === '')) {
      const parts = cleanC.split(delimiters).filter(x => x.length > 0);
      if (parts.length >= 2) {
        cleanC = parts[0].replace(/^[:\s]+/, '').trim();
        cleanS = parts[1].replace(/^[:\s]+/, '').trim();
      }
    } else if (cleanS.match(delimiters) && (!cleanC || cleanC === '')) {
      const parts = cleanS.split(delimiters).filter(x => x.length > 0);
      if (parts.length >= 2) {
        cleanC = parts[0].replace(/^[:\s]+/, '').trim();
        cleanS = parts[1].replace(/^[:\s]+/, '').trim();
      }
    }
    return { color: cleanC, size: cleanS };
  };

  const handlePackingImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const rawName = file.name.split('.')[0].replace(/^20/, '');
    const filePrefix = rawName.replace(/-(LCL|FCL)/gi, '');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binary = event.target.result;
        const workbook = XLSX.read(binary, { type: 'binary' });
        const allBoxes = []; // flat list, one entry per box, from all sheets

        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
          const isRollaru = sheetName.includes('롤라루');
          let sizeHeaderIdxs = {};
          let colMap = { box: -1, name: -1, color: -1, size: -1, qty: -1 };
          let headerFound = false;
          let lastBoxStart = -1, lastBoxEnd = -1, localCounter = 1;
          const sheetMap = {}; // separate per-sheet box map

          rows.forEach((row) => {
            if (!row || row.length < 2) return;
            const rowStr = row.join('|');

            // ── Header row (first occurrence only) ──────────────────────────
            if (!headerFound && (rowStr.includes('품명') || rowStr.includes('제품명'))) {
              row.forEach((cell, ci) => {
                const c = cleanVal(cell);
                if (colMap.box   === -1 && (c.includes('패킹') || c.includes('박스') || (c.toUpperCase().includes('NO') && ci === 0))) colMap.box   = ci;
                if (colMap.name  === -1 && (c === '품명' || c === '제품명' || c === '상품명')) colMap.name  = ci;
                if (colMap.color === -1 && (c.includes('컬러') || c.includes('색상'))) colMap.color = ci;
                if (colMap.size  === -1 && (c.includes('사이즈') || c.toUpperCase() === 'SIZE')) colMap.size  = ci;
                if (colMap.qty   === -1 && (c.includes('수량') || c.toUpperCase() === 'QTY') && !c.includes('총')) colMap.qty = ci;
                // Size-as-column detection
                if (isRollaru) {
                  const m = c.match(/^(\d{1,2})'?$/); // inch sizes: 18' 20' 24' etc
                  if (m && parseInt(m[1]) > 0) sizeHeaderIdxs[m[1] + '"'] = ci;
                } else {
                  const m = c.match(/^(1[0-9]{2}|2[0-5][0-9]|FREE|S|M|L|XL)$/);
                  if (m) sizeHeaderIdxs[m[0]] = ci;
                }
              });
              headerFound = true; return;
            }
            if (!headerFound) return;

            // ── Product name ────────────────────────────────────────────────
            const pn = cleanVal(row[colMap.name !== -1 ? colMap.name : 1]);
            if (!pn || pn.length < 2 || pn.includes('합계') || pn.includes('[★리퍼브]') || /^\d+$/.test(pn)) return;

            // ── Box range ───────────────────────────────────────────────────
            let cs = 0, ce = 0;
            const boxVal = colMap.box !== -1 ? cleanVal(row[colMap.box]) : '';
            const bm = boxVal.match(/\d+/g);
            if (bm && (boxVal.includes('-') || boxVal.includes('~') || /^\d+$/.test(boxVal))) {
              if (bm.length >= 2 && (boxVal.includes('-') || boxVal.includes('~'))) {
                cs = parseInt(bm[0]); ce = parseInt(bm[1]);
              } else { cs = ce = parseInt(bm[0]); }
              if (ce - cs > 500) ce = cs; // safety cap
              lastBoxStart = cs; lastBoxEnd = ce;
              if (ce >= localCounter) localCounter = ce + 1;
            } else if (lastBoxStart !== -1 && boxVal === '') {
              cs = lastBoxStart; ce = lastBoxEnd;
            } else { cs = ce = localCounter++; lastBoxStart = cs; lastBoxEnd = ce; }

            // ── Items ───────────────────────────────────────────────────────
            const useMatrix = isRollaru && Object.keys(sizeHeaderIdxs).length > 0;
            if (useMatrix) {
              const clr = colMap.color !== -1 ? cleanVal(row[colMap.color]) : '';
              Object.entries(sizeHeaderIdxs).forEach(([sz, ci]) => {
                const qv = parseInt(cleanVal(row[ci]).replace(/[^0-9]/g, '')) || 0;
                if (qv > 0) pushToSheetMap(sheetMap, sheetName, cs, ce, pn, clr, sz, qv);
              });
            } else {
              const ci_c = colMap.color !== -1 ? colMap.color : -1;
              const ci_s = colMap.size  !== -1 ? colMap.size  : (colMap.color !== -1 ? 3 : 2);
              const ci_q = colMap.qty   !== -1 ? colMap.qty   : (colMap.color !== -1 ? 4 : 3);
              const rawC = ci_c !== -1 ? cleanVal(row[ci_c]) : '';
              const effC = (/^\d+$/.test(rawC) && parseInt(rawC) < 50) ? '' : rawC;
              const { color, size } = splitColorSize(effC, cleanVal(row[ci_s]));
              const pq = parseInt(cleanVal(row[ci_q]).replace(/[^0-9]/g, '')) || 1;
              pushToSheetMap(sheetMap, sheetName, cs, ce, pn, color, size, pq);
            }
          });

          // Collect boxes from this sheet (sorted by box number)
          Object.values(sheetMap).sort((a, b) => a.no - b.no).forEach(b => allBoxes.push(b));
        });

        function pushToSheetMap(map, sn, s, e, pn, pc, ps, pq) {
          const best = findSmartMatch(pn, pc, ps);
          for (let n = s; n <= e; n++) {
            const k = `${sn}::${n}`;
            if (!map[k]) map[k] = { no: n, items: [], sheet: sn };
            map[k].items.push({
              id: `i-${Date.now()}-${Math.random()}`,
              name: best ? getPName(best) : pn,
              color: pc, size: ps, quantity: pq,
              dbMatched: !!best, barcode: best ? getPBarcode(best) : ''
            });
          }
        }

        if (allBoxes.length === 0) return;

        // ── Category + Pallet creation ────────────────────────────────────
        const SHOE_KW  = ['장화','슬립온','슬림온','운동화','구두','실내화','발레슈즈','아쿠아','젤리','우산','우비','샌들','레인','비닐'];
        const CLOTH_KW = ['상의','하의','원피스','세트','실내복','아우터','발레복','수영복','티셔츠','반팔','긴팔','스커트','재킷','레깅스','니트','맨투맨','SHORT PANTS','T-SHIRT'];

        function getCategory(box) {
          if (box.sheet.includes('롤라루')) return 'ROLLARU';
          const nm = box.items.map(i => i.name || '').join('|');
          if (SHOE_KW.some(k  => nm.includes(k))) return 'SHOES';
          if (CLOTH_KW.some(k => nm.includes(k))) return 'CLOTHING';
          return 'OTHER';
        }

        const catGroups = { ROLLARU: [], SHOES: [], CLOTHING: [], OTHER: [] };
        allBoxes.forEach(b => catGroups[getCategory(b)].push(b));

        const catLabel = { ROLLARU: '롤라루', SHOES: '신발', CLOTHING: '의류', OTHER: '기타' };
        const newPallets = [];
        Object.entries(catGroups).forEach(([cat, boxes]) => {
          if (!boxes.length) return;
          const label = catLabel[cat];
          for (let i = 0; i < boxes.length; i += 16) {
            const chunk = boxes.slice(i, i + 16);
            const pBoxes = chunk.map((b, idx) => ({
              uid: `b-${Date.now()}-${cat}-${i}-${idx}`,
              name: `${filePrefix}-BOX${b.no}`,
              color: BOX_COLORS[idx % 5].hex,
              items: b.items
            }));
            newPallets.push({
              uid: `p-${Date.now()}-${cat}-${i}`,
              name: `${filePrefix}-${label}-${Math.floor(i / 16) + 1}`,
              section: 'AUTO-INBOUND', boxes: pBoxes
            });
          }
        });

        setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); next[activeFloor].pallets.push(...newPallets); return next; });
      } catch (err) { console.error("IMPORT ERROR:", err); }
    };
    reader.readAsBinaryString(file); e.target.value = null;
  };


  const stats = useMemo(() => {

    let tp=0, tb=0, tq=0;
    Object.values(warehouse).forEach(f => { tp += f.pallets.length; f.pallets.forEach(p => { tb += p.boxes.length; p.boxes.forEach(b => b.items.forEach(i => tq += i.quantity)); }); });
    return { tp, tb, tq };
  }, [warehouse]);

  const currentPallet = useMemo(() => selectedPalletUid ? warehouse[activeFloor].pallets.find(p => p.uid === selectedPalletUid) : null, [warehouse, activeFloor, selectedPalletUid]);

  const handleDrop = (targetFloor) => {
    setDragOverFloor(null);
    if (!draggedPallet || draggedPallet.fromFloor === targetFloor) {
      setDraggedPallet(null); return;
    }
    setWarehouse(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pIdx = next[draggedPallet.fromFloor].pallets.findIndex(p => p.uid === draggedPallet.uid);
      if (pIdx > -1) {
        const [p] = next[draggedPallet.fromFloor].pallets.splice(pIdx, 1);
        p.section = targetFloor;
        next[targetFloor].pallets.push(p);
      }
      return next;
    });
    setDraggedPallet(null); setDragOverFloor(null);
  };

  const togglePalletSelection = (uid) => {
    setSelectedPallets(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const printSelectedPallets = () => {
    if (selectedPallets.length === 0) return alert("Select pallets to print!");
    window.print();
  };

  const getPalletDataForPrint = () => {
    const all = [];
    Object.values(warehouse).forEach(f => all.push(...f.pallets));
    return all.filter(p => selectedPallets.includes(p.uid));
  };

  const downloadSelectedPallets = () => {
    const data = getPalletDataForPrint();
    if (data.length === 0) return alert("Select pallets to download!");
    
    const rows = [];
    data.forEach(p => {
      p.boxes.forEach(b => {
        b.items.forEach(i => {
          rows.push({
            'Pallet': p.name,
            'Floor': p.section,
            'Box': b.name,
            'Product': i.name,
            'Color': i.color,
            'Size': i.size,
            'Qty': i.quantity,
            'Barcode': i.barcode
          });
        });
      });
    });
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pallets");
    XLSX.writeFile(wb, `warehouse_export_${Date.now()}.xlsx`);
  };

  return (
    <>
      {/* Hidden Print Layer - MUST BE OUTSIDE Main Container */}
      <div className="print-layer">
        {getPalletDataForPrint().map(p => {
          const bNums = p.boxes.map(b => parseInt(b.name.match(/\d+$/)?.[0] || '0')).filter(n => n > 0).sort((a,b)=>a-b);
          const range = bNums.length > 0 ? `${bNums[0]} ~ ${bNums[bNums.length-1]}` : 'N/A';
          const pNames = [...new Set(p.boxes.flatMap(b => b.items.map(i => i.name)))].join(', ');
          return (
            <div key={p.uid} className="print-page">
              <div className="print-header">{p.name} 파레트</div>
              <div className="print-body">{range}</div>
              <div className="print-footer">{pNames} ({p.boxes.length} Box)</div>
            </div>
          );
        })}
      </div>

      <div className="app-container-compact">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        :root { --p-font: 'Inter', sans-serif; --h-font: 'Outfit', sans-serif; --accent: #3b82f6; --glass: rgba(30, 41, 59, 0.75); }
        body { font-family: var(--p-font); background: #0f172a; color: #f8fafc; margin: 0; overflow: hidden; }
        .app-container-premium { display: flex; width: 100vw; height: 100vh; }
        .sidebar { width: 280px; background: #1e293b; border-right: 1px solid #334155; display: flex; flex-direction: column; z-index: 50; }
        .brand { padding: 32px 24px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #334155; }
        .brand span { font-family: var(--h-font); font-weight: 700; font-size: 20px; color: var(--accent); letter-spacing: 0.5px; }
        .stats-p { padding: 24px; display: flex; flex-direction: column; gap: 16px; background: rgba(0,0,0,0.3); }
        .stat-i { display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px; }
        .stat-i span:last-child { color: #f8fafc; font-weight: 700; font-size: 15px; font-family: var(--h-font); }
        .floor-nav { flex: 1; padding: 20px 0; overflow-y: auto; }
        .floor-b { padding: 18px 24px; display: flex; justify-content: space-between; cursor: pointer; transition: 0.3s; font-weight: 500; border-left: 4px solid transparent; }
        .floor-b:hover { background: #334155; }
        .floor-b.active { background: rgba(59,130,246,0.1); border-left-color: var(--accent); color: var(--accent); }
        .floor-count-badge { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 10px; font-size: 10px; color: #94a3b8; }
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
        .header { height: 80px; padding: 0 40px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; background: var(--glass); backdrop-filter: blur(12px); }
        .viewport { flex: 1; padding: 40px; overflow-y: auto; background: radial-gradient(circle at top right, #1e293b, #0f172a); }
        .p-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 32px; }
        .p-card { background: #1e293b; border: 1px solid #334155; border-radius: 24px; cursor: pointer; transition: 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .p-card:hover { transform: translateY(-8px); border-color: var(--accent); box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
        .p-id { padding: 0 24px 20px; font-size: 24px; font-weight: 700; font-family: var(--h-font); }
        .p-summary-table { padding: 0 24px 20px; }
        .s-row { display: grid; grid-template-columns: 2fr 1fr 0.5fr 0.8fr; font-size: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center; color: #94a3b8; }
        .s-row .n { color: #f1f5f9; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .p-footer { padding: 20px 24px; background: rgba(0,0,0,0.3); display: flex; gap: 28px; border-top: 1px solid #334155; }
        .f-item { display: flex; align-items: center; gap: 10px; }
        .f-item .v { font-size: 18px; font-weight: 700; color: #f8fafc; font-family: var(--h-font); }
        .f-item .l { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 1px; }
        .add-p-card { border: 2px dashed #334155; border-radius: 24px; height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; cursor: pointer; transition: 0.3s; color: #475569; }
        .add-p-card:hover { border-color: var(--accent); color: var(--accent); background: rgba(59,130,246,0.05); }
        .detail-p { position: fixed; right: 0; top: 0; bottom: 0; width: 540px; background: #1e293b; border-left: 1px solid #334155; z-index: 1000; display: flex; flex-direction: column; box-shadow: -20px 0 60px rgba(0,0,0,0.6); }
        .detail-h { padding: 32px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1); }
        .box-list { flex: 1; overflow-y: auto; padding: 32px; display: flex; flex-direction: column; gap: 24px; }
        .box-c { background: #0f172a; border-radius: 24px; padding: 28px; border: 1px solid #334155; box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
        .i-row { background: rgba(255,255,255,0.04); border: 1px solid #334155; border-radius: 16px; padding: 18px; margin-bottom: 16px; position: relative; }
        .i-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .i-grid .full { grid-column: span 3; }
        .i-grid label { font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 6px; font-weight: 700; display: block; letter-spacing: 0.5px; }
        .i-grid input { background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: white; padding: 12px; width: 100%; box-sizing: border-box; font-size: 14px; outline: none; transition: 0.3s; }
        .i-grid input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59,130,246,0.2); }
        .auto-dd { position: absolute; top: 100%; left: 0; right: 0; background: #1e293b; border: 1px solid #334155; border-radius: 16px; z-index: 9999; max-height: 280px; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.6); margin-top: 8px; }
        .dd-i { padding: 14px 20px; cursor: pointer; border-bottom: 1px solid #334155; font-size: 13px; transition: 0.2s; }
        .dd-i:hover { background: #334155; padding-left: 24px; }
        .action-btn { background: var(--accent); color: white; padding: 14px 24px; border: none; border-radius: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.3s; font-size: 14px; box-shadow: 0 4px 15px rgba(59,130,246,0.3); }
        .action-btn:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 8px 25px rgba(59,130,246,0.5); }
        .btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); box-shadow: none; }
        .btn-danger:hover { background: #ef4444; color: white; }
        .global-search-compact { background: #1e293b; border: 1px solid #334155; border-radius: 25px; padding: 10px 20px; display: flex; align-items: center; gap: 10px; width: 340px; }
        .global-search-compact input { background: none; border: none; color: white; outline: none; width: 100%; font-size: 14px; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
        @media print {
          .app-container-compact { display: none !important; }
          .print-layer { display: block !important; background: white; color: black; }
          .print-page { page-break-after: always; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; border: 2px solid black; box-sizing: border-box; position: relative; }
          .print-header { position: absolute; top: 40px; left: 40px; font-size: 24px; font-weight: 800; }
          .print-body { font-size: 160px; font-weight: 900; letter-spacing: -5px; display: flex; align-items: center; justify-content: center; flex: 1; }
          .print-footer { position: absolute; bottom: 80px; width: 80%; text-align: center; font-size: 28px; font-weight: 700; border-top: 1px solid #ddd; padding-top: 20px; }
        }
        .print-layer { display: none; }
        .chk-container { position: absolute; top: 14px; left: 14px; z-index: 10; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); border-radius: 6px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); }
        .chk-container.active { background: #10b981; border-color: #10b981; }
        .text-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .c-summary-row span:nth-child(1) { flex: 2.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .c-summary-row span:nth-child(2) { flex: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>


      <aside className="sidebar-compact">
        <div className="brand-compact"><Database size={20} color="var(--accent-color)" /><span>LOGI-FLOW</span></div>
        <div className="stats-mini-panel">
           <div className="stat-mini-item"><span>PALLETS</span><span>{stats.tp}</span></div>
           <div className="stat-mini-item"><span>BOXES</span><span>{stats.tb}</span></div>
           <div className="stat-mini-item"><span>TOTAL QTY</span><span>{stats.tq.toLocaleString()}</span></div>
        </div>
        <div className="floor-nav-compact">
          {['1F','2F','3F'].map(f => (
            <div 
              key={f} 
              onClick={() => { setActiveFloor(f); setSelectedPalletUid(null); }} 
              onDragOver={(e) => { 
                e.preventDefault(); 
                if (draggedPallet && draggedPallet.fromFloor !== f) {
                  setDragOverFloor(f);
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDragLeave={() => setDragOverFloor(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(f);
              }}
              className={`floor-btn-compact ${activeFloor === f ? 'active' : ''} ${dragOverFloor === f ? 'drag-over' : ''}`}
            >
              <span>{f} Floor</span><span className="floor-count-badge">{warehouse[f].pallets.length}</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:'auto', display:'flex', flexDirection:'column', gap:'10px'}}>
           <button onClick={() => fileInputRef.current.click()} className="action-btn-sidebar highlight"><Upload size={16} /> IMPORT PACKING</button>
           <input type="file" ref={fileInputRef} onChange={handlePackingImport} style={{ display: 'none' }} />
           <button onClick={() => { if(window.confirm("RESET ALL DATA?")) setWarehouse(INITIAL_DATA); }} className="action-btn-sidebar danger"><RotateCcw size={16} /> RESET SYSTEM</button>
        </div>
      </aside>

      <main className="main-compact">
        <header className="header-compact">
          <div className="header-info-compact">
            <Layers size={18} color="var(--accent-color)" /> 
            <span>{activeFloor} / {warehouse[activeFloor].name}</span>
            <span style={{color: syncStatus === 'saved' ? '#10b981' : syncStatus === 'syncing' ? '#3b82f6' : '#94a3b8', fontSize:'10px', display:'flex', alignItems:'center', gap:'4px'}}>
              <div style={{width:'4px', height:'4px', borderRadius:'50%', background: syncStatus === 'saved' ? '#10b981' : syncStatus === 'syncing' ? '#3b82f6' : '#ef4444'}} />
              {syncStatus === 'saved' ? 'SYNCED' : syncStatus === 'syncing' ? 'SAVING...' : 'ERROR'}
            </span>
          </div>
          <div className="global-search-compact">
            <div style={{display:'flex', gap:'8px', marginRight:'12px'}}>
              <button onClick={downloadSelectedPallets} className="add-action-btn" style={{padding:'4px 10px', height:'28px', fontSize:'11px', background:'#3b82f6'}}>
                <Download size={14} /> EXCEL ({selectedPallets.length})
              </button>
              <button onClick={printSelectedPallets} className="add-action-btn" style={{padding:'4px 10px', height:'28px', fontSize:'11px', background:'#10b981'}}>
                <Printer size={14} /> PRINT ({selectedPallets.length})
              </button>
            </div>
            <Search size={16} /><input placeholder="Search..." value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} />
          </div>
        </header>
        <div className="main-viewport-compact">
          <div className="pallet-grid-compact">
            {warehouse[activeFloor].pallets.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).map(p => {
               const summary = {}; let totalQty = 0;
               p.boxes.forEach(b => {
                 const seenInThisBox = new Set();
                 b.items.forEach(i => {
                   const k = `${i.name}|${i.color}|${i.size}`;
                   if (!summary[k]) summary[k] = { name: i.name, color: i.color, size: i.size, totalQty: 0, boxCount: 0 };
                   summary[k].totalQty += i.quantity;
                   totalQty += i.quantity;
                   if (!seenInThisBox.has(k)) {
                     summary[k].boxCount += 1;
                     seenInThisBox.add(k);
                   }
                 });
               });
               return (
                <div 
                  key={p.uid} 
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.uid);
                    setTimeout(() => setDraggedPallet({ uid: p.uid, fromFloor: activeFloor }), 0);
                  }}
                  onDragEnd={() => {
                    setDraggedPallet(null);
                    setDragOverFloor(null);
                  }}
                  className={`pallet-mini-card ${draggedPallet?.uid === p.uid ? 'dragging-active' : ''}`}
                  style={{ position: 'relative', cursor: 'grab' }}
                >
                  <div className={`chk-container ${selectedPallets.includes(p.uid) ? 'active' : ''}`} 
                    onClick={(e) => { e.stopPropagation(); togglePalletSelection(p.uid); }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {selectedPallets.includes(p.uid) && <CheckCircle2 size={16} color="white" />}
                  </div>
                  <div className="pallet-mini-header" onClick={() => setSelectedPalletUid(p.uid)} style={{marginLeft:'28px'}}><Package size={12} /><span>{p.section}</span></div>
                  <div className="pallet-mini-id" onClick={() => setSelectedPalletUid(p.uid)} style={{marginLeft:'28px'}}>{p.name}</div>
                  <div className="pallet-card-summary-table" onClick={() => setSelectedPalletUid(p.uid)}>
                     <div className="c-summary-header"><span>PRODUCT</span><span>OPT</span><span>B</span><span>QTY</span></div>
                     <div className="c-summary-body-scroll">
                       {Object.values(summary).map((s, idx) => (
                          <div key={idx} className="c-summary-row">
                            <span className="s-name" style={{color: s.boxColor}}>{s.name}</span>
                            <span className="s-opt">{s.color && s.size ? `${s.color}/${s.size}` : s.color || s.size || '-'}</span>
                            <span className="s-box">{s.boxCount}</span>
                            <span className="s-qty">{s.totalQty}</span>
                          </div>
                       ))}
                     </div>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', marginTop:'auto', paddingTop:'10px', borderTop:'1px solid rgba(255,255,255,0.05)', fontSize:'12px'}}>
                     <div style={{display:'flex', gap:'8px'}}><Box size={14} color="#3b82f6" /> <b>{p.boxes.length}</b></div>
                     <div style={{display:'flex', gap:'8px'}}><Activity size={14} color="#facc15" /> <b>{totalQty.toLocaleString()}</b></div>
                  </div>
                </div>
               );
            })}
            <div className="add-pallet-card" onClick={() => {
              const uid = `p-${Date.now()}`;
              setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); next[activeFloor].pallets.push({ uid, name: 'NEW PALLET', section: 'INBOUND', boxes: [] }); return next; });
              setSelectedPalletUid(uid);
            }}><Plus size={24} /></div>
          </div>
        </div>

        <AnimatePresence>
          {currentPallet && (
            <>
              <div className="detail-panel-overlay" onClick={() => setSelectedPalletUid(null)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:999}} />
              <motion.div initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} className="detail-panel-compact" style={{zIndex:1001}}>
                <div className="detail-header-compact">
                  <input className="pallet-name-input-large" value={currentPallet.name} onChange={(e) => { const next = JSON.parse(JSON.stringify(warehouse)); const p = next[activeFloor].pallets.find(pal => pal.uid === currentPallet.uid); p.name = e.target.value.toUpperCase(); setWarehouse(next); }} />
                  <div style={{display:'flex',gap:'12px'}}>
                    <button onClick={() => { 
                      if(window.confirm("DELETE PALLET?")) { 
                        const targetId = selectedPalletUid;
                        setWarehouse(prev => { 
                          const next = JSON.parse(JSON.stringify(prev)); 
                          Object.keys(next).forEach(f => {
                            next[f].pallets = next[f].pallets.filter(pal => pal.uid !== targetId);
                          });
                          return next; 
                        }); 
                        setSelectedPalletUid(null); 
                      } 
                    }} className="btn-icon-pallet-del"><Trash2 size={20} /></button>
                    <button onClick={() => setSelectedPalletUid(null)} className="close-btn-mini"><X size={28} /></button>
                  </div>
                </div>
                <div className="box-list">
                  <button onClick={() => { setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); const p = next[activeFloor].pallets.find(pal => pal.uid === currentPallet.uid); p.boxes.push({ uid: `b-${Date.now()}`, name: `BOX-${p.boxes.length+1}`, color: BOX_COLORS[p.boxes.length % 5].hex, items: [] }); return next; }); }} className="add-action-btn" style={{width:'100%', justifyContent:'center'}}><Plus size={18} /> ADD NEW BOX</button>
                  {currentPallet.boxes.map((box, bIdx) => (
                  <div key={box.uid} className="box-card-compact" style={{ borderLeft: `6px solid ${box.color}` }}>
                    <div className="box-card-header">
                      <div className="box-id-edit-group">
                        <input value={box.name} onChange={(e) => { const next = JSON.parse(JSON.stringify(warehouse)); next[activeFloor].pallets.find(p => p.uid === currentPallet.uid).boxes[bIdx].name = e.target.value; setWarehouse(next); }} />
                      </div>
                      <button onClick={() => { setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); const p = next[activeFloor].pallets.find(pal => pal.uid === currentPallet.uid); p.boxes = p.boxes.filter(b => b.uid !== box.uid); return next; }); }} className="btn-icon-sm danger"><Trash2 size={16} /></button>
                    </div>
                    {box.items.map((item, iIdx) => (
                      <div key={item.id} className="item-edit-row-complex">
                        <div className="item-inputs-grid">
                           <div className="mini-group full" style={{position:'relative'}}>
                             <label>Product {item.dbMatched && <span className="matched-badge">MATCHED</span>}</label>
                             <input value={item.name} onChange={(e) => {
                               const v = e.target.value; const next = JSON.parse(JSON.stringify(warehouse)); const it = next[activeFloor].pallets.find(p => p.uid === currentPallet.uid).boxes[bIdx].items[iIdx];
                               it.name = v; it.dbMatched = false; setWarehouse(next); setActiveInput({ puid: currentPallet.uid, buid: box.uid, iid: item.id }); setDropdownResults(findMatchesSorted(v));
                             }} onFocus={() => { setActiveInput({ puid: currentPallet.uid, buid: box.uid, iid: item.id }); setDropdownResults(findMatchesSorted(item.name)); }} onBlur={() => setTimeout(()=>setActiveInput(null),300)} />
                             {activeInput?.iid === item.id && dropdownResults.length > 0 && (
                               <div className="auto-dropdown-compact">
                                 {dropdownResults.map((p, rIdx) => (
                                   <div key={rIdx} className="dropdown-item-compact" onMouseDown={() => {
                                      const next = JSON.parse(JSON.stringify(warehouse));
                                      const target = next[activeFloor].pallets.find(pal => pal.uid === currentPallet.uid).boxes[bIdx].items[iIdx];
                                      Object.assign(target, { name: getPName(p), color: getPOpt1(p) || target.color, size: getPOpt2(p) || target.size, barcode: getPBarcode(p), dbMatched: true });
                                      setWarehouse(next); setActiveInput(null);
                                   }}>
                                     <span className="dd-main">{getPName(p)}</span>
                                     <span className="dd-sub">{getPOpt1(p)} / {getPOpt2(p)}</span>
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="mini-group"><label>Color</label><input value={item.color} onChange={(e)=>{const next=JSON.parse(JSON.stringify(warehouse));next[activeFloor].pallets.find(p=>p.uid===currentPallet.uid).boxes[bIdx].items[iIdx].color=e.target.value;setWarehouse(next);}} /></div>
                           <div className="mini-group"><label>Size</label><input value={item.size} onChange={(e)=>{const next=JSON.parse(JSON.stringify(warehouse));next[activeFloor].pallets.find(p=>p.uid===currentPallet.uid).boxes[bIdx].items[iIdx].size=e.target.value;setWarehouse(next);}} /></div>
                           <div className="mini-group" style={{maxWidth:'60px'}}><label>Qty</label><input type="number" value={item.quantity} onChange={(e)=>{const next=JSON.parse(JSON.stringify(warehouse));next[activeFloor].pallets.find(p=>p.uid===currentPallet.uid).boxes[bIdx].items[iIdx].quantity=parseInt(e.target.value)||0;setWarehouse(next);}} /></div>
                        </div>
                        <button onClick={() => { setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); const b = next[activeFloor].pallets.find(p => p.uid === currentPallet.uid).boxes[bIdx]; b.items = b.items.filter(i => i.id !== item.id); return next; }); }} className="btn-icon-del"><X size={14} /></button>
                      </div>
                    ))}
                    <button onClick={() => { setWarehouse(prev => { const next = JSON.parse(JSON.stringify(prev)); const b = next[activeFloor].pallets.find(p => p.uid === currentPallet.uid).boxes[bIdx]; b.items.push({ id: `i-${Date.now()}`, name: '', color: '', size: '', quantity: 1 }); return next; }); }} className="add-item-btn-link"><PlusCircle size={14} /> Add Item Row</button>
                  </div>
                ))}</div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </main>
    </div>
    </>
  );
};

export default App;
