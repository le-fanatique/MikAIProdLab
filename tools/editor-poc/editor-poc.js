// ---------------------------------------------------------------------------
// MikAI Editorial Export POC — reads a mikai-editorial-export-v1 JSON
// document and renders it as a read-only, proportional timeline.
//
// No framework, no external library, no build step. No writes anywhere,
// no round-trip back to MikAI — this only ever reads a local File or the
// bundled sample-editorial-export.json.
// ---------------------------------------------------------------------------

const EXPECTED_SCHEMA_VERSION = "mikai-editorial-export-v1";

const fileInput = document.getElementById("file-input");
const loadSampleBtn = document.getElementById("load-sample-btn");
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

let currentDocument = null;
let selectedEl = null;

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
  detailContent.innerHTML = `
    <dl>
      <dt>Type</dt><dd>Shot</dd>
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
}

function selectTimelineEl(el, entry) {
  if (selectedEl) selectedEl.classList.remove("selected");
  selectedEl = el;
  el.classList.add("selected");
  renderDetail(entry);
}

function makeTimelineItemEl({ startSeconds, durationSeconds, totalSeconds, kind, statusClass, code, title }) {
  const el = document.createElement("div");
  el.className = `timeline-item ${kind === "empty-space" ? "empty-space" : `status-${statusClass}`}`;
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
    el.title = `${code ?? "Shot"} · ${formatSeconds(durationSeconds)}`;
  } else {
    el.title = `Empty space · ${formatSeconds(durationSeconds)}`;
  }

  return el;
}

function renderTimeline(doc) {
  timelineTracks.innerHTML = "";
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
      });
      el.addEventListener("click", () =>
        selectTimelineEl(el, { kind: "shot", trackIndex: track.trackIndex, item })
      );
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
        selectTimelineEl(el, { kind: "empty-space", trackIndex: track.trackIndex, ...space })
      );
      trackEl.appendChild(el);
    }

    timelineTracks.appendChild(trackEl);
  }

  timelinePanel.hidden = false;
}

function loadDocument(doc, sourceLabel) {
  try {
    validateExport(doc);
  } catch (err) {
    setStatus(`Invalid export: ${err.message}`, true);
    return;
  }
  currentDocument = doc;
  selectedEl = null;
  detailPanel.hidden = true;
  detailContent.innerHTML = '<p class="empty-hint">Click a shot or empty space on the timeline to see its details.</p>';
  renderMeta(doc);
  renderTimeline(doc);
  setStatus(`Loaded ${sourceLabel} — ${doc.tracks.reduce((n, t) => n + t.items.length, 0)} shot(s), ${doc.emptySpaces.length} empty space(s).`, false);
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
