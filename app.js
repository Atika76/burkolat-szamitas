const $ = (id) => document.getElementById(id);

const fields = [
  "areaLength",
  "areaWidth",
  "tileLong",
  "tileShort",
  "joint",
  "edgeGap",
  "minCut",
  "orientation",
  "lengthMode",
  "widthMode",
  "waste",
  "adhesiveRate",
  "bagSize",
  "tileThickness",
  "groutDensity",
  "clipsPerTile",
];

function value(id) {
  const element = $(id);
  return element.tagName === "SELECT" ? element.value : Number(element.value || 0);
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

function calculateCentered(total, tile, joint, edgeGap, minCut) {
  const available = Math.max(0, total - edgeGap * 2);
  const maxFull = Math.floor((available + joint) / (tile + joint));
  const candidates = [];

  for (let full = maxFull; full >= 0; full--) {
    const joints = full + 1;
    const cut = (available - full * tile - joints * joint) / 2;

    if (cut >= 0 && cut <= tile) {
      candidates.push({
        mode: "center",
        full,
        startCut: cut,
        endCut: cut,
        pieces: full + (cut > 0.5 ? 2 : 0),
        joints,
        available,
        warning: cut > 0.5 && cut < minCut,
      });
    }
  }

  return (
    candidates.find((item) => item.startCut >= minCut || item.startCut <= 0.5) ||
    candidates[0] || {
      mode: "center",
      full: 0,
      startCut: 0,
      endCut: 0,
      pieces: 0,
      joints: 0,
      available,
      warning: true,
    }
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
  if (mode === "center") {
    return calculateCentered(total, tile, joint, edgeGap, minCut);
  }

  return calculateFullStart(total, tile, joint, edgeGap, minCut);
}

function resultRow(label, value, className = "") {
  return `<div class="result-row"><span>${label}</span><strong class="${className}">${value}</strong></div>`;
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

function drawLayout(lengthLayout, widthLayout, tileLength, tileWidth, joint) {
  const lengthPieces = createPieces(lengthLayout, tileLength);
  const widthPieces = createPieces(widthLayout, tileWidth);
  const maxCols = 18;
  const maxRows = 10;
  const shownCols = lengthPieces.slice(0, maxCols);
  const shownRows = widthPieces.slice(0, maxRows);
  const scaleX = 760 / Math.max(lengthLayout.available, 1);
  const scaleY = 360 / Math.max(widthLayout.available, 1);
  const scale = Math.min(scaleX, scaleY);
  const pad = 38;
  const width = Math.max(620, lengthLayout.available * scale + pad * 2);
  const height = Math.max(280, widthLayout.available * scale + pad * 2);

  let y = pad;
  const rects = [];

  shownRows.forEach((row, rowIndex) => {
    let x = pad;
    const h = Math.max(16, row.size * scale);

    shownCols.forEach((col, colIndex) => {
      const w = Math.max(16, col.size * scale);
      const isCut = row.cut || col.cut;
      rects.push(
        `<rect class="tile ${isCut ? "cut" : ""}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"></rect>`
      );

      if (rowIndex === 0 && (col.cut || colIndex === 0 || colIndex === shownCols.length - 1)) {
        rects.push(
          `<text class="svg-label" x="${x + 5}" y="${Math.max(18, y - 8)}">${cm(col.size)}</text>`
        );
      }

      x += w + joint * scale;
    });

    if (row.cut || rowIndex === 0 || rowIndex === shownRows.length - 1) {
      rects.push(`<text class="svg-label" x="6" y="${y + h / 2 + 4}">${cm(row.size)}</text>`);
    }

    y += h + joint * scale;
  });

  const colNote =
    lengthPieces.length > maxCols
      ? `<text class="svg-label" x="${pad}" y="${height - 10}">A rajz rövidítve van: ${lengthPieces.length} oszlopból ${maxCols} látszik.</text>`
      : "";
  const rowNote =
    widthPieces.length > maxRows
      ? `<text class="svg-label" x="${pad}" y="${height - 28}">A sorok is rövidítve vannak: ${widthPieces.length} sorból ${maxRows} látszik.</text>`
      : "";

  $("drawing").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Egyszerű lapkiosztási rajz">
      ${rects.join("")}
      ${rowNote}
      ${colNote}
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

  const tileLengthMm = orientation === "long-length" ? tileLongMm : tileShortMm;
  const tileWidthMm = orientation === "long-length" ? tileShortMm : tileLongMm;

  const lengthLayout = calculateDimension(
    areaLengthMm,
    tileLengthMm,
    joint,
    edgeGap,
    minCut,
    value("lengthMode")
  );
  const widthLayout = calculateDimension(
    areaWidthMm,
    tileWidthMm,
    joint,
    edgeGap,
    minCut,
    value("widthMode")
  );

  const lengthWarning = lengthLayout.warning ? "warning" : "ok";
  const widthWarning = widthLayout.warning ? "warning" : "ok";

  $("layoutResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Lap iránya", `${cm(tileLengthMm)} × ${cm(tileWidthMm)}`)}
      ${resultRow(
        "Hossz irány kezdés",
        lengthLayout.startCut > 0.5 ? cm(lengthLayout.startCut) : "egész lap",
        lengthWarning
      )}
      ${resultRow("Hossz irány egész lap", `${lengthLayout.full} db`)}
      ${resultRow(
        "Hossz irány vége",
        lengthLayout.endCut > 0.5 ? cm(lengthLayout.endCut) : "nincs vágás",
        lengthWarning
      )}
      ${resultRow(
        "Szélesség irány kezdés",
        widthLayout.startCut > 0.5 ? cm(widthLayout.startCut) : "egész lap",
        widthWarning
      )}
      ${resultRow("Szélesség irány egész lap", `${widthLayout.full} db`)}
      ${resultRow(
        "Szélesség irány vége",
        widthLayout.endCut > 0.5 ? cm(widthLayout.endCut) : "nincs vágás",
        widthWarning
      )}
      ${resultRow("Kiosztási darabok", `${lengthLayout.pieces} oszlop × ${widthLayout.pieces} sor`)}
    </div>
    <div class="note">
      A számolás a fugát a lapok között számolja. Ha a széleken is fix fugát vagy dilatációt hagysz,
      azt a „szélső hézag” mezőben add meg.
    </div>
  `;

  const areaM2 = (areaLengthMm / 1000) * (areaWidthMm / 1000);
  const tileAreaM2 = (tileLongMm / 1000) * (tileShortMm / 1000);
  const baseTiles = Math.ceil(areaM2 / tileAreaM2);
  const waste = value("waste") / 100;
  const buyTiles = Math.ceil(baseTiles * (1 + waste));
  const adhesiveKg = areaM2 * value("adhesiveRate");
  const bags = Math.ceil(adhesiveKg / value("bagSize"));
  const groutKgM2 =
    ((tileLongMm + tileShortMm) / (tileLongMm * tileShortMm)) *
    joint *
    value("tileThickness") *
    value("groutDensity");
  const groutTotal = groutKgM2 * areaM2 * 1.1;
  const clips = Math.ceil(baseTiles * value("clipsPerTile") * 1.1);
  const wedges = Math.ceil(Math.min(clips, Math.max(100, clips * 0.25)));

  $("materialResults").innerHTML = `
    <div class="result-list">
      ${resultRow("Felület", `${areaM2.toLocaleString("hu-HU", { maximumFractionDigits: 2 })} m²`)}
      ${resultRow("Lap minimum", `${baseTiles} db`)}
      ${resultRow("Lap ráhagyással", `${buyTiles} db`)}
      ${resultRow("Ragasztó", `${kg(adhesiveKg)} ≈ ${bags} zsák`)}
      ${resultRow("Fugázó becslés", kg(groutTotal))}
      ${resultRow(`${joint} mm-es papucs`, `${clips} db`)}
      ${resultRow("Ék becslés", `${wedges} db, mert újrahasználható`)}
    </div>
    <div class="note">
      A ragasztó és fugázó gyártónként eltér. Ez első próbaszámolás; később beletehetünk konkrét
      márka szerinti fogyást is.
    </div>
  `;

  drawLayout(lengthLayout, widthLayout, tileLengthMm, tileWidthMm, joint);
}

fields.forEach((id) => {
  $(id).addEventListener("input", calculate);
  $(id).addEventListener("change", calculate);
});

calculate();
