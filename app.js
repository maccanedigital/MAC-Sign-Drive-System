/* CaneNext : Online Signature System - Google Drive API production version */
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let tokenClient;
let accessToken = null;
let gapiReady = false;
let gisReady = false;
let pdfFiles = [];
let originalFiles = [];
let signedFiles = [];
let signedFolderId = null;
let currentFile = null;
let currentPdfBytes = null;
let autoLoginAttempted = false;
let pdfDoc = null;
let pageNum = 1;
let pageCount = 0;
let signaturePad;
let activeDocStatus = "all";
let currentSaveSource = null;
let currentViewMode = "view";

const $ = (id) => document.getElementById(id);
const els = {
  loginBtn: $("loginBtn"), logoutBtn: $("logoutBtn"), userStatus: $("userStatus"),
  loadFilesBtn: $("loadFilesBtn"), refreshFilesBtn: $("refreshFilesBtn"), searchInput: $("searchInput"), clearSearchBtn: $("clearSearchBtn"), statusFilter: $("statusFilter"), zoneFilter: $("zoneFilter"), fileListInfo: $("fileListInfo"), tabAllCount: $("tabAllCount"), tabSignedCount: $("tabSignedCount"), tabUnsignedCount: $("tabUnsignedCount"),
  fileList: $("fileList"), currentFileName: $("currentFileName"), docStatus: $("docStatus"),
  pdfCanvas: $("pdfCanvas"), signatureCanvas: $("signatureCanvas"), prevPageBtn: $("prevPageBtn"),
  nextPageBtn: $("nextPageBtn"), pageInfo: $("pageInfo"), signPageInput: $("signPageInput"),
  signaturePosition: $("signaturePosition"), clearSigBtn: $("clearSigBtn"), saveSignedBtn: $("saveSignedBtn"),
  totalCount: $("totalCount"), signedCount: $("signedCount"), unsignedCount: $("unsignedCount"), completionPercent: $("completionPercent"), completionBar: $("completionBar"), summaryHint: $("summaryHint"), unsignedList: $("unsignedList"), zoneSummaryBody: $("zoneSummaryBody"), toast: $("toast")
};

window.addEventListener("load", () => {
  initSignaturePad();
  bindEvents();
  loadGapi();
  waitForGIS();
  setButtons(false);
});

function bindEvents(){
  els.loginBtn.addEventListener("click", login);
  els.logoutBtn.addEventListener("click", logout);
  els.loadFilesBtn.addEventListener("click", loadFiles);
  if(els.refreshFilesBtn) els.refreshFilesBtn.addEventListener("click", refreshFiles);
  els.searchInput.addEventListener("input", renderFiles);
  els.clearSearchBtn.addEventListener("click", clearSearch);
  if(els.statusFilter) els.statusFilter.addEventListener("change", () => { activeDocStatus = els.statusFilter.value; updateDocFilterTabs(); renderFiles(); });
  if(els.zoneFilter) els.zoneFilter.addEventListener("change", renderFiles);
  document.querySelectorAll(".doc-filter").forEach(btn => btn.addEventListener("click", () => {
    activeDocStatus = btn.dataset.status;
    if(els.statusFilter) els.statusFilter.value = activeDocStatus;
    updateDocFilterTabs();
    renderFiles();
  }));
  els.prevPageBtn.addEventListener("click", () => changePage(-1));
  els.nextPageBtn.addEventListener("click", () => changePage(1));
  els.clearSigBtn.addEventListener("click", () => signaturePad.clear());
  els.saveSignedBtn.addEventListener("click", saveSignedPdf);
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => switchPage(btn.dataset.page)));
  window.addEventListener("resize", resizeSignatureCanvas);
}

function switchPage(page){
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.page === page));
  $("documentsPage").classList.toggle("active", page === "documents");
  $("summaryPage").classList.toggle("active", page === "summary");
  updateSummary();
}

function toast(msg){
  els.toast.textContent = msg; els.toast.classList.remove("hidden");
  setTimeout(()=>els.toast.classList.add("hidden"), 3200);
}

function initSignaturePad(){
  signaturePad = new SignaturePad(els.signatureCanvas, { minWidth: 1.2, maxWidth: 3.2 });
  resizeSignatureCanvas();
}
function resizeSignatureCanvas(){
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const canvas = els.signatureCanvas;
  const data = signaturePad && !signaturePad.isEmpty() ? signaturePad.toData() : null;
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext("2d").scale(ratio, ratio);
  if(signaturePad){ signaturePad.clear(); if(data) signaturePad.fromData(data); }
}

function loadGapi(){
  gapi.load("client", async () => {
    await gapi.client.init({ discoveryDocs: [CONFIG.DISCOVERY_DOC] });
    gapiReady = true;
    setButtons(isLoggedIn());
    maybeAutoLogin();
  });
}
function waitForGIS(){
  const timer = setInterval(() => {
    if(window.google && google.accounts && google.accounts.oauth2){
      clearInterval(timer);
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: (tokenResponse) => {
          if(tokenResponse && tokenResponse.access_token){
            accessToken = tokenResponse.access_token;
            localStorage.setItem("canenext_login_active", "1");
            gapi.client.setToken({ access_token: accessToken });
            els.userStatus.textContent = "เข้าสู่ระบบแล้ว";
            els.loginBtn.classList.add("hidden");
            els.logoutBtn.classList.remove("hidden");
            setButtons(true);
            toast(tokenResponse.prompt === "none" ? "กลับเข้าสู่ระบบอัตโนมัติ" : "เข้าสู่ระบบสำเร็จ");
            loadFiles();
          }
        }
      });
      gisReady = true;
      setButtons(isLoggedIn());
      maybeAutoLogin();
    }
  }, 200);
}
function isLoggedIn(){
  return !!accessToken;
}

function setButtons(loggedIn){
  const ready = gapiReady && gisReady;
  els.loginBtn.disabled = !ready || loggedIn;
  els.loadFilesBtn.disabled = !loggedIn;
  if(els.refreshFilesBtn) els.refreshFilesBtn.disabled = !loggedIn;
  els.saveSignedBtn.disabled = !loggedIn || !currentFile || currentViewMode === "view-signed";
}

function maybeAutoLogin(){
  if(autoLoginAttempted || !gapiReady || !gisReady || !tokenClient) return;
  if(localStorage.getItem("canenext_login_active") !== "1") return;
  autoLoginAttempted = true;
  els.userStatus.textContent = "กำลังตรวจสอบการเข้าสู่ระบบ...";
  try{
    // ขอ token ใหม่แบบเงียบหลัง Refresh หน้าเว็บ หาก Google session ยังใช้งานอยู่
    tokenClient.requestAccessToken({ prompt: "" });
  }catch(err){
    console.warn("Auto login failed", err);
    els.userStatus.textContent = "กรุณาเข้าสู่ระบบ";
    localStorage.removeItem("canenext_login_active");
  }
}
function login(){
  if(!tokenClient){ toast("Google API ยังโหลดไม่เสร็จ"); return; }
  tokenClient.requestAccessToken({ prompt: "consent" });
}
function logout(){
  if(accessToken) google.accounts.oauth2.revoke(accessToken);
  localStorage.removeItem("canenext_login_active");
  accessToken = null; gapi.client.setToken(null);
  pdfFiles = []; originalFiles = []; signedFiles = []; signedFolderId = null; currentFile = null; currentPdfBytes = null; pdfDoc = null;
  els.userStatus.textContent = "ออกจากระบบแล้ว";
  els.loginBtn.classList.remove("hidden"); els.logoutBtn.classList.add("hidden");
  setButtons(false); renderFiles(); updateSummary(); clearViewer(); toast("ออกจากระบบแล้ว");
}

async function refreshFiles(){
  if(!accessToken){ toast("กรุณาเข้าสู่ระบบก่อน"); return; }
  toast("กำลังรีเฟรชรายการเอกสาร...");
  await loadFiles();
}

async function loadFiles(){
  if(!accessToken){ toast("กรุณาเข้าสู่ระบบก่อน"); return; }
  els.fileList.textContent = "กำลังดึงไฟล์...";
  try{
    signedFolderId = await ensureSignedFolder();
    originalFiles = await listPdfInFolder(CONFIG.FOLDER_ID);
    signedFiles = await listPdfInFolder(signedFolderId);
    pdfFiles = mapStatus(originalFiles, signedFiles);
    renderFiles(); updateSummary();
    toast(`ดึงไฟล์ PDF สำเร็จ ${getOriginalFiles().length} ไฟล์ | เซ็นแล้ว ${getOriginalFiles().filter(f=>f.hasSignedCopy).length} ไฟล์`);
  }catch(err){
    console.error(err);
    els.fileList.innerHTML = `<div class="empty">ดึงไฟล์ไม่ได้: ${escapeHtml(err?.result?.error?.message || err.message || 'ไม่ทราบสาเหตุ')}</div>`;
    toast("ดึงไฟล์ไม่ได้ กรุณาตรวจ Drive API / สิทธิ์โฟลเดอร์");
  }
}

async function listPdfInFolder(folderId){
  let all = []; let pageToken;
  do{
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink,parents)",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    all = all.concat(res.result.files || []);
    pageToken = res.result.nextPageToken;
  }while(pageToken);
  return all;
}

async function ensureSignedFolder(){
  if(signedFolderId) return signedFolderId;
  const folderName = CONFIG.SIGNED_FOLDER_NAME || "02_Signed_PDF";
  const safeName = folderName.replace(/'/g, "\'");
  const res = await gapi.client.drive.files.list({
    q: `'${CONFIG.FOLDER_ID}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  });
  const found = res.result.files || [];
  if(found.length) return found[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [CONFIG.FOLDER_ID]
    })
  });
  if(!createRes.ok) throw new Error(await createRes.text());
  const folder = await createRes.json();
  return folder.id;
}

function mapStatus(originals, signed){
  const latestSigned = getLatestSignedMap(signed);
  const originalRows = originals
    .filter(f => !isSignedPdfName(f.name))
    .map(f => {
      const base = normalizeOriginalName(f.name);
      const signedInfo = latestSigned.get(base);
      return {
        ...f,
        isSignedFile: false,
        hasSignedCopy: !!signedInfo,
        signedFile: signedInfo ? signedInfo.file : null,
        signedVersion: signedInfo ? signedInfo.version : 0,
        nextSignedVersion: signedInfo ? signedInfo.version + 1 : 1,
        status: signedInfo ? "signed" : "unsigned",
        folderType: "original"
      };
    });
  return originalRows;
}

function getLatestSignedMap(signed){
  const map = new Map();
  signed.forEach(file => {
    const info = parseSignedName(file.name);
    if(!info) return;
    const existing = map.get(info.base);
    if(!existing || info.version > existing.version || (info.version === existing.version && String(file.modifiedTime||"") > String(existing.file.modifiedTime||""))){
      map.set(info.base, { file, version: info.version });
    }
  });
  return map;
}

function parseSignedName(name){
  const raw = String(name || "");
  const match = raw.match(/^(.*)_signed(?:_v(\d+))?\.pdf$/i);
  if(!match) return null;
  return { base: match[1].toLowerCase(), version: match[2] ? parseInt(match[2], 10) : 1 };
}

function isSignedPdfName(name){
  return /_signed(?:_v\d+)?\.pdf$/i.test(String(name || ""));
}
function normalizeOriginalName(name){ return name.replace(/\.pdf$/i, "").toLowerCase(); }
function normalizeSignedName(name){ const info = parseSignedName(name); return info ? info.base : String(name || "").replace(/\.pdf$/i, "").toLowerCase(); }
function getOriginalFiles(){ return pdfFiles.filter(f=>!f.isSignedFile); }
function clearSearch(){
  els.searchInput.value = "";
  if(els.zoneFilter) els.zoneFilter.value = "all";
  activeDocStatus = "all";
  if(els.statusFilter) els.statusFilter.value = "all";
  updateDocFilterTabs();
  renderFiles();
  toast("ล้างการค้นหาแล้ว");
}

function getBaseFilteredOriginals(){
  const q = els.searchInput.value.trim().toLowerCase();
  const zone = els.zoneFilter ? els.zoneFilter.value : "all";
  return getOriginalFiles().filter(f => {
    const matchText = !q || f.name.toLowerCase().includes(q);
    const fileZone = getZoneCode(f.name);
    const matchZone = zone === "all" || fileZone === zone;
    return matchText && matchZone;
  });
}

function filteredFiles(){
  const status = activeDocStatus || "all";
  return getBaseFilteredOriginals().filter(f => status === "all" || f.status === status);
}
function updateDocFilterTabs(){
  document.querySelectorAll(".doc-filter").forEach(btn => btn.classList.toggle("active", btn.dataset.status === activeDocStatus));
}
function updateDocFilterCounts(){
  // จำนวนบนแท็บจะอ้างอิงตามเขตและคำค้นหาที่กำลังกรองอยู่
  // เช่น เลือกเขต 03 จะแสดงจำนวน ทั้งหมด/เซ็นแล้ว/ยังไม่เซ็น เฉพาะเขต 03
  const originals = getBaseFilteredOriginals();
  const signed = originals.filter(f => f.hasSignedCopy).length;
  const unsigned = originals.length - signed;
  if(els.tabAllCount) els.tabAllCount.textContent = originals.length.toLocaleString("th-TH");
  if(els.tabSignedCount) els.tabSignedCount.textContent = signed.toLocaleString("th-TH");
  if(els.tabUnsignedCount) els.tabUnsignedCount.textContent = unsigned.toLocaleString("th-TH");
}
function statusLabel(status){
  if(status === "signed") return "เซ็นแล้ว";
  if(status === "unsigned") return "ยังไม่เซ็น";
  return "ทั้งหมด";
}
function renderFiles(){
  updateDocFilterTabs();
  updateDocFilterCounts();
  const files = filteredFiles();
  const zone = els.zoneFilter ? els.zoneFilter.value : "all";
  const zoneText = zone === "all" ? "ทุกเขต" : `เขต ${zone}`;
  if(els.fileListInfo){
    const baseCount = getBaseFilteredOriginals().length;
    els.fileListInfo.textContent = `แสดง: ${statusLabel(activeDocStatus)} · ${zoneText} · พบ ${files.length.toLocaleString("th-TH")} รายการ จาก ${baseCount.toLocaleString("th-TH")} รายการในเงื่อนไขเขต/คำค้นหา`;
  }
  if(!files.length){ els.fileList.className="file-list empty"; els.fileList.textContent="ไม่พบไฟล์ PDF ตามเงื่อนไขที่เลือก"; return; }
  els.fileList.className="file-list"; els.fileList.innerHTML = "";
  files.forEach(f => {
    const item = document.createElement("div");
    item.className = "file-item" + (currentFile?.id === f.id ? " active" : "");
    const versionText = f.hasSignedCopy ? `<span class="meta-chip"><span class="mini-icon">v</span>Version ${f.signedVersion}</span>` : "";
    const primaryText = f.hasSignedCopy ? "ดู PDF ที่เซ็นแล้ว" : "เซ็นเอกสาร";
    const secondaryBtn = f.hasSignedCopy ? `<button class="file-action edit-signature" type="button">แก้ไขลายเซ็น</button>` : "";
    item.innerHTML = `<div class="file-row"><div class="file-icon pdf">PDF</div><div class="file-body"><div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta"><span class="badge ${f.status}"><span class="mini-icon">${f.status === 'signed' ? '✓' : '⌛'}</span>${f.status === 'signed' ? 'เซ็นแล้ว' : 'ยังไม่เซ็น'}</span>${versionText}<span class="meta-chip"><span class="mini-icon">⌂</span>เขต ${escapeHtml(getZoneCode(f.name))}</span><span class="meta-chip"><span class="mini-icon">◷</span>${formatDate(f.modifiedTime)}</span></div><div class="file-actions"><button class="file-action view-pdf" type="button">${primaryText}</button>${secondaryBtn}</div></div><div class="open-icon">›</div></div>`;
    item.addEventListener("click", () => openFile(f, { mode: f.hasSignedCopy ? "view-signed" : "sign" }));
    item.querySelector(".view-pdf").addEventListener("click", (ev) => { ev.stopPropagation(); openFile(f, { mode: f.hasSignedCopy ? "view-signed" : "sign" }); });
    const editBtn = item.querySelector(".edit-signature");
    if(editBtn) editBtn.addEventListener("click", (ev) => { ev.stopPropagation(); editSignature(f); });
    els.fileList.appendChild(item);
  });
}
function updateSummary(){
  const originals = getOriginalFiles();
  const signed = originals.filter(f=>f.hasSignedCopy).length;
  const unsigned = originals.length - signed;
  const percent = originals.length ? (signed / originals.length) * 100 : 0;
  els.totalCount.textContent = originals.length.toLocaleString("th-TH");
  els.signedCount.textContent = signed.toLocaleString("th-TH");
  els.unsignedCount.textContent = unsigned.toLocaleString("th-TH");
  if(els.completionPercent) els.completionPercent.textContent = `${percent.toFixed(2)}%`;
  if(els.completionBar) els.completionBar.style.width = `${percent.toFixed(2)}%`;
  if(els.summaryHint) els.summaryHint.textContent = originals.length ? `เซ็นแล้ว ${signed.toLocaleString("th-TH")} จาก ${originals.length.toLocaleString("th-TH")} ไฟล์` : "กดดึงไฟล์ PDF เพื่อดูภาพรวมความก้าวหน้า";
  updateDocFilterCounts();
  updateZoneSummary(originals);
  const list = originals.filter(f=>!f.hasSignedCopy);
  if(!list.length){ els.unsignedList.className="file-list empty"; els.unsignedList.textContent="ไม่มีไฟล์คงเหลือ"; return; }
  els.unsignedList.className="file-list compact-list"; els.unsignedList.innerHTML = list.map(f=>`<div class="file-item unsigned-summary-item"><div class="file-row"><div class="file-icon pdf">PDF</div><div class="file-body"><div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta"><span class="badge unsigned"><span class="mini-icon">⌛</span>ยังไม่เซ็น</span><span class="meta-chip"><span class="mini-icon">📍</span>เขต ${escapeHtml(getZoneCode(f.name))}</span><span class="meta-chip"><span class="mini-icon">◷</span>${formatDate(f.modifiedTime)}</span></div></div></div></div>`).join("");
}

function getZoneCode(filename){
  const match = String(filename || "").trim().match(/^(\d{2})/);
  return match ? match[1] : "ไม่ระบุ";
}

function updateZoneSummary(originals){
  if(!els.zoneSummaryBody) return;
  const zoneCardsEl = document.getElementById("zoneOverviewCards");
  const zones = Array.from({length:13}, (_, i) => String(i).padStart(2, "0"));
  const summary = Object.fromEntries(zones.map(z => [z, { total:0, signed:0, unsigned:0 }]));

  originals.forEach(file => {
    const zone = getZoneCode(file.name);
    if(!summary[zone]) summary[zone] = { total:0, signed:0, unsigned:0 };
    summary[zone].total += 1;
    if(file.hasSignedCopy) summary[zone].signed += 1;
    else summary[zone].unsigned += 1;
  });

  if(zoneCardsEl){
    zoneCardsEl.innerHTML = zones.map(zone => {
      const item = summary[zone];
      const percent = item.total ? (item.signed / item.total) * 100 : 0;
      const levelClass = percent >= 90 ? "level-high" : percent >= 70 ? "level-mid" : "level-low";
      return `<button class="zone-mini-card ${levelClass}" type="button" data-zone="${zone}" title="กรองเขต ${zone}">
        <div class="zone-mini-top"><span class="zone-mini-code">เขต ${zone}</span><span class="zone-mini-percent">${percent.toFixed(0)}%</span></div>
        <div class="zone-mini-stats"><span>ทั้งหมด <b>${item.total.toLocaleString("th-TH")}</b></span><span>เซ็นแล้ว <b>${item.signed.toLocaleString("th-TH")}</b></span><span>คงเหลือ <b>${item.unsigned.toLocaleString("th-TH")}</b></span></div>
        <div class="zone-mini-bar"><span style="width:${percent.toFixed(2)}%"></span></div>
      </button>`;
    }).join("");
    zoneCardsEl.querySelectorAll(".zone-mini-card").forEach(btn => btn.addEventListener("click", () => filterByZone(btn.dataset.zone)));
  }

  const rows = zones.map(zone => {
    const item = summary[zone];
    const percent = item.total ? (item.signed / item.total) * 100 : 0;
    return `
      <tr class="zone-row" data-zone="${zone}">
        <td><button class="zone-link" type="button" data-zone="${zone}"><span class="zone-avatar">${zone}</span><span>เขต ${zone}</span></button></td>
        <td><span class="table-count total">${item.total.toLocaleString("th-TH")}</span></td>
        <td><span class="table-count signed">✅ ${item.signed.toLocaleString("th-TH")}</span></td>
        <td><span class="table-count unsigned">⏳ ${item.unsigned.toLocaleString("th-TH")}</span></td>
        <td>
          <div class="progress-cell">
            <div class="progress-bar"><span style="width:${percent.toFixed(2)}%"></span></div>
            <strong>${percent.toFixed(2)}%</strong>
          </div>
        </td>
      </tr>`;
  });

  const extraZones = Object.keys(summary).filter(z => !zones.includes(z)).sort();
  extraZones.forEach(zone => {
    const item = summary[zone];
    const percent = item.total ? (item.signed / item.total) * 100 : 0;
    rows.push(`
      <tr class="zone-row" data-zone="${escapeHtml(zone)}">
        <td><button class="zone-link" type="button" data-zone="${escapeHtml(zone)}"><span class="zone-avatar">?</span><span>${escapeHtml(zone)}</span></button></td>
        <td><span class="table-count total">${item.total.toLocaleString("th-TH")}</span></td>
        <td><span class="table-count signed">✅ ${item.signed.toLocaleString("th-TH")}</span></td>
        <td><span class="table-count unsigned">⏳ ${item.unsigned.toLocaleString("th-TH")}</span></td>
        <td>
          <div class="progress-cell">
            <div class="progress-bar"><span style="width:${percent.toFixed(2)}%"></span></div>
            <strong>${percent.toFixed(2)}%</strong>
          </div>
        </td>
      </tr>`);
  });

  els.zoneSummaryBody.innerHTML = rows.join("");
  els.zoneSummaryBody.querySelectorAll(".zone-link").forEach(btn => {
    btn.addEventListener("click", () => filterByZone(btn.dataset.zone));
  });
}

function filterByZone(zone){
  switchPage("documents");
  els.searchInput.value = "";
  if(els.zoneFilter) els.zoneFilter.value = zone || "all";
  activeDocStatus = "all";
  if(els.statusFilter) els.statusFilter.value = "all";
  updateDocFilterTabs();
  renderFiles();
  toast(`แสดงเอกสารเขต ${zone}`);
}
async function openFile(file, options = {}){
  const mode = options.mode || (file.hasSignedCopy ? "view-signed" : "sign");
  currentFile = file;
  currentViewMode = mode;
  const sourceFile = mode === "view-signed" && file.signedFile ? file.signedFile : file;
  currentSaveSource = {
    originalFile: file,
    sourceFile,
    mode,
    nextVersion: Number(file.nextSignedVersion || 1)
  };
  setButtons(true); renderFiles();
  const suffix = mode === "view-signed" ? " · ฉบับที่มีลายเซ็น" : (file.hasSignedCopy ? ` · แก้ไขลายเซ็นใหม่ v${currentSaveSource.nextVersion}` : " · พร้อมเซ็น");
  els.currentFileName.textContent = file.name + suffix;
  els.docStatus.className = `badge ${file.status}`;
  els.docStatus.textContent = file.status === "signed" ? `เซ็นแล้ว v${file.signedVersion}` : "ยังไม่เซ็น";
  try{
    toast(mode === "view-signed" ? "กำลังเปิด PDF ที่เซ็นแล้ว..." : "กำลังเปิด PDF ต้นฉบับ...");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${sourceFile.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` }});
    if(!res.ok) throw new Error(await res.text());
    currentPdfBytes = await res.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;
    pageCount = pdfDoc.numPages; pageNum = 1; els.signPageInput.max = pageCount; els.signPageInput.value = 1;
    signaturePad.clear();
    await renderPage();
    setButtons(true);
    toast(mode === "view-signed" ? "เปิด PDF ที่เซ็นแล้วสำเร็จ" : "เปิด PDF ต้นฉบับสำเร็จ");
  }catch(err){ console.error(err); toast("เปิด PDF ไม่ได้"); }
}

function editSignature(file){
  if(!file || !file.hasSignedCopy){ return; }
  const ok = confirm(`ต้องการแก้ไขลายเซ็นของไฟล์ ${file.name} ใช่หรือไม่?\n\nระบบจะเปิดไฟล์ต้นฉบับให้เซ็นใหม่ และบันทึกเป็นเวอร์ชันใหม่โดยไม่ทับไฟล์เดิม`);
  if(!ok) return;
  openFile(file, { mode: "edit-signature" });
}
async function renderPage(){
  if(!pdfDoc) return;
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.35 });
  const canvas = els.pdfCanvas; const ctx = canvas.getContext("2d");
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  els.pageInfo.textContent = `หน้า ${pageNum} / ${pageCount}`;
  els.prevPageBtn.disabled = pageNum <= 1; els.nextPageBtn.disabled = pageNum >= pageCount;
}
function changePage(delta){
  const next = pageNum + delta;
  if(next < 1 || next > pageCount) return;
  pageNum = next; renderPage();
}
function clearViewer(){
  els.currentFileName.textContent = "ยังไม่ได้เลือกไฟล์"; els.docStatus.className="badge muted"; els.docStatus.textContent="-";
  els.pageInfo.textContent="หน้า - / -"; els.pdfCanvas.getContext("2d").clearRect(0,0,els.pdfCanvas.width,els.pdfCanvas.height);
}
async function saveSignedPdf(){
  if(!currentFile || !currentPdfBytes){ toast("กรุณาเลือก PDF ก่อน"); return; }
  if(currentViewMode === "view-signed"){ toast("กำลังดู PDF ที่เซ็นแล้ว หากต้องการแก้ไขให้กดปุ่มแก้ไขลายเซ็น"); return; }
  if(signaturePad.isEmpty()){ toast("กรุณาเซ็นชื่อก่อนบันทึก"); return; }
  try{
    els.saveSignedBtn.disabled = true; toast("กำลังฝังลายเซ็นลง PDF...");
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.load(currentPdfBytes.slice(0));
    const png = await doc.embedPng(signaturePad.toDataURL("image/png"));
    const pages = doc.getPages();
    // ฝังลายเซ็นที่หน้าแรกเสมอ และจัดชิดมุมขวาบนสุดของกระดาษ
    // หมายเหตุ: ระบบพิกัดของ PDF เริ่มจากมุมซ้ายล่าง ดังนั้น y = height - sigH คือขอบบนสุด
    const page = pages[0];
    const { width, height } = page.getSize();
    const sigW = 150;
    const sigH = 55;
    const edgeOffset = 0;
    const x = Math.max(0, width - sigW - edgeOffset);
    const y = Math.max(0, height - sigH - edgeOffset);
    page.drawImage(png, { x, y, width: sigW, height: sigH });
    const signedBytes = await doc.save();
    if(!signedFolderId) signedFolderId = await ensureSignedFolder();
    const saveInfo = currentSaveSource || { originalFile: currentFile, nextVersion: 1 };
    const originalName = (saveInfo.originalFile?.name || currentFile.name).replace(/\.pdf$/i, "");
    const version = Number(saveInfo.nextVersion || 1);
    const outName = `${originalName}_signed_v${version}.pdf`;
    await uploadToDrive(outName, signedBytes);
    signaturePad.clear(); toast(`บันทึก PDF ที่เซ็นแล้วสำเร็จ เป็นเวอร์ชัน v${version}`);
    await loadFiles();
  }catch(err){ console.error(err); toast("บันทึก PDF ไม่สำเร็จ"); }
  finally{ els.saveSignedBtn.disabled = false; }
}
async function uploadToDrive(name, bytes){
  const boundary = "canenext_boundary_" + Date.now();
  const metadata = { name, mimeType: "application/pdf", parents: [signedFolderId || CONFIG.FOLDER_ID] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    new Blob([bytes], { type: "application/pdf" }),
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
function formatDate(iso){ return iso ? new Date(iso).toLocaleString("th-TH", { dateStyle:"short", timeStyle:"short" }) : ""; }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
