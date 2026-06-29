const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "burkolat-szamitas-projects-v4";
const PRESET_KEY = "burkolat-szamitas-presets-v1";
const SURFACE_KEY = "burkolat-szamitas-current-surfaces-v1";

const fields = [
  "projectName",
  "surfaceName",
  "areaLength",
  "areaWidth",
  "tileLong",
  "tileShort",
  "joint",
  "edgeGap",
  "minCut",
  "orientation",
  "pattern",
  "lengthMode",
  "widthMode",
  "waste",
  "boxM2",
  "boxPieces",
  "adhesiveRate",
  "bagSize",
  "tileThickness",
  "groutDensity",
  "clipMode",
  "clipSpacing",
  "edgeClipMode",
  "clipWaste",
  "wedgeRatio",
  "wedgeMin",
  "opening1Name",
  "opening1Width",
  "opening1Height",
  "opening1Count",
  "opening2Name",
  "opening2Width",
  "opening2Height",
  "opening2Count",
  "opening3Name",
  "opening3Width",
  "opening3Height",
  "opening3Count",
  "skirtingEnabled",
  "skirtingPerimeter",
  "skirtingDoor",
  "skirtingHeight",
  "skirtingWaste",
];

const quickFields = [
  "quickLength",
  "quickWidth",
  "quickTileLong",
  "quickTileShort",
  "quickWaste",
  "quickBoxM2",
  "quickAdhesiveRate",
  "quickBagSize",
];

const presetFields = [
  "tileLong",
  "tileShort",
  "joint",
  "edgeGap",
  "minCut",
  "orientation",
  "pattern",
  "waste",
  "boxM2",
  "boxPieces",
  "adhesiveRate",
  "bagSize",
  "tileThickness",
  "groutDensity",
  "clipMode",
  "clipSpacing",
  "edgeClipMode",
  "clipWaste",
  "wedgeRatio",
  "wedgeMin",
  "skirtingHeight",
  "skirtingWaste",
];

let lastCalculation = null;
let surfaceList = loadJson(SURFACE_KEY, []);

function value(id) {
  const element = $(id);
  if (!element) return 0;
  if (element.tagName === "SELECT" || element.type === "text") {
    return element.value;
  }
  return Number(element.value || 0);
}

function setValue(id, val) {
  const element = $(id);
  if (element) element.value = val;
}

function mm(number) {
  return `${Math.round(number)} mm`;
}

function cm(number) {
  return `${(number / 10).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} cm`;
}

function kg(number) {
  return `${number.toLocaleString("hu-HU", { maximumFractionDigits: 1 })} kg`;
}

function squareM(number) {
  return `${number.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} m²`;
}

function moneylessNumber(number) {
  return Number(number || 0).toLocaleString("hu-HU", { maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resultRow(label, val, className = "") {
  return `<div class="result-row"><span>${label}</span><strong class="${className}">${val}</strong></div>`;
}

function patternLabel(pattern) {
  return {
    straight: "Egyenes kiosztás",
    "running-bond": "Kötésben rakás (félkötés)",
    diagonal: "Átlós kiosztás (becslés)",
  }[pattern] || "Egyenes kiosztás";
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function calculateCentered(total, tile, joint, edgeGap, minCut) {
  const available = Math.max(0, total - edgeGap * 2);
  const tolerance = 0.5;
  const emptyResult = {
    mode: "center",
    full: 0,
    startCut: 0,
    endCut: 0,
    pieces: 0,
    joints: 0,
    available,
    warning: true,
  };

  if (available <= tolerance || tile <= tolerance) return emptyResult;

  const maxFull = Math.floor((available + joint) / (tile + joint));
  const exactFullCandidates = [];
  const cutCandidates = [];

  for (let full = maxFull; full >= 1; full--) {
    const joints = Math.max(0, full - 1);
    const used = full * tile + joints * joint;
    if (Math.abs(available - used) <= tolerance) {
      exactFullCandidates.push({ mode: "center", full, startCut: 0, endCut: 0, pieces: full, joints, available, warning: false });
    }
  }

  for (let full = maxFull; full >= 0; full--) {
    const joints = full + 1;
    const cut = (available - full * tile - joints * joint) / 2;
    if (cut > tolerance && cut <= tile + tolerance) {
      const normalizedCut = Math.min(cut, tile);
      cutCandidates.push({
        mode: "center",
        full,
        startCut: normalizedCut,
        endCut: normalizedCut,
        pieces: full + 2,
        joints,
        available,
        warning: normalizedCut < minCut,
      });
    }
  }

  return exactFullCandidates[0] || cutCandidates.find((item) => item.startCut >= minCut) || cutCandidates[0] || emptyResult;
}

function calculateFullStart(total, tile, joint, edgeGap, minCut) {
  const available = Math.max(0, total - edgeGap * 2);
  const maxFull = Math.floor((available + joint) / (tile + joint));

  for (let full = maxFull; full >= 0; full--) {
    const jointsBetweenFull = Math.max(0, full - 1);
    const remainingAfterFull = available - full * tile - jointsBetweenFull * joint;
    let endCut = 0;
    let joints = jointsBetweenFull;

    if (remainingAfterFull > 0.5) {
      endCut = Math.max(0, remainingAfterFull - joint);
      joints += 1;
    }

    if (endCut <= tile) {
      return {
        mode: "full",
        full,
        startCut: 0,
        endCut,
        pieces: full + (endCut > 0.5 ? 1 : 0),
        joints,
        available,
        warning: endCut > 0.5 && endCut < minCut,
      };
    }
  }

  return { mode: "full", full: 0, startCut: 0, endCut: 0, pieces: 0, joints: 0, available, warning: true };
}

function calculateDimension(total, tile, joint, edgeGap, minCut, mode) {
  return mode === "center" ? calculateCentered(total, tile, joint, edgeGap, minCut) : calculateFullStart(total, tile, joint, edgeGap, minCut);
}

function createPieces(layout, tileSize) {
  const pieces = [];
  if (layout.startCut > 0.5) pieces.push({ size: layout.startCut, cut: true });
  for (let i = 0; i < layout.full; i++) pieces.push({ size: tileSize, cut: false });
  if (layout.endCut > 0.5) pieces.push({ size: layout.endCut, cut: true });
  return pieces;
}

function createHalfBondPieces(available, tile, joint) {
  const tolerance = 0.5;
  if (available <= tolerance || tile <= tolerance) return [];

  const pieces = [];
  let used = 0;
  const firstPiece = Math.min(tile / 2, available);

  if (firstPiece > tolerance) {
    pieces.push({ size: firstPiece, cut: firstPiece < tile - tolerance });
    used += firstPiece;
  }

  while (available - used > tolerance) {
    if (pieces.length > 0) {
      if (available - used <= joint + tolerance) break;
      used += joint;
    }
    const remaining = available - used;
    if (remaining <= tolerance) break;
    if (remaining >= tile - tolerance) {
      pieces.push({ size: tile, cut: false });
      used += tile;
    } else {
      pieces.push({ size: remaining, cut: true });
      used = available;
      break;
    }
  }

  return pieces;
}

function clonePieces(list) {
  return list.map((item) => ({ ...item }));
}

function buildRowModel(widthPieces, lengthLayout, tileLength, pattern, joint) {
  const baseCols = createPieces(lengthLayout, tileLength);
  return widthPieces.map((rowPiece, rowIndex) => {
    let cols = baseCols;
    if (pattern === "running-bond" && rowIndex % 2 === 1) {
      cols = createHalfBondPieces(lengthLayout.available, tileLength, joint);
    }
    return {
      height: rowPiece.size,
      cut: rowPiece.cut,
      cols: clonePieces(cols),
      shifted: pattern === "running-bond" && rowIndex % 2 === 1,
    };
  });
}

function aggregatePiecesFromRows(rows, tileLength, tileWidth) {
  const pieces = new Map();
  rows.forEach((row) => {
    row.cols.forEach((col) => {
      const length = Math.round(col.size);
      const width = Math.round(row.height);
      const key = `${length}x${width}`;
      const existing = pieces.get(key) || {
        length,
        width,
        count: 0,
        isFull: Math.abs(length - tileLength) < 1 && Math.abs(width - tileWidth) < 1,
        cut: col.cut || row.cut,
        areaMm2: length * width,
      };
      existing.count += 1;
      existing.cut = existing.cut || col.cut || row.cut;
      pieces.set(key, existing);
    });
  });

  return [...pieces.values()].sort((a, b) => {
    if (a.isFull !== b.isFull) return a.isFull ? -1 : 1;
    return b.count - a.count || b.areaMm2 - a.areaMm2;
  });
}

function getOpenings() {
  const openings = [];
  for (let i = 1; i <= 3; i++) {
    const width = value(`opening${i}Width`);
    const height = value(`opening${i}Height`);
    const count = value(`opening${i}Count`);
    const area = width * height * count;
    if (area > 0) {
      openings.push({
        name: String(value(`opening${i}Name`) || `Kivonás ${i}`),
        width,
        height,
        count,
        area,
      });
    }
  }
  return openings;
}

function calculateSkirting(areaLengthM, areaWidthM, tileLengthMm, tileWidthMm) {
  const enabled = value("skirtingEnabled") === "yes";
  if (!enabled) {
    return { enabled: false, linearM: 0, areaM2: 0, pieces: 0, sourceTiles: 0, stripsPerTile: 0 };
  }

  const autoPerimeter = 2 * (areaLengthM + areaWidthM);
  const perimeter = value("skirtingPerimeter") > 0 ? value("skirtingPerimeter") : autoPerimeter;
  const linearM = Math.max(0, perimeter - value("skirtingDoor"));
  const heightCm = value("skirtingHeight");
  const heightM = heightCm / 100;
  const wasteMultiplier = 1 + value("skirtingWaste") / 100;
  const tileLengthM = tileLengthMm / 1000;
  const pieces = Math.ceil((linearM / Math.max(tileLengthM, 0.001)) * wasteMultiplier);
  const stripsPerTile = Math.max(1, Math.floor(tileWidthMm / Math.max(heightCm * 10, 1)));
  const sourceTiles = Math.ceil(pieces / stripsPerTile);

  return {
    enabled: true,
    linearM,
    areaM2: linearM * heightM,
    pieces,
    sourceTiles,
    stripsPerTile,
  };
}

function calculateBoxes(targetM2, buyTiles) {
  const boxM2 = value("boxM2");
  const boxPieces = value("boxPieces");
  const boxesByM2 = boxM2 > 0 ? Math.ceil(targetM2 / boxM2) : 0;
  const boxesByPieces = boxPieces > 0 ? Math.ceil(buyTiles / boxPieces) : 0;
  const boxes = Math.max(boxesByM2, boxesByPieces);
  return {
    boxM2,
    boxPieces,
    boxesByM2,
    boxesByPieces,
    boxes,
    leftoverM2: boxM2 > 0 && boxes > 0 ? Math.max(0, boxes * boxM2 - targetM2) : 0,
    leftoverPieces: boxPieces > 0 && boxes > 0 ? Math.max(0, boxes * boxPieces - buyTiles) : 0,
  };
}

function getPatternNote(pattern) {
  if (pattern === "running-bond") {
    return "Kötésben rakásnál minden második sor fél lappal eltolva indul. A rajz és a vágáslista ezt figyelembe veszi.";
  }
  if (pattern === "diagonal") {
    return "Átlós kiosztásnál a rajz és a vágáslista tájékoztató becslés. Az anyagráhagyás automatikusan legalább 15%-ra emelkedik.";
  }
  return "A számolás a fugát a lapok között számolja. Ha a széleken is fix fugát vagy dilatációt hagysz, azt a „szélső hézag” mezőben add meg.";
}

function renderCutList(rows, tileLength, tileWidth, pattern) {
  const pieces = aggregatePiecesFromRows(rows, tileLength, tileWidth);
  const full = pieces.find((piece) => piece.isFull);
  const cuts = pieces.filter((piece) => !piece.isFull);

  const rowsHtml = [];
  if (full) rowsHtml.push(resultRow("Egész lap", `${full.count} db ${cm(full.length)} × ${cm(full.width)}`));
  cuts.forEach((piece) => rowsHtml.push(resultRow("Vágott darab", `${piece.count} db ${cm(piece.length)} × ${cm(piece.width)}`)));
  if (!rowsHtml.length) rowsHtml.push(resultRow("Nincs adat", "Adj meg érvényes méreteket"));

  $("cutListResults").innerHTML = `
    <div class="result-list">${rowsHtml.join("")}</div>
    <div class="note">${getPatternNote(pattern)}</div>
  `;
}

function estimateYieldFromFullTile(piece, tileLength, tileWidth) {
  const alongLength = Math.max(1, Math.floor(tileLength / Math.max(piece.length, 1)));
  const alongWidth = Math.max(1, Math.floor(tileWidth / Math.max(piece.width, 1)));
  if (Math.abs(piece.length - tileLength) < 1) return Math.max(1, Math.floor(tileWidth / Math.max(piece.width, 1)));
  if (Math.abs(piece.width - tileWidth) < 1) return Math.max(1, Math.floor(tileLength / Math.max(piece.length, 1)));
  return Math.max(1, alongLength * alongWidth);
}

function renderOptimization(rows, tileLength, tileWidth, minCut, pattern, lengthLayout, widthLayout) {
  const pieces = aggregatePiecesFromRows(rows, tileLength, tileWidth);
  const cutPieces = pieces.filter((piece) => !piece.isFull);
  const reusablePieces = cutPieces.filter((piece) => piece.length >= minCut && piece.width >= minCut);
  const reusableCount = reusablePieces.reduce((sum, piece) => sum + piece.count, 0);
  const repeatedPieces = cutPieces.filter((piece) => piece.count > 1).slice(0, 4);
  const cutAreaMm2 = cutPieces.reduce((sum, piece) => sum + piece.areaMm2 * piece.count, 0);
  const suggestions = [];

  if (lengthLayout.startCut > 0.5 && Math.abs(lengthLayout.startCut - lengthLayout.endCut) < 1) {
    suggestions.push(`A hossz irány kezdő és záró vágása azonos (${cm(lengthLayout.startCut)}), ezért ezeket egyformán érdemes előkészíteni.`);
  }
  if (widthLayout.startCut > 0.5 && Math.abs(widthLayout.startCut - widthLayout.endCut) < 1) {
    suggestions.push(`A szélesség irány szélső vágásai azonosak (${cm(widthLayout.startCut)}), ezért a vágások ismételhetők.`);
  }
  repeatedPieces.forEach((piece) => {
    const yieldCount = estimateYieldFromFullTile(piece, tileLength, tileWidth);
    if (yieldCount > 1) suggestions.push(`${cm(piece.length)} × ${cm(piece.width)} darabból egy teljes lapból kb. ${yieldCount} db vágható.`);
  });
  if (pattern === "running-bond") suggestions.push("Félkötésnél külön rakd félre a fél lapos indító darabokat, mert minden második sorban ismétlődnek.");
  if (pattern === "diagonal") suggestions.push("Átlós kiosztásnál a leeső sarokdarabokat külön jelöld, mert több az ismétlődő háromszög/trapéz jellegű vágás.");
  if (!suggestions.length) suggestions.push("A kisebb vágott darabokat külön csoportosítva gyorsabb a munkaközbeni visszakeresés.");

  $("optimizationResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Vágott darab típus", `${cutPieces.length} féle`)}
      ${resultRow("Minimum újrahasznosítható vágás", `${reusableCount} db`)}
      ${resultRow("Vágott darabok beépített felülete", squareM(cutAreaMm2 / 1000000))}
      ${resultRow("Ismétlődő vágások", `${repeatedPieces.length} fő típus`)}
    </div>
    <div class="note">
      <strong>Gyakorlati javaslatok:</strong>
      <ul class="note-list">${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function drawLayout(rows, joint, pattern, widthPiecesCount, lengthPiecesCount) {
  const maxCols = 60;
  const maxRows = 60;
  const colsLimited = rows.some((row) => row.cols.length > maxCols);
  const rowsLimited = rows.length > maxRows;
  const shownRows = rowsLimited ? rows.slice(0, maxRows) : rows;
  const shownColRows = shownRows.map((row) => ({ ...row, cols: colsLimited ? row.cols.slice(0, maxCols) : row.cols }));

  const totalWidthMm = shownColRows.reduce(
    (max, row) => Math.max(max, row.cols.reduce((sum, col) => sum + col.size, 0) + Math.max(0, row.cols.length - 1) * joint),
    1
  );
  const totalHeightMm = shownColRows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, shownColRows.length - 1) * joint;
  const scaleX = 760 / Math.max(totalWidthMm, 1);
  const scaleY = 360 / Math.max(totalHeightMm, 1);
  const scale = Math.min(scaleX, scaleY);
  const pad = 44;
  const minPieceSize = 10;
  let y = pad;
  const rects = [];

  shownColRows.forEach((row, rowIndex) => {
    const h = Math.max(minPieceSize, row.height * scale);
    let x = pad;
    row.cols.forEach((col, colIndex) => {
      const w = Math.max(minPieceSize, col.size * scale);
      const isCut = row.cut || col.cut;
      rects.push(`<rect class="tile ${isCut ? "cut" : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"></rect>`);
      if (pattern === "diagonal") rects.push(`<line class="diag" x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y}"></line>`);
      if (rowIndex === 0 && (col.cut || colIndex === 0 || colIndex === row.cols.length - 1)) {
        rects.push(`<text class="svg-label" x="${x + 5}" y="${Math.max(18, y - 8)}">${cm(col.size)}</text>`);
      }
      if (rowIndex === shownColRows.length - 1 && row.cut && colIndex === Math.floor(row.cols.length / 2)) {
        rects.push(`<text class="svg-label" x="${x + 5}" y="${y + h + 18}">${cm(row.height)} záró sor</text>`);
      }
      if (pattern === "running-bond" && row.shifted && colIndex === 0) {
        rects.push(`<text class="svg-small" x="${x + 5}" y="${y + 16}">félkötés</text>`);
      }
      x += w + joint * scale;
    });
    if (row.cut || rowIndex === 0 || rowIndex === shownColRows.length - 1) {
      rects.push(`<text class="svg-label" x="6" y="${y + h / 2 + 4}">${cm(row.height)}</text>`);
    }
    y += h + joint * scale;
  });

  const drawnWidth = Math.max(
    620,
    shownColRows.reduce(
      (max, row) => Math.max(max, row.cols.reduce((sum, col) => sum + Math.max(minPieceSize, col.size * scale), 0) + Math.max(0, row.cols.length - 1) * joint * scale),
      0
    ) + pad * 2
  );
  const footerTop = y + 8;
  const footerHeight = 36;
  const drawnHeight = Math.max(280, footerTop + footerHeight + 10);
  let visibleNote =
    colsLimited || rowsLimited
      ? `A rajz rövidítve van: ${lengthPiecesCount} oszlopból legfeljebb ${maxCols}, ${widthPiecesCount} sorból legfeljebb ${maxRows} látszik.`
      : `Minden sor és oszlop látszik: ${lengthPiecesCount} oszlop × ${widthPiecesCount} sor.`;
  if (pattern === "diagonal") visibleNote += " Átlós mintánál a rajz tájékoztató jellegű becslés.";

  $("drawing").innerHTML = `
    <svg viewBox="0 0 ${drawnWidth} ${drawnHeight}" role="img" aria-label="Egyszerű lapkiosztási rajz">
      ${rects.join("")}
      <rect class="svg-note-bg" x="${pad - 8}" y="${footerTop}" width="${Math.max(260, drawnWidth - pad * 2 + 16)}" height="${footerHeight}" rx="10"></rect>
      <text class="svg-note" x="${drawnWidth / 2}" y="${footerTop + 22}">${escapeHtml(visibleNote)}</text>
    </svg>
  `;
}

function calculateClipAndWedge(lengthLayout, widthLayout, tileLengthMm, tileWidthMm, pattern) {
  const spacing = Math.max(100, value("clipSpacing"));
  const verticalJointSegments = Math.max(0, lengthLayout.pieces - 1) * widthLayout.pieces;
  const horizontalJointSegments = Math.max(0, widthLayout.pieces - 1) * lengthLayout.pieces;
  const clipsPerLengthEdge = Math.max(1, Math.ceil(tileLengthMm / spacing));
  const clipsPerWidthEdge = Math.max(1, Math.ceil(tileWidthMm / spacing));
  const patternClipMultiplier = pattern === "diagonal" ? 1.1 : 1;
  let clipBase =
    (verticalJointSegments * clipsPerWidthEdge + horizontalJointSegments * clipsPerLengthEdge) *
    Number(value("clipMode")) *
    patternClipMultiplier;

  if (value("edgeClipMode") === "yes") {
    const edgeClips =
      2 * Math.max(1, lengthLayout.pieces) * clipsPerLengthEdge +
      2 * Math.max(1, widthLayout.pieces) * clipsPerWidthEdge;
    clipBase += edgeClips;
  }

  const clips = Math.ceil(clipBase * (1 + value("clipWaste") / 100));
  const wedges = Math.ceil(Math.max(value("wedgeMin"), clips * (value("wedgeRatio") / 100)));
  return { clipBase, clips, wedges };
}

function calculate() {
  const areaLengthM = value("areaLength");
  const areaWidthM = value("areaWidth");
  const areaLengthMm = areaLengthM * 1000;
  const areaWidthMm = areaWidthM * 1000;
  const tileLongMm = value("tileLong") * 10;
  const tileShortMm = value("tileShort") * 10;
  const joint = value("joint");
  const edgeGap = value("edgeGap");
  const minCut = value("minCut");
  const orientation = value("orientation");
  const pattern = value("pattern");
  const tileLengthMm = orientation === "long-length" ? tileLongMm : tileShortMm;
  const tileWidthMm = orientation === "long-length" ? tileShortMm : tileLongMm;

  const lengthLayout = calculateDimension(areaLengthMm, tileLengthMm, joint, edgeGap, minCut, value("lengthMode"));
  const widthLayout = calculateDimension(areaWidthMm, tileWidthMm, joint, edgeGap, minCut, value("widthMode"));
  const lengthPieces = createPieces(lengthLayout, tileLengthMm);
  const widthPieces = createPieces(widthLayout, tileWidthMm);
  const rows = buildRowModel(widthPieces, lengthLayout, tileLengthMm, pattern, joint);

  const grossAreaM2 = areaLengthM * areaWidthM;
  const openings = getOpenings();
  const openingsAreaM2 = openings.reduce((sum, item) => sum + item.area, 0);
  const netAreaM2 = Math.max(0, grossAreaM2 - openingsAreaM2);
  const skirting = calculateSkirting(areaLengthM, areaWidthM, tileLengthMm, tileWidthMm);
  const materialAreaM2 = netAreaM2 + skirting.areaM2;
  const tileAreaM2 = (tileLongMm / 1000) * (tileShortMm / 1000);
  const baseTiles = Math.ceil(materialAreaM2 / Math.max(tileAreaM2, 0.000001));
  const wasteInput = value("waste");
  const effectiveWaste = pattern === "diagonal" ? Math.max(wasteInput, 15) : wasteInput;
  const buyTiles = Math.ceil(baseTiles * (1 + effectiveWaste / 100));
  const boxes = calculateBoxes(materialAreaM2 * (1 + effectiveWaste / 100), buyTiles);
  const adhesiveKg = materialAreaM2 * value("adhesiveRate");
  const bags = Math.ceil(adhesiveKg / Math.max(value("bagSize"), 1));
  const groutKgM2 = ((tileLongMm + tileShortMm) / Math.max(tileLongMm * tileShortMm, 1)) * joint * value("tileThickness") * value("groutDensity");
  const groutTotal = groutKgM2 * materialAreaM2 * 1.1;
  const clipData = calculateClipAndWedge(lengthLayout, widthLayout, tileLengthMm, tileWidthMm, pattern);
  const lengthWarning = lengthLayout.warning ? "warning" : "ok";
  const widthWarning = widthLayout.warning ? "warning" : "ok";

  $("layoutResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Lap iránya", `${cm(tileLengthMm)} × ${cm(tileWidthMm)}`)}
      ${resultRow("Mintázat", patternLabel(pattern))}
      ${resultRow("Hossz irány kezdés", lengthLayout.startCut > 0.5 ? cm(lengthLayout.startCut) : "egész lap", lengthWarning)}
      ${resultRow("Hossz irány egész lap", `${lengthLayout.full} db`)}
      ${resultRow("Hossz irány vége", lengthLayout.endCut > 0.5 ? cm(lengthLayout.endCut) : "nincs vágás", lengthWarning)}
      ${resultRow("Szélesség irány kezdés", widthLayout.startCut > 0.5 ? cm(widthLayout.startCut) : "egész lap", widthWarning)}
      ${resultRow("Szélesség irány egész lap", `${widthLayout.full} db`)}
      ${resultRow("Szélesség irány vége", widthLayout.endCut > 0.5 ? cm(widthLayout.endCut) : "nincs vágás", widthWarning)}
      ${resultRow("Kiosztási darabok", `${lengthLayout.pieces} oszlop × ${widthLayout.pieces} sor`)}
      ${pattern === "running-bond" ? resultRow("Eltolt sorok", `${Math.floor(widthPieces.length / 2)} db`) : ""}
    </div>
    <div class="note">${getPatternNote(pattern)}</div>
  `;

  const openingText = openingsAreaM2 > 0 ? `${squareM(openingsAreaM2)} levonva` : "nincs levonás";
  const boxText = boxes.boxes > 0 ? `${boxes.boxes} doboz` : "nincs doboz adat";
  const leftoverText = boxes.boxes > 0 ? `${squareM(boxes.leftoverM2)} / ${boxes.leftoverPieces} db maradék` : "-";
  const skirtingText = skirting.enabled
    ? `${moneylessNumber(skirting.linearM)} fm, ${skirting.pieces} csík, kb. ${skirting.sourceTiles} lapból`
    : "nincs számolva";

  $("materialResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Bruttó felület", squareM(grossAreaM2))}
      ${resultRow("Nyílás / kivonás", openingText)}
      ${resultRow("Nettó burkolandó felület", squareM(netAreaM2))}
      ${resultRow("Lábazat / szegély", skirtingText)}
      ${resultRow("Anyaggal számolt felület", squareM(materialAreaM2))}
      ${resultRow("Lap minimum", `${baseTiles} db`)}
      ${resultRow("Alkalmazott ráhagyás", `${effectiveWaste}%`)}
      ${resultRow("Lap ráhagyással", `${buyTiles} db`)}
      ${resultRow("Doboz szükséges", boxText)}
      ${resultRow("Doboz maradék", leftoverText)}
      ${resultRow("Ragasztó", `${kg(adhesiveKg)} ≈ ${bags} zsák`)}
      ${resultRow("Fugázó becslés", kg(groutTotal))}
      ${resultRow("Papucs alap kiosztás", `${Math.ceil(clipData.clipBase)} db`)}
      ${resultRow(`${joint} mm-es papucs/talp`, `${clipData.clips} db`)}
      ${resultRow("Ék becslés", `${clipData.wedges} db, mert újrahasználható`)}
    </div>
    <div class="note">A mennyiségek saját használatra való gyakorlati becslések. A választott ragasztó/fugázó gyártói fogyása eltérhet.</div>
  `;

  renderCutList(rows, tileLengthMm, tileWidthMm, pattern);
  renderOptimization(rows, tileLengthMm, tileWidthMm, minCut, pattern, lengthLayout, widthLayout);
  drawLayout(rows, joint, pattern, widthPieces.length, lengthPieces.length);

  lastCalculation = {
    name: String(value("surfaceName") || "Felület").trim() || "Felület",
    pattern: patternLabel(pattern),
    grossAreaM2,
    openingsAreaM2,
    netAreaM2,
    skirting,
    materialAreaM2,
    baseTiles,
    buyTiles,
    boxes: boxes.boxes,
    leftoverM2: boxes.leftoverM2,
    adhesiveKg,
    bags,
    groutKg: groutTotal,
    clips: clipData.clips,
    wedges: clipData.wedges,
    tileLabel: `${cm(tileLengthMm)} × ${cm(tileWidthMm)}`,
  };
  renderSurfaceSummary();
}

function quickCalculate() {
  const length = value("quickLength");
  const width = value("quickWidth");
  const tileLong = value("quickTileLong") / 100;
  const tileShort = value("quickTileShort") / 100;
  const area = length * width;
  const tileArea = Math.max(tileLong * tileShort, 0.000001);
  const baseTiles = Math.ceil(area / tileArea);
  const buyTiles = Math.ceil(baseTiles * (1 + value("quickWaste") / 100));
  const boxes = value("quickBoxM2") > 0 ? Math.ceil((area * (1 + value("quickWaste") / 100)) / value("quickBoxM2")) : 0;
  const adhesiveKg = area * value("quickAdhesiveRate");
  const bags = Math.ceil(adhesiveKg / Math.max(value("quickBagSize"), 1));
  const cols = Math.ceil(length / Math.max(tileLong, 0.001));
  const rows = Math.ceil(width / Math.max(tileShort, 0.001));
  const roughClips = Math.ceil(((cols - 1) * rows + (rows - 1) * cols) * 1.1);

  $("quickResults").innerHTML = `
    ${resultRow("Felület", squareM(area))}
    ${resultRow("Lap ráhagyással", `${buyTiles} db`)}
    ${resultRow("Doboz", boxes > 0 ? `${boxes} doboz` : "nincs doboz adat")}
    ${resultRow("Ragasztó", `${kg(adhesiveKg)} ≈ ${bags} zsák`)}
    ${resultRow("Papucs gyors becslés", `${roughClips} db körül`)}
  `;
}

function quickToMain() {
  setValue("areaLength", value("quickLength"));
  setValue("areaWidth", value("quickWidth"));
  setValue("tileLong", value("quickTileLong"));
  setValue("tileShort", value("quickTileShort"));
  setValue("waste", value("quickWaste"));
  setValue("boxM2", value("quickBoxM2"));
  setValue("adhesiveRate", value("quickAdhesiveRate"));
  setValue("bagSize", value("quickBagSize"));
  calculate();
  $("eredmenyek").scrollIntoView({ behavior: "smooth", block: "start" });
}

function addCurrentSurface() {
  calculate();
  if (!lastCalculation) return;
  surfaceList.push({ id: Date.now(), ...lastCalculation });
  saveJson(SURFACE_KEY, surfaceList);
  renderSurfaceSummary();
}

function removeSurface(id) {
  surfaceList = surfaceList.filter((item) => item.id !== id);
  saveJson(SURFACE_KEY, surfaceList);
  renderSurfaceSummary();
}

function clearSurfaces() {
  surfaceList = [];
  saveJson(SURFACE_KEY, surfaceList);
  renderSurfaceSummary();
}

function getSurfaceTotals() {
  return surfaceList.reduce(
    (acc, item) => {
      acc.materialAreaM2 += item.materialAreaM2 || 0;
      acc.buyTiles += item.buyTiles || 0;
      acc.boxes += item.boxes || 0;
      acc.adhesiveKg += item.adhesiveKg || 0;
      acc.bags += item.bags || 0;
      acc.groutKg += item.groutKg || 0;
      acc.clips += item.clips || 0;
      acc.wedges = Math.max(acc.wedges, item.wedges || 0);
      acc.skirtingLinearM += item.skirting?.linearM || 0;
      acc.skirtingPieces += item.skirting?.pieces || 0;
      return acc;
    },
    { materialAreaM2: 0, buyTiles: 0, boxes: 0, adhesiveKg: 0, bags: 0, groutKg: 0, clips: 0, wedges: 0, skirtingLinearM: 0, skirtingPieces: 0 }
  );
}

function renderSurfaceSummary() {
  const container = $("surfaceSummaryResults");
  if (!container) return;
  if (!surfaceList.length) {
    container.innerHTML = `
      <div class="note">Még nincs hozzáadott felület. Számolj ki egy helyiséget, majd nyomd meg a „Felület hozzáadása” gombot.</div>
    `;
    return;
  }

  const totals = getSurfaceTotals();
  const rowsHtml = surfaceList
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${squareM(item.materialAreaM2)}</td>
          <td>${item.buyTiles} db</td>
          <td>${item.boxes || "-"}</td>
          <td>${item.bags} zsák</td>
          <td>${item.clips} db</td>
          <td><button class="tiny-button" type="button" data-remove-surface="${item.id}">Törlés</button></td>
        </tr>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table class="summary-table">
        <thead><tr><th>Felület</th><th>Anyag felület</th><th>Lap</th><th>Doboz</th><th>Ragasztó</th><th>Papucs</th><th></th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="result-list totals-list">
      ${resultRow("Összes anyaggal számolt felület", squareM(totals.materialAreaM2))}
      ${resultRow("Összes lap", `${totals.buyTiles} db`)}
      ${resultRow("Összes doboz", totals.boxes > 0 ? `${totals.boxes} doboz` : "nincs doboz adat")}
      ${resultRow("Összes ragasztó", `${kg(totals.adhesiveKg)} ≈ ${totals.bags} zsák`)}
      ${resultRow("Összes fugázó", kg(totals.groutKg))}
      ${resultRow("Összes papucs/talp", `${totals.clips} db`)}
      ${resultRow("Ék készlet becslés", `${totals.wedges} db körül`)}
      ${resultRow("Lábazat összesen", `${moneylessNumber(totals.skirtingLinearM)} fm / ${totals.skirtingPieces} csík`)}
    </div>
    <div class="summary-actions"><button id="clearSurfacesButton" type="button">Összes felület törlése</button></div>
  `;

  container.querySelectorAll("[data-remove-surface]").forEach((button) => {
    button.addEventListener("click", () => removeSurface(Number(button.dataset.removeSurface)));
  });
  $("clearSurfacesButton")?.addEventListener("click", clearSurfaces);
}

function buildSummaryText() {
  if (!surfaceList.length) return "Nincs hozzáadott felület.";
  const totals = getSurfaceTotals();
  const lines = [];
  lines.push(`Burkolat számítás – ${value("projectName")}`);
  lines.push("");
  surfaceList.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}`);
    lines.push(`- Lap: ${item.tileLabel}, ${item.pattern}`);
    lines.push(`- Anyaggal számolt felület: ${squareM(item.materialAreaM2)}`);
    lines.push(`- Lap ráhagyással: ${item.buyTiles} db`);
    if (item.boxes) lines.push(`- Doboz: ${item.boxes} doboz`);
    lines.push(`- Ragasztó: ${kg(item.adhesiveKg)} ≈ ${item.bags} zsák`);
    lines.push(`- Fugázó: ${kg(item.groutKg)}`);
    lines.push(`- Papucs/talp: ${item.clips} db`);
    lines.push(`- Ék: ${item.wedges} db körül`);
    if (item.skirting?.enabled) lines.push(`- Lábazat: ${moneylessNumber(item.skirting.linearM)} fm, ${item.skirting.pieces} csík`);
    lines.push("");
  });
  lines.push("Összesen:");
  lines.push(`- Anyaggal számolt felület: ${squareM(totals.materialAreaM2)}`);
  lines.push(`- Lap: ${totals.buyTiles} db`);
  if (totals.boxes) lines.push(`- Doboz: ${totals.boxes} doboz`);
  lines.push(`- Ragasztó: ${kg(totals.adhesiveKg)} ≈ ${totals.bags} zsák`);
  lines.push(`- Fugázó: ${kg(totals.groutKg)}`);
  lines.push(`- Papucs/talp: ${totals.clips} db`);
  lines.push(`- Ék készlet: ${totals.wedges} db körül`);
  return lines.join("\n");
}

async function copySummary() {
  calculate();
  const text = buildSummaryText();
  try {
    await navigator.clipboard.writeText(text);
    alert("Az összesítő vágólapra másolva. Beillesztheted üzenetbe vagy e-mailbe.");
  } catch {
    window.prompt("Másold ki az összesítőt:", text);
  }
}

function getSavedProjects() {
  return loadJson(STORAGE_KEY, {});
}

function setSavedProjects(projects) {
  saveJson(STORAGE_KEY, projects);
}

function collectProject() {
  const data = {};
  fields.forEach((id) => (data[id] = $(id).value));
  return { version: 4, savedAt: new Date().toISOString(), data, surfaces: surfaceList };
}

function applyProject(project) {
  if (!project || !project.data) return;
  fields.forEach((id) => {
    if (project.data[id] !== undefined) setValue(id, project.data[id]);
  });
  surfaceList = Array.isArray(project.surfaces) ? project.surfaces : [];
  saveJson(SURFACE_KEY, surfaceList);
  calculate();
}

function refreshSavedProjects() {
  const select = $("savedProjects");
  const projects = getSavedProjects();
  const names = Object.keys(projects).sort((a, b) => a.localeCompare(b, "hu"));
  select.innerHTML = names.length === 0 ? `<option value="">Nincs mentett projekt</option>` : names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function saveProject() {
  const projects = getSavedProjects();
  const name = String(value("projectName") || "").trim() || `Burkolat ${new Date().toLocaleDateString("hu-HU")}`;
  setValue("projectName", name);
  projects[name] = collectProject();
  setSavedProjects(projects);
  refreshSavedProjects();
  setValue("savedProjects", name);
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(name) {
  return String(name || "burkolat-projekt")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9áéíóöőúüű-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "burkolat-projekt";
}

function exportCurrentProject() {
  calculate();
  downloadJsonFile(`${safeFilename(value("projectName"))}.json`, collectProject());
}

function importProjectFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!parsed.data) {
        alert("A kiválasztott fájl nem burkolat projekt export.");
        return;
      }
      applyProject(parsed);
      saveProject();
    } catch {
      alert("Nem sikerült beolvasni a projekt fájlt.");
    }
  };
  reader.readAsText(file, "utf-8");
}

function getPresets() {
  return loadJson(PRESET_KEY, {});
}

function setPresets(presets) {
  saveJson(PRESET_KEY, presets);
}

function collectPreset() {
  const data = {};
  presetFields.forEach((id) => (data[id] = $(id).value));
  return data;
}

function applyPreset(preset) {
  if (!preset) return;
  presetFields.forEach((id) => {
    if (preset[id] !== undefined) setValue(id, preset[id]);
  });
  calculate();
}

function refreshPresets() {
  const select = $("presetSelect");
  const presets = getPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b, "hu"));
  select.innerHTML = names.length === 0 ? `<option value="">Nincs mentett beállítás</option>` : names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function savePreset() {
  const name = String(value("presetName") || "").trim() || `${value("tileLong")}×${value("tileShort")} lap`;
  const presets = getPresets();
  presets[name] = collectPreset();
  setPresets(presets);
  refreshPresets();
  setValue("presetName", name);
  setValue("presetSelect", name);
}

function loadPreset() {
  const presets = getPresets();
  applyPreset(presets[value("presetSelect")]);
}

function deletePreset() {
  const name = value("presetSelect");
  if (!name) return;
  const presets = getPresets();
  delete presets[name];
  setPresets(presets);
  refreshPresets();
}

fields.forEach((id) => {
  $(id).addEventListener("input", calculate);
  $(id).addEventListener("change", calculate);
});
quickFields.forEach((id) => {
  $(id).addEventListener("input", quickCalculate);
  $(id).addEventListener("change", quickCalculate);
});

$("quickToMainButton").addEventListener("click", quickToMain);
$("calculateButton").addEventListener("click", () => {
  calculate();
  $("eredmenyek").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("addSurfaceButton").addEventListener("click", addCurrentSurface);
$("saveProjectButton").addEventListener("click", () => {
  saveProject();
  calculate();
});
$("loadProjectButton").addEventListener("click", () => applyProject(getSavedProjects()[value("savedProjects")]));
$("deleteProjectButton").addEventListener("click", () => {
  const name = value("savedProjects");
  if (!name) return;
  const projects = getSavedProjects();
  delete projects[name];
  setSavedProjects(projects);
  refreshSavedProjects();
});
$("exportProjectButton").addEventListener("click", exportCurrentProject);
$("importProjectButton").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (event) => {
  importProjectFromFile(event.target.files?.[0]);
  event.target.value = "";
});
$("copySummaryButton").addEventListener("click", copySummary);
$("printButton").addEventListener("click", () => {
  calculate();
  window.print();
});
$("savePresetButton").addEventListener("click", savePreset);
$("loadPresetButton").addEventListener("click", loadPreset);
$("deletePresetButton").addEventListener("click", deletePreset);

refreshSavedProjects();
refreshPresets();
quickCalculate();
calculate();
