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
let pdfDoc = null;
let pageNum = 1;
let pageCount = 0;
let signaturePad;

const $ = (id) => document.getElementById(id);
const els = {
  loginBtn: $("loginBtn"), logoutBtn: $("logoutBtn"), userStatus: $("userStatus"),
  loadFilesBtn: $("loadFilesBtn"), searchInput: $("searchInput"), clearSearchBtn: $("clearSearchBtn"), statusFilter: $("statusFilter"),
  fileList: $("fileList"), currentFileName: $("currentFileName"), docStatus: $("docStatus"),
  pdfCanvas: $("pdfCanvas"), signatureCanvas: $("signatureCanvas"), prevPageBtn: $("prevPageBtn"),
  nextPageBtn: $("nextPageBtn"), pageInfo: $("pageInfo"), signPageInput: $("signPageInput"),
  signaturePosition: $("signaturePosition"), clearSigBtn: $("clearSigBtn"), saveSignedBtn: $("saveSignedBtn"),
  totalCount: $("totalCount"), signedCount: $("signedCount"), unsignedCount: $("unsignedCount"), unsignedList: $("unsignedList"), toast: $("toast")
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
  els.searchInput.addEventListener("input", renderFiles);
  els.clearSearchBtn.addEventListener("click", clearSearch);
  els.statusFilter.addEventListener("change", renderFiles);
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
    setButtons(false);
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
            gapi.client.setToken({ access_token: accessToken });
            els.userStatus.textContent = "เข้าสู่ระบบแล้ว";
            els.loginBtn.classList.add("hidden");
            els.logoutBtn.classList.remove("hidden");
            setButtons(true);
            toast("เข้าสู่ระบบสำเร็จ");
            loadFiles();
          }
        }
      });
      gisReady = true;
      setButtons(false);
    }
  }, 200);
}
function setButtons(isLoggedIn){
  els.loginBtn.disabled = !(gapiReady && gisReady) || isLoggedIn;
  els.loadFilesBtn.disabled = !isLoggedIn;
  els.saveSignedBtn.disabled = !isLoggedIn || !currentFile;
}
function login(){
  if(!tokenClient){ toast("Google API ยังโหลดไม่เสร็จ"); return; }
  tokenClient.requestAccessToken({ prompt: "consent" });
}
function logout(){
  if(accessToken) google.accounts.oauth2.revoke(accessToken);
  accessToken = null; gapi.client.setToken(null);
  pdfFiles = []; originalFiles = []; signedFiles = []; signedFolderId = null; currentFile = null; currentPdfBytes = null; pdfDoc = null;
  els.userStatus.textContent = "ออกจากระบบแล้ว";
  els.loginBtn.classList.remove("hidden"); els.logoutBtn.classList.add("hidden");
  setButtons(false); renderFiles(); updateSummary(); clearViewer(); toast("ออกจากระบบแล้ว");
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
    toast(`ดึงไฟล์ PDF สำเร็จ ${originalFiles.length} ไฟล์ | เซ็นแล้ว ${signedFiles.length} ไฟล์`);
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
  const signedBase = new Set(signed.map(f=>normalizeSignedName(f.name)));
  const signedRows = signed.map(f => ({...f, isSignedFile: true, hasSignedCopy: true, status: "signed", folderType: "signed"}));
  const originalRows = originals
    .filter(f => !/_signed\.pdf$/i.test(f.name))
    .map(f => ({
      ...f,
      isSignedFile: false,
      hasSignedCopy: signedBase.has(normalizeOriginalName(f.name)),
      status: signedBase.has(normalizeOriginalName(f.name)) ? "signed" : "unsigned",
      folderType: "original"
    }));
  return [...originalRows, ...signedRows];
}
function normalizeOriginalName(name){ return name.replace(/\.pdf$/i, "").toLowerCase(); }
function normalizeSignedName(name){ return name.replace(/_signed\.pdf$/i, "").replace(/\.pdf$/i, "").toLowerCase(); }
function getOriginalFiles(){ return pdfFiles.filter(f=>!f.isSignedFile); }
function clearSearch(){
  els.searchInput.value = "";
  els.statusFilter.value = "all";
  renderFiles();
  toast("ล้างการค้นหาแล้ว");
}

function filteredFiles(){
  const q = els.searchInput.value.trim().toLowerCase();
  const status = els.statusFilter.value;
  return pdfFiles.filter(f => (!q || f.name.toLowerCase().includes(q)) && (status === "all" || f.status === status));
}
function renderFiles(){
  const files = filteredFiles();
  if(!files.length){ els.fileList.className="file-list empty"; els.fileList.textContent="ไม่พบไฟล์ PDF"; return; }
  els.fileList.className="file-list"; els.fileList.innerHTML = "";
  files.forEach(f => {
    const item = document.createElement("div");
    item.className = "file-item" + (currentFile?.id === f.id ? " active" : "");
    item.innerHTML = `<div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta"><span class="badge ${f.status}">${f.status === 'signed' ? 'เซ็นแล้ว' : 'ยังไม่เซ็น'}</span><span>${formatDate(f.modifiedTime)}</span></div>`;
    item.addEventListener("click", () => openFile(f));
    els.fileList.appendChild(item);
  });
}
function updateSummary(){
  const originals = getOriginalFiles();
  const signed = originals.filter(f=>f.hasSignedCopy).length;
  const unsigned = originals.length - signed;
  els.totalCount.textContent = originals.length;
  els.signedCount.textContent = signed;
  els.unsignedCount.textContent = unsigned;
  const list = originals.filter(f=>!f.hasSignedCopy);
  if(!list.length){ els.unsignedList.className="file-list empty"; els.unsignedList.textContent="ไม่มีไฟล์คงเหลือ"; return; }
  els.unsignedList.className="file-list"; els.unsignedList.innerHTML = list.map(f=>`<div class="file-item"><div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta"><span class="badge unsigned">ยังไม่เซ็น</span></div></div>`).join("");
}
async function openFile(file){
  currentFile = file; setButtons(true); renderFiles();
  els.currentFileName.textContent = file.name;
  els.docStatus.className = `badge ${file.status}`;
  els.docStatus.textContent = file.status === "signed" ? "เซ็นแล้ว" : "ยังไม่เซ็น";
  try{
    toast("กำลังเปิด PDF...");
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${accessToken}` }});
    if(!res.ok) throw new Error(await res.text());
    currentPdfBytes = await res.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: currentPdfBytes.slice(0) }).promise;
    pageCount = pdfDoc.numPages; pageNum = 1; els.signPageInput.max = pageCount; els.signPageInput.value = 1;
    await renderPage(); toast("เปิด PDF สำเร็จ");
  }catch(err){ console.error(err); toast("เปิด PDF ไม่ได้"); }
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
  if(signaturePad.isEmpty()){ toast("กรุณาเซ็นชื่อก่อนบันทึก"); return; }
  try{
    els.saveSignedBtn.disabled = true; toast("กำลังฝังลายเซ็นลง PDF...");
    const { PDFDocument } = PDFLib;
    const doc = await PDFDocument.load(currentPdfBytes.slice(0));
    const png = await doc.embedPng(signaturePad.toDataURL("image/png"));
    const pages = doc.getPages();
    const targetPageIndex = Math.min(Math.max(parseInt(els.signPageInput.value || "1",10),1), pages.length) - 1;
    const page = pages[targetPageIndex];
    const { width, height } = page.getSize();
    const sigW = 170, sigH = 70, margin = 48;
    let x = width - sigW - margin, y = margin;
    if(els.signaturePosition.value === "bottom-left") x = margin;
    if(els.signaturePosition.value === "center"){ x = (width - sigW)/2; y = (height - sigH)/2; }
    page.drawImage(png, { x, y, width: sigW, height: sigH });
    const signedBytes = await doc.save();
    if(!signedFolderId) signedFolderId = await ensureSignedFolder();
    const outName = currentFile.name.replace(/\.pdf$/i, "") + "_signed.pdf";
    await uploadToDrive(outName, signedBytes);
    signaturePad.clear(); toast("บันทึก PDF ที่เซ็นแล้วสำเร็จ");
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
