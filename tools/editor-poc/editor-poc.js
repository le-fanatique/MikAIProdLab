// ---------------------------------------------------------------------------
// MikAI Editorial Export POC — reads a mikai-editorial-export-v1 JSON
// document, renders it as a proportional timeline, and allows local-only
// timing edits (startSeconds/durationSeconds) that can be exported as a
// mikai-editorial-timing-patch-v1 JSON patch.
//
// No framework, no external library, no build step. No writes anywhere,
// no round-trip back to MikAI — edits only ever mutate an in-memory copy
// of the loaded document; "export patch" downloads a local file, it does
// not call any MikAI route.
// ---------------------------------------------------------------------------

const EXPECTED_SCHEMA_VERSION = "mikai-editorial-export-v1";
const PATCH_SCHEMA_VERSION = "mikai-editorial-timing-patch-v1";

/** Gaps under this duration are treated as touching, not a real empty space — mirrors editorialDocument.ts. */
const EMPTY_SPACE_EPSILON_SECONDS = 0.05;
/** Two intervals separated by less than this are treated as touching, not overlapping — mirrors editorialTimeline.ts. */
const OVERLAP_EPSILON_SECONDS = 0.05;

const fileInput = document.getElementById("file-input");
const loadSampleBtn = document.getElementById("load-sample-btn");
const exportPatchBtn = document.getElementById("export-patch-btn");
const resetChangesBtn = document.getElementById("reset-changes-btn");
const loadStatus = document.getElementById("load-status");

const metaPanel = document.getElementById("meta-panel");
const metaSchema = document.getElementById("meta-schema");
const metaProject = document.getElementById("meta-project");
const metaSequence = document.getElementById("meta-sequence");
const metaDuration = document.getElementById("meta-duration");
const metaExportedAt = document.getElementById("meta-exported-at");

const timelinePanel = document.getElementById("timeline-panel");
const timelineTracks = document.getElementById("timeline-tracks");

const detailPanel = document.getElementById("detail-panel");
const detailContent = document.getElementById("detail-content");
const editForm = document.getElementById("edit-form");
const editStartInput = document.getElementById("edit-start-input");
const editDurationInput = document.getElementById("edit-duration-input");
const editApplyBtn = document.getElementById("edit-apply-btn");
const editError = document.getElementById("edit-error");

const patchPanel = document.getElementById("patch-panel");
const patchSummary = document.getElementById("patch-summary");
const patchPreview = document.getElementById("patch-preview");

/** Pristine copy of the last loaded document — never mutated, restored by Reset Changes. */
let originalDocument = null;
/** Working copy — the only object timing edits ever touch. */
let currentDocument = null;
/** Item ids (sequence_editorial_items id) with local, unexported timing edits. */
let modifiedItemIds = new Set();

let selectedEl = null;
let selectedEntry = null; // { kind: "shot", trackIndex, item } | { kind: "empty-space", trackIndex, ... }
let elByKey = new Map();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(message, isError) {
  loadStatus.textContent = message;
  loadStatus.classList.toggle("error", Boolean(isError));
}

function formatSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}s`;
}

/** Loose structural validation — enough to catch an obviously wrong file, not a full schema validator. */
function validateExport(doc) {
  if (!doc || typeof doc !== "object") {
    throw new Error("File does not contain a JSON object.");
  }
  if (doc.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    throw new Error(
      `Unexpected schemaVersion "${doc.schemaVersion}" — expected "${EXPECTED_SCHEMA_VERSION}".`
    );
  }
  if (!doc.project || !doc.sequence || !Array.isArray(doc.tracks)) {
    throw new Error("Missing project/sequence/tracks fields.");
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Local derivation — mirrors src/lib/editorial/editorialDocument.ts's
// deriveEmptySpaces so the POC's timeline stays consistent with MikAI's own
// definition of empty space after a local edit, without importing any code
// (this file has no build step / no access to src/).
// ---------------------------------------------------------------------------

function deriveEmptySpacesLocal(doc) {
  const spaces = [];
  for (const track of doc.tracks) {
    const shotItems = [...track.items].sort((a, b) =>
      a.startSeconds !== b.startSeconds ? a.startSeconds - b.startSeconds : a.id - b.id
    );
    let cursor = 0;
    let previousId = null;
    for (const shot of shotItems) {
      if (shot.startSeconds > cursor + EMPTY_SPACE_EPSILON_SECONDS) {
        spaces.push({
          trackIndex: track.trackIndex,
          startSeconds: cursor,
          durationSeconds: shot.startSeconds - cursor,
          previousItemId: previousId,
          nextItemId: shot.id,
        });
      }
      cursor = Math.max(cursor, shot.startSeconds + shot.durationSeconds);
      previousId = shot.id;
    }
  }
  return spaces;
}

/** Recomputes emptySpaces and sequence.durationSeconds in place after a timing edit. */
function recomputeDerived(doc) {
  doc.emptySpaces = deriveEmptySpacesLocal(doc);
  let maxEnd = 0;
  for (const track of doc.tracks) {
    for (const item of track.items) {
      maxEnd = Math.max(maxEnd, item.startSeconds + item.durationSeconds);
    }
  }
  doc.sequence.durationSeconds = maxEnd;
}

/** Returns an error message (English) if the edit is invalid, or null if valid. */
function validateTimingEdit(doc, trackIndex, itemId, startSeconds, durationSeconds) {
  if (!Number.isFinite(startSeconds) || startSeconds < 0) {
    return "Start seconds must be a number greater than or equal to 0.";
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "Duration seconds must be a number greater than 0.";
  }
  const track = doc.tracks.find((t) => t.trackIndex === trackIndex);
  if (!track) return null;

  const end = startSeconds + durationSeconds;
  for (const other of track.items) {
    if (other.id === itemId) continue;
    const otherEnd = other.startSeconds + other.durationSeconds;
    const overlaps =
      startSeconds < otherEnd - OVERLAP_EPSILON_SECONDS &&
      end > other.startSeconds + OVERLAP_EPSILON_SECONDS;
    if (overlaps) {
      return `Overlaps shot "${other.shotCode ?? other.title ?? `#${other.id}`}" (${formatSeconds(
        other.startSeconds
      )} – ${formatSeconds(otherEnd)}).`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Timing patch (mikai-editorial-timing-patch-v1)
// ---------------------------------------------------------------------------

function buildPatch(doc, modifiedIds) {
  const items = [];
  for (const track of doc.tracks) {
    for (const item of track.items) {
      if (modifiedIds.has(item.id)) {
        items.push({
          id: item.id,
          shotId: item.shotId,
          startSeconds: item.startSeconds,
          durationSeconds: item.durationSeconds,
        });
      }
    }
  }
  return {
    schemaVersion: PATCH_SCHEMA_VERSION,
    sourceSchemaVersion: doc.schemaVersion,
    projectId: doc.project.id,
    sequenceId: doc.sequence.id,
    createdAt: new Date().toISOString(),
    items,
  };
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderPatchPreview() {
  if (!currentDocument) {
    patchPanel.hidden = true;
    return;
  }
  const patch = buildPatch(currentDocument, modifiedItemIds);
  patchPanel.hidden = false;
  patchSummary.textContent = `${patch.items.length} modified item(s) — regenerated live as you edit.`;
  patchPreview.textContent = JSON.stringify(patch, null, 2);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderMeta(doc) {
  metaSchema.textContent = doc.schemaVersion;
  metaProject.textContent = `#${doc.project.id} — ${doc.project.name}`;
  metaSequence.textContent = `#${doc.sequence.id} — ${doc.sequence.title}`;
  metaDuration.textContent = formatSeconds(doc.sequence.durationSeconds);
  metaExportedAt.textContent = doc.exportedAt ?? "—";
  metaPanel.hidden = false;
}

function renderDetail(entry) {
  detailPanel.hidden = false;

  if (entry.kind === "empty-space") {
    editForm.hidden = true;
    detailContent.innerHTML = `
      <dl>
        <dt>Type</dt><dd>Empty space</dd>
        <dt>Track</dt><dd>${entry.trackIndex}</dd>
        <dt>Start</dt><dd>${formatSeconds(entry.startSeconds)}</dd>
        <dt>Duration</dt><dd>${formatSeconds(entry.durationSeconds)}</dd>
        <dt>Previous item id</dt><dd>${entry.previousItemId ?? "—"}</dd>
        <dt>Next item id</dt><dd>${entry.nextItemId ?? "—"}</dd>
      </dl>
    `;
    return;
  }

  const item = entry.item;
  const modified = modifiedItemIds.has(item.id);
  detailContent.innerHTML = `
    <dl>
      <dt>Type</dt><dd>Shot${modified ? " (modified locally)" : ""}</dd>
      <dt>Item id</dt><dd>${item.id}</dd>
      <dt>Shot id</dt><dd>${item.shotId}</dd>
      <dt>Shot code</dt><dd>${item.shotCode ?? "—"}</dd>
      <dt>Title</dt><dd>${item.title ?? "—"}</dd>
      <dt>Status</dt><dd class="status-${item.status}">${item.status}</dd>
      <dt>Track</dt><dd>${entry.trackIndex}</dd>
      <dt>Start</dt><dd>${formatSeconds(item.startSeconds)}</dd>
      <dt>Duration</dt><dd>${formatSeconds(item.durationSeconds)}</dd>
      <dt>Trim in</dt><dd>${item.trimInSeconds != null ? formatSeconds(item.trimInSeconds) : "—"}</dd>
      <dt>Trim out</dt><dd>${item.trimOutSeconds != null ? formatSeconds(item.trimOutSeconds) : "—"}</dd>
      <dt>Approved video path</dt><dd>${item.approvedVideoPath ?? "—"}</dd>
      <dt>Media URL</dt><dd>${item.mediaUrl ?? "—"}</dd>
      <dt>Prompt</dt><dd>${item.prompt ?? "—"}</dd>
      <dt>Description</dt><dd>${item.description ?? "—"}</dd>
    </dl>
  `;

  editStartInput.value = item.startSeconds;
  editDurationInput.value = item.durationSeconds;
  editError.textContent = "";
  editForm.hidden = false;
}

function selectEntry(el, entry) {
  if (selectedEl) selectedEl.classList.remove("selected");
  selectedEl = el;
  selectedEntry = entry;
  el.classList.add("selected");
  renderDetail(entry);
}

function keyForShot(id) {
  return `shot-${id}`;
}

function keyForSpace(trackIndex, startSeconds) {
  return `space-${trackIndex}-${startSeconds.toFixed(2)}`;
}

function makeTimelineItemEl({ startSeconds, durationSeconds, totalSeconds, kind, statusClass, code, title, modified }) {
  const el = document.createElement("div");
  el.className = `timeline-item ${kind === "empty-space" ? "empty-space" : `status-${statusClass}`}`;
  if (modified) el.classList.add("modified");
  const leftPct = (startSeconds / totalSeconds) * 100;
  const widthPct = Math.max((durationSeconds / totalSeconds) * 100, 0.3);
  el.style.left = `${leftPct}%`;
  el.style.width = `${widthPct}%`;

  if (kind !== "empty-space") {
    const codeEl = document.createElement("span");
    codeEl.className = "item-code";
    codeEl.textContent = code ?? "Shot";
    const titleEl = document.createElement("span");
    titleEl.className = "item-title";
    titleEl.textContent = title ?? "";
    el.appendChild(codeEl);
    el.appendChild(titleEl);
    el.title = `${code ?? "Shot"} · ${formatSeconds(durationSeconds)}${modified ? " · modified" : ""}`;
  } else {
    el.title = `Empty space · ${formatSeconds(durationSeconds)}`;
  }

  return el;
}

function renderTimeline(doc) {
  timelineTracks.innerHTML = "";
  elByKey = new Map();
  const totalSeconds = Math.max(doc.sequence.durationSeconds, 1);

  for (const track of doc.tracks) {
    const trackEl = document.createElement("div");
    trackEl.className = "timeline-track";

    const label = document.createElement("span");
    label.className = "timeline-track-label";
    label.textContent = `Track ${track.trackIndex}`;
    trackEl.appendChild(label);

    for (const item of track.items) {
      const el = makeTimelineItemEl({
        startSeconds: item.startSeconds,
        durationSeconds: item.durationSeconds,
        totalSeconds,
        kind: "shot",
        statusClass: item.status,
        code: item.shotCode,
        title: item.title,
        modified: modifiedItemIds.has(item.id),
      });
      el.addEventListener("click", () =>
        selectEntry(el, { kind: "shot", trackIndex: track.trackIndex, item })
      );
      elByKey.set(keyForShot(item.id), el);
      trackEl.appendChild(el);
    }

    for (const space of doc.emptySpaces.filter((s) => s.trackIndex === track.trackIndex)) {
      const el = makeTimelineItemEl({
        startSeconds: space.startSeconds,
        durationSeconds: space.durationSeconds,
        totalSeconds,
        kind: "empty-space",
      });
      el.addEventListener("click", () =>
        selectEntry(el, { kind: "empty-space", trackIndex: track.trackIndex, ...space })
      );
      elByKey.set(keyForSpace(track.trackIndex, space.startSeconds), el);
      trackEl.appendChild(el);
    }

    timelineTracks.appendChild(trackEl);
  }

  timelinePanel.hidden = false;

  // Re-apply selection to the freshly rendered element for the same item,
  // so editing a shot doesn't lose its own selection/edit form.
  if (selectedEntry && selectedEntry.kind === "shot") {
    const el = elByKey.get(keyForShot(selectedEntry.item.id));
    if (el) {
      selectedEl = el;
      el.classList.add("selected");
    }
  }
}

function resetDetailPanel() {
  selectedEl = null;
  selectedEntry = null;
  detailPanel.hidden = true;
  editForm.hidden = true;
  detailContent.innerHTML =
    '<p class="empty-hint">Click a shot or empty space on the timeline to see its details.</p>';
}

// ---------------------------------------------------------------------------
// Load / reset
// ---------------------------------------------------------------------------

function loadDocument(doc, sourceLabel) {
  try {
    validateExport(doc);
  } catch (err) {
    setStatus(`Invalid export: ${err.message}`, true);
    return;
  }
  originalDocument = deepClone(doc);
  currentDocument = deepClone(doc);
  modifiedItemIds = new Set();
  resetDetailPanel();
  renderMeta(currentDocument);
  renderTimeline(currentDocument);
  renderPatchPreview();
  exportPatchBtn.disabled = false;
  resetChangesBtn.disabled = false;
  setStatus(
    `Loaded ${sourceLabel} — ${currentDocument.tracks.reduce((n, t) => n + t.items.length, 0)} shot(s), ${currentDocument.emptySpaces.length} empty space(s).`,
    false
  );
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const doc = JSON.parse(String(reader.result));
      loadDocument(doc, file.name);
    } catch (err) {
      setStatus(`Could not parse JSON: ${err.message}`, true);
    }
  };
  reader.onerror = () => setStatus("Could not read file.", true);
  reader.readAsText(file);
});

loadSampleBtn.addEventListener("click", () => {
  fetch("sample-editorial-export.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((doc) => loadDocument(doc, "sample-editorial-export.json"))
    .catch((err) => setStatus(`Could not load sample: ${err.message}`, true));
});

resetChangesBtn.addEventListener("click", () => {
  if (!originalDocument) return;
  currentDocument = deepClone(originalDocument);
  modifiedItemIds = new Set();
  resetDetailPanel();
  renderMeta(currentDocument);
  renderTimeline(currentDocument);
  renderPatchPreview();
  setStatus("Local changes reset to the loaded document.", false);
});

editApplyBtn.addEventListener("click", () => {
  if (!currentDocument || !selectedEntry || selectedEntry.kind !== "shot") return;

  const startSeconds = parseFloat(editStartInput.value);
  const durationSeconds = parseFloat(editDurationInput.value);
  const { trackIndex } = selectedEntry;
  const itemId = selectedEntry.item.id;

  const error = validateTimingEdit(currentDocument, trackIndex, itemId, startSeconds, durationSeconds);
  if (error) {
    editError.textContent = error;
    return;
  }
  editError.textContent = "";

  const track = currentDocument.tracks.find((t) => t.trackIndex === trackIndex);
  const item = track.items.find((i) => i.id === itemId);
  item.startSeconds = startSeconds;
  item.durationSeconds = durationSeconds;
  modifiedItemIds.add(itemId);

  recomputeDerived(currentDocument);
  selectedEntry = { kind: "shot", trackIndex, item };

  renderMeta(currentDocument);
  renderTimeline(currentDocument);
  renderDetail(selectedEntry);
  renderPatchPreview();
  setStatus(`Applied local edit to item #${itemId}.`, false);
});

exportPatchBtn.addEventListener("click", () => {
  if (!currentDocument) return;
  const patch = buildPatch(currentDocument, modifiedItemIds);
  if (patch.items.length === 0) {
    setStatus("No local changes to export — edit a shot's timing first.", true);
    return;
  }
  const filename = `mikai-sequence-${currentDocument.sequence.id}-timing-patch-v1.json`;
  downloadJson(patch, filename);
  setStatus(`Exported ${filename} with ${patch.items.length} item(s).`, false);
});
