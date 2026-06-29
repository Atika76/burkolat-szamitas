const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "burkolat-szamitas-projects-v2";

const fields = [
  "projectName",
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
  "adhesiveRate",
  "bagSize",
  "tileThickness",
  "groutDensity",
  "clipMode",
  "clipWaste",
];

function value(id) {
  const element = $(id);
  if (element.tagName === "SELECT" || element.type === "text") {
    return element.value;
  }
  return Number(element.value || 0);
}

function mm(number) {
  return `${Math.round(number)} mm`;
}

function cm(number) {
  return `${(number / 10).toLocaleString("hu-HU", {
    maximumFractionDigits: 1,
  })} cm`;
}

function kg(number) {
  return `${number.toLocaleString("hu-HU", {
    maximumFractionDigits: 1,
  })} kg`;
}

function squareM(number) {
  return `${number.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} m²`;
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

  if (available <= tolerance || tile <= tolerance) {
    return emptyResult;
  }

  const maxFull = Math.floor((available + joint) / (tile + joint));
  const exactFullCandidates = [];
  const cutCandidates = [];

  for (let full = maxFull; full >= 1; full--) {
    const joints = Math.max(0, full - 1);
    const used = full * tile + joints * joint;

    if (Math.abs(available - used) <= tolerance) {
      exactFullCandidates.push({
        mode: "center",
        full,
        startCut: 0,
        endCut: 0,
        pieces: full,
        joints,
        available,
        warning: false,
      });
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

  return (
    exactFullCandidates[0] ||
    cutCandidates.find((item) => item.startCut >= minCut) ||
    cutCandidates[0] ||
    emptyResult
  );
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

  return {
    mode: "full",
    full: 0,
    startCut: 0,
    endCut: 0,
    pieces: 0,
    joints: 0,
    available,
    warning: true,
  };
}

function calculateDimension(total, tile, joint, edgeGap, minCut, mode) {
  return mode === "center"
    ? calculateCentered(total, tile, joint, edgeGap, minCut)
    : calculateFullStart(total, tile, joint, edgeGap, minCut);
}

function createPieces(layout, tileSize) {
  const pieces = [];

  if (layout.startCut > 0.5) {
    pieces.push({ size: layout.startCut, cut: true });
  }

  for (let i = 0; i < layout.full; i++) {
    pieces.push({ size: tileSize, cut: false });
  }

  if (layout.endCut > 0.5) {
    pieces.push({ size: layout.endCut, cut: true });
  }

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
      const existing =
        pieces.get(key) || {
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

function getPatternNote(pattern) {
  if (pattern === "running-bond") {
    return "Kötésben rakásnál minden második sor fél lappal eltolva indul. A rajz és a vágáslista ezt figyelembe veszi.";
  }

  if (pattern === "diagonal") {
    return "Átlós kiosztásnál a rajz és a vágáslista tájékoztató jellegű becslés. Az anyagráhagyás automatikusan legalább 15%-ra emelkedik.";
  }

  return "A számolás a fugát a lapok között számolja. Ha a széleken is fix fugát vagy dilatációt hagysz, azt a „szélső hézag” mezőben add meg.";
}

function renderCutList(rows, tileLength, tileWidth, pattern) {
  const pieces = aggregatePiecesFromRows(rows, tileLength, tileWidth);
  const full = pieces.find((piece) => piece.isFull);
  const cuts = pieces.filter((piece) => !piece.isFull);

  const rowsHtml = [];
  if (full) {
    rowsHtml.push(resultRow("Egész lap", `${full.count} db ${cm(full.length)} × ${cm(full.width)}`));
  }

  cuts.forEach((piece) => {
    rowsHtml.push(resultRow("Vágott darab", `${piece.count} db ${cm(piece.length)} × ${cm(piece.width)}`));
  });

  if (!rowsHtml.length) {
    rowsHtml.push(resultRow("Nincs adat", "Adj meg érvényes méreteket"));
  }

  $("cutListResults").innerHTML = `
    <div class="result-list">
      ${rowsHtml.join("")}
    </div>
    <div class="note">
      ${getPatternNote(pattern)}
    </div>
  `;
}

function estimateYieldFromFullTile(piece, tileLength, tileWidth) {
  const alongLength = Math.max(1, Math.floor(tileLength / Math.max(piece.length, 1)));
  const alongWidth = Math.max(1, Math.floor(tileWidth / Math.max(piece.width, 1)));

  if (Math.abs(piece.length - tileLength) < 1) {
    return Math.max(1, Math.floor(tileWidth / Math.max(piece.width, 1)));
  }

  if (Math.abs(piece.width - tileWidth) < 1) {
    return Math.max(1, Math.floor(tileLength / Math.max(piece.length, 1)));
  }

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
    if (yieldCount > 1) {
      suggestions.push(
        `${cm(piece.length)} × ${cm(piece.width)} darabból egy teljes lapból kb. ${yieldCount} db vágható.`
      );
    }
  });

  if (pattern === "running-bond") {
    suggestions.push("Félkötésnél külön rakd félre a fél lapos indító darabokat, mert minden második sorban ismétlődnek.");
  }

  if (pattern === "diagonal") {
    suggestions.push("Átlós kiosztásnál a leeső sarokdarabokat külön jelöld, mert több az ismétlődő háromszög/trapéz jellegű vágás.");
  }

  if (!suggestions.length) {
    suggestions.push("A kisebb vágott darabokat külön csoportosítva gyorsabb a munkaközbeni visszakeresés.");
  }

  $("optimizationResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Vágott darab típus", `${cutPieces.length} féle`)}
      ${resultRow("Minimum újrahasznosítható vágás", `${reusableCount} db`)}
      ${resultRow("Vágott darabok beépített felülete", squareM(cutAreaMm2 / 1000000))}
      ${resultRow("Ismétlődő vágások", `${repeatedPieces.length} fő típus`)}
    </div>
    <div class="note">
      <strong>Gyakorlati javaslatok:</strong>
      <ul class="note-list">
        ${suggestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function drawLayout(rows, joint, pattern, widthPiecesCount, lengthPiecesCount) {
  const maxCols = 60;
  const maxRows = 60;
  const colsLimited = rows.some((row) => row.cols.length > maxCols);
  const rowsLimited = rows.length > maxRows;
  const shownRows = rowsLimited ? rows.slice(0, maxRows) : rows;
  const shownColRows = shownRows.map((row) => ({
    ...row,
    cols: colsLimited ? row.cols.slice(0, maxCols) : row.cols,
  }));

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

      if (pattern === "diagonal") {
        rects.push(`<line class="diag" x1="${x}" y1="${y + h}" x2="${x + w}" y2="${y}"></line>`);
      }

      if (rowIndex === 0 && (col.cut || colIndex === 0 || colIndex === row.cols.length - 1)) {
        rects.push(`<text class="svg-label" x="${x + 5}" y="${Math.max(18, y - 8)}">${cm(col.size)}</text>`);
      }

      if (rowIndex === shownColRows.length - 1 && row.cut && colIndex === Math.floor(row.cols.length / 2)) {
        rects.push(`<text class="svg-label" x="${x + 5}" y="${Math.min(520, y + h + 18)}">${cm(row.height)} záró sor</text>`);
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

  if (pattern === "diagonal") {
    visibleNote += " Átlós mintánál a rajz tájékoztató jellegű becslés.";
  }

  $("drawing").innerHTML = `
    <svg viewBox="0 0 ${drawnWidth} ${drawnHeight}" role="img" aria-label="Egyszerű lapkiosztási rajz">
      ${rects.join("")}
      <rect class="svg-note-bg" x="${pad - 8}" y="${footerTop}" width="${Math.max(260, drawnWidth - pad * 2 + 16)}" height="${footerHeight}" rx="10"></rect>
      <text class="svg-note" x="${drawnWidth / 2}" y="${footerTop + 22}">${escapeHtml(visibleNote)}</text>
    </svg>
  `;
}

function calculate() {
  const areaLengthMm = value("areaLength") * 1000;
  const areaWidthMm = value("areaWidth") * 1000;
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

  const lengthWarning = lengthLayout.warning ? "warning" : "ok";
  const widthWarning = widthLayout.warning ? "warning" : "ok";
  const lengthPieces = createPieces(lengthLayout, tileLengthMm);
  const widthPieces = createPieces(widthLayout, tileWidthMm);
  const rows = buildRowModel(widthPieces, lengthLayout, tileLengthMm, pattern, joint);

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
    <div class="note">
      ${getPatternNote(pattern)}
    </div>
  `;

  const areaM2 = (areaLengthMm / 1000) * (areaWidthMm / 1000);
  const tileAreaM2 = (tileLongMm / 1000) * (tileShortMm / 1000);
  const baseTiles = Math.ceil(areaM2 / tileAreaM2);
  const wasteInput = value("waste");
  const effectiveWaste = pattern === "diagonal" ? Math.max(wasteInput, 15) : wasteInput;
  const buyTiles = Math.ceil(baseTiles * (1 + effectiveWaste / 100));
  const adhesiveKg = areaM2 * value("adhesiveRate");
  const bags = Math.ceil(adhesiveKg / Math.max(value("bagSize"), 1));
  const groutKgM2 =
    ((tileLongMm + tileShortMm) / (tileLongMm * tileShortMm)) *
    joint *
    value("tileThickness") *
    value("groutDensity");
  const groutTotal = groutKgM2 * areaM2 * 1.1;
  const verticalJointSegments = Math.max(0, lengthLayout.pieces - 1) * widthLayout.pieces;
  const horizontalJointSegments = Math.max(0, widthLayout.pieces - 1) * lengthLayout.pieces;
  const clipsPerLengthEdge = Math.max(1, Math.ceil(tileLengthMm / 350));
  const clipsPerWidthEdge = Math.max(1, Math.ceil(tileWidthMm / 350));
  const patternClipMultiplier = pattern === "diagonal" ? 1.1 : 1;
  const clipBase =
    (verticalJointSegments * clipsPerWidthEdge + horizontalJointSegments * clipsPerLengthEdge) *
    Number(value("clipMode")) *
    patternClipMultiplier;
  const clips = Math.ceil(clipBase * (1 + value("clipWaste") / 100));
  const wedges = Math.ceil(Math.min(clips, Math.max(100, clips * 0.25)));

  $("materialResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Felület", squareM(areaM2))}
      ${resultRow("Lap minimum", `${baseTiles} db`)}
      ${resultRow("Alkalmazott ráhagyás", `${effectiveWaste}%`)}
      ${resultRow("Lap ráhagyással", `${buyTiles} db`)}
      ${resultRow("Ragasztó", `${kg(adhesiveKg)} ≈ ${bags} zsák`)}
      ${resultRow("Fugázó becslés", kg(groutTotal))}
      ${resultRow("Papucs alap kiosztás", `${Math.ceil(clipBase)} db`)}
      ${resultRow(`${joint} mm-es papucs`, `${clips} db`)}
      ${resultRow("Ék becslés", `${wedges} db, mert újrahasználható`)}
    </div>
    <div class="note">
      A ragasztó és fugázó gyártónként eltér. Ez munkaközbeni becslés; pontosításhoz megadható a választott termék gyártói fogyása.
    </div>
  `;

  renderCutList(rows, tileLengthMm, tileWidthMm, pattern);
  renderOptimization(rows, tileLengthMm, tileWidthMm, minCut, pattern, lengthLayout, widthLayout);
  drawLayout(rows, joint, pattern, widthPieces.length, lengthPieces.length);
}

function getSavedProjects() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function setSavedProjects(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function collectProject() {
  const data = {};
  fields.forEach((id) => {
    data[id] = $(id).value;
  });
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    data,
  };
}

function applyProject(project) {
  if (!project || !project.data) return;
  fields.forEach((id) => {
    if (project.data[id] !== undefined) {
      $(id).value = project.data[id];
    }
  });
  calculate();
}

function refreshSavedProjects() {
  const select = $("savedProjects");
  const projects = getSavedProjects();
  const names = Object.keys(projects).sort((a, b) => a.localeCompare(b, "hu"));

  select.innerHTML =
    names.length === 0
      ? `<option value="">Nincs mentett projekt</option>`
      : names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function saveProject() {
  const projects = getSavedProjects();
  const name = String(value("projectName") || "").trim() || `Burkolat ${new Date().toLocaleDateString("hu-HU")}`;
  $("projectName").value = name;
  projects[name] = collectProject();
  setSavedProjects(projects);
  refreshSavedProjects();
  $("savedProjects").value = name;
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

function exportCurrentProject() {
  const project = collectProject();
  const name = (String(value("projectName") || "burkolat-projekt").trim() || "burkolat-projekt")
    .toLowerCase()
    .replaceAll(/[^a-z0-9áéíóöőúüű-]+/gi, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-|-$/g, "");
  downloadJsonFile(`${name || "burkolat-projekt"}.json`, project);
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

fields.forEach((id) => {
  $(id).addEventListener("input", calculate);
  $(id).addEventListener("change", calculate);
});

$("calculateButton").addEventListener("click", () => {
  calculate();
  $("eredmenyek").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("saveProjectButton").addEventListener("click", () => {
  saveProject();
  calculate();
});

$("loadProjectButton").addEventListener("click", () => {
  const projects = getSavedProjects();
  applyProject(projects[$("savedProjects").value]);
});

$("deleteProjectButton").addEventListener("click", () => {
  const name = $("savedProjects").value;
  if (!name) return;
  const projects = getSavedProjects();
  delete projects[name];
  setSavedProjects(projects);
  refreshSavedProjects();
});

$("exportProjectButton").addEventListener("click", () => {
  exportCurrentProject();
});

$("importProjectButton").addEventListener("click", () => {
  $("importFile").click();
});

$("importFile").addEventListener("change", (event) => {
  importProjectFromFile(event.target.files?.[0]);
  event.target.value = "";
});

$("printButton").addEventListener("click", () => {
  calculate();
  window.print();
});

refreshSavedProjects();
calculate();
