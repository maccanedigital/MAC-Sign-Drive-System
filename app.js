pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let tokenClient;
let accessToken = null;
let currentPdfBlob = null;
let currentPdfName = "";
let currentPdfId = "";
let pdfDocument = null;
let currentPage = 1;
let totalPages = 0;
let signaturePad;
let pdfFiles = [];
let documentStatus = new Map();
let activeFilter = "all";

const els = {
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  loadPdfBtn: document.getElementById("loadPdfBtn"),
  status: document.getElementById("status"),
  fileList: document.getElementById("fileList"),
  fileSearchInput: document.getElementById("fileSearchInput"),
  filterAllBtn: document.getElementById("filterAllBtn"),
  filterSignedBtn: document.getElementById("filterSignedBtn"),
  filterPendingBtn: document.getElementById("filterPendingBtn"),
  totalOriginalCount: document.getElementById("totalOriginalCount"),
  signedCount: document.getElementById("signedCount"),
  pendingCount: document.getElementById("pendingCount"),
  pdfCanvas: document.getElementById("pdfCanvas"),
  signatureCanvas: document.getElementById("signatureCanvas"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  clearSignatureBtn: document.getElementById("clearSignatureBtn"),
  savePdfBtn: document.getElementById("savePdfBtn")
};

window.addEventListener("load", () => {
  resizeSignatureCanvas();
  signaturePad = new SignaturePad(els.signatureCanvas, {
    backgroundColor: "rgba(255,255,255,0)",
    penColor: "rgb(0, 0, 0)"
  });

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (response) => {
      if (response.error) {
        setStatus("เข้าสู่ระบบไม่สำเร็จ");
        return;
      }
      accessToken = response.access_token;
      setLoggedInState();
      setStatus("เข้าสู่ระบบสำเร็จ พร้อมดึงไฟล์ PDF จาก Google Drive");
    }
  });
});

window.addEventListener("resize", resizeSignatureCanvas);

els.loginBtn.addEventListener("click", () => {
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
});
els.logoutBtn.addEventListener("click", logout);

els.loadPdfBtn.addEventListener("click", loadPdfFiles);
els.fileSearchInput.addEventListener("input", renderFileList);
els.filterAllBtn.addEventListener("click", () => setFilter("all"));
els.filterSignedBtn.addEventListener("click", () => setFilter("signed"));
els.filterPendingBtn.addEventListener("click", () => setFilter("pending"));
els.prevPageBtn.addEventListener("click", () => changePage(-1));
els.nextPageBtn.addEventListener("click", () => changePage(1));
els.clearSignatureBtn.addEventListener("click", () => signaturePad.clear());
els.savePdfBtn.addEventListener("click", saveSignedPdf);

function setStatus(message) {
  els.status.textContent = message;
}

function setLoggedInState() {
  els.loginBtn.textContent = "เข้าสู่ระบบแล้ว";
  els.loginBtn.disabled = true;
  els.logoutBtn.disabled = false;
  els.loadPdfBtn.disabled = false;
}

function setLoggedOutState() {
  accessToken = null;
  currentPdfBlob = null;
  currentPdfName = "";
  currentPdfId = "";
  pdfDocument = null;
  currentPage = 1;
  totalPages = 0;
  pdfFiles = [];
  documentStatus = new Map();
  activeFilter = "all";

  els.loginBtn.textContent = "เข้าสู่ระบบ";
  els.loginBtn.disabled = false;
  els.logoutBtn.disabled = true;
  els.loadPdfBtn.disabled = true;
  els.fileSearchInput.disabled = true;
  els.fileSearchInput.value = "";
  els.fileList.innerHTML = "";
  setSummaryCounts(0, 0, 0);
  setFilterButtonsDisabled(true);
  setFilter("all", false);
  els.prevPageBtn.disabled = true;
  els.nextPageBtn.disabled = true;
  els.clearSignatureBtn.disabled = true;
  els.savePdfBtn.disabled = true;
  els.pageInfo.textContent = "หน้า - / -";

  const pdfCtx = els.pdfCanvas.getContext("2d");
  pdfCtx.clearRect(0, 0, els.pdfCanvas.width, els.pdfCanvas.height);
  if (signaturePad) signaturePad.clear();
}

function logout() {
  if (accessToken && google?.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  setLoggedOutState();
  setStatus("ออกจากระบบแล้ว");
}

function resizeSignatureCanvas() {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const canvas = els.signatureCanvas;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  if (signaturePad) signaturePad.clear();
}

async function loadPdfFiles() {
  setStatus("กำลังดึงรายการ PDF...");
  els.fileList.innerHTML = "";
  const query = encodeURIComponent(`'${CONFIG.FOLDER_ID}' in parents and mimeType='application/pdf' and trashed=false`);
  const fields = encodeURIComponent("files(id,name,modifiedTime,size)");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    setStatus("ดึงไฟล์ไม่สำเร็จ ตรวจสอบสิทธิ์ Folder หรือ OAuth Scope");
    return;
  }

  const data = await res.json();
  if (!data.files || data.files.length === 0) {
    setStatus("ไม่พบไฟล์ PDF ในโฟลเดอร์นี้");
    return;
  }

  pdfFiles = data.files;
  buildDocumentStatus();
  els.fileSearchInput.disabled = false;
  setFilterButtonsDisabled(false);
  els.fileSearchInput.value = "";
  setFilter("all");
}

function normalizeBaseName(fileName) {
  return fileName.replace(/_signed\.pdf$/i, "").replace(/\.pdf$/i, "").trim().toLowerCase();
}

function isSignedFile(fileName) {
  return /_signed\.pdf$/i.test(fileName);
}

function buildDocumentStatus() {
  const signedBases = new Set(
    pdfFiles.filter((file) => isSignedFile(file.name)).map((file) => normalizeBaseName(file.name))
  );
  const originalFiles = pdfFiles.filter((file) => !isSignedFile(file.name));

  documentStatus = new Map();
  originalFiles.forEach((file) => {
    documentStatus.set(file.id, {
      isOriginal: true,
      isSigned: signedBases.has(normalizeBaseName(file.name))
    });
  });

  const signedCount = originalFiles.filter((file) => documentStatus.get(file.id)?.isSigned).length;
  const pendingCount = Math.max(originalFiles.length - signedCount, 0);
  setSummaryCounts(originalFiles.length, signedCount, pendingCount);
}

function setSummaryCounts(total, signed, pending) {
  els.totalOriginalCount.textContent = total.toLocaleString("th-TH");
  els.signedCount.textContent = signed.toLocaleString("th-TH");
  els.pendingCount.textContent = pending.toLocaleString("th-TH");
}

function setFilterButtonsDisabled(disabled) {
  [els.filterAllBtn, els.filterSignedBtn, els.filterPendingBtn].forEach((btn) => {
    btn.disabled = disabled;
  });
}

function setFilter(filter, shouldRender = true) {
  activeFilter = filter;
  const buttons = { all: els.filterAllBtn, signed: els.filterSignedBtn, pending: els.filterPendingBtn };
  Object.entries(buttons).forEach(([key, btn]) => btn.classList.toggle("active", key === filter));
  if (shouldRender) renderFileList();
}

function renderFileList() {
  const keyword = (els.fileSearchInput.value || "").trim().toLowerCase();
  const originalFiles = pdfFiles.filter((file) => !isSignedFile(file.name));
  const filteredFiles = originalFiles.filter((file) => {
    const status = documentStatus.get(file.id);
    const matchKeyword = file.name.toLowerCase().includes(keyword);
    const matchFilter =
      activeFilter === "all" ||
      (activeFilter === "signed" && status?.isSigned) ||
      (activeFilter === "pending" && !status?.isSigned);
    return matchKeyword && matchFilter;
  });

  els.fileList.innerHTML = "";

  if (filteredFiles.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-result";
    empty.textContent = "ไม่พบไฟล์ PDF ตามเงื่อนไขที่เลือก";
    els.fileList.appendChild(empty);
    setStatus(keyword ? `ไม่พบไฟล์ที่มีคำว่า “${els.fileSearchInput.value}”` : "ไม่พบไฟล์ PDF");
    return;
  }

  filteredFiles.forEach((file) => {
    const btn = document.createElement("button");
    btn.className = "file-item";
    if (file.id === currentPdfId) btn.classList.add("active");
    const status = documentStatus.get(file.id);
    btn.innerHTML = `<span>${file.name}</span><small class="file-status ${status?.isSigned ? "is-signed" : "is-pending"}">${status?.isSigned ? "เซ็นแล้ว" : "ยังไม่เซ็น"}</small>`;
    btn.onclick = () => openPdf(file, btn);
    els.fileList.appendChild(btn);
  });

  const filterText = activeFilter === "signed" ? "เซ็นแล้ว" : activeFilter === "pending" ? "ยังไม่เซ็น" : "ทั้งหมด";
  setStatus(keyword ? `พบไฟล์ ${filterText} ที่ตรงกับการค้นหา ${filteredFiles.length} ไฟล์` : `แสดงรายการ ${filterText} ${filteredFiles.length} ไฟล์`);
}

async function openPdf(file, button) {
  document.querySelectorAll(".file-item").forEach((el) => el.classList.remove("active"));
  button.classList.add("active");
  setStatus(`กำลังเปิด ${file.name}`);

  const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    setStatus("เปิด PDF ไม่สำเร็จ");
    return;
  }

  currentPdfBlob = await res.blob();
  currentPdfName = file.name;
  currentPdfId = file.id;
  const arrayBuffer = await currentPdfBlob.arrayBuffer();
  pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  currentPage = 1;
  totalPages = pdfDocument.numPages;
  await renderPage(currentPage);

  els.prevPageBtn.disabled = false;
  els.nextPageBtn.disabled = false;
  els.clearSignatureBtn.disabled = false;
  els.savePdfBtn.disabled = false;
  updatePageInfo();
  setStatus(`เปิดไฟล์ ${file.name} เรียบร้อย`);
}

async function renderPage(pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.45 });
  const canvas = els.pdfCanvas;
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
}

async function changePage(delta) {
  if (!pdfDocument) return;
  const nextPage = currentPage + delta;
  if (nextPage < 1 || nextPage > totalPages) return;
  currentPage = nextPage;
  await renderPage(currentPage);
  updatePageInfo();
}

function updatePageInfo() {
  els.pageInfo.textContent = `หน้า ${currentPage} / ${totalPages}`;
  els.prevPageBtn.disabled = currentPage <= 1;
  els.nextPageBtn.disabled = currentPage >= totalPages;
}

async function saveSignedPdf() {
  if (!currentPdfBlob) {
    setStatus("ยังไม่ได้เลือก PDF");
    return;
  }
  if (signaturePad.isEmpty()) {
    setStatus("กรุณาเซ็นชื่อก่อนบันทึก");
    return;
  }

  setStatus("กำลังฝังลายเซ็นลง PDF...");
  const pdfBytes = await currentPdfBlob.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const targetPage = pages[currentPage - 1];
  const { width } = targetPage.getSize();

  const signatureDataUrl = signaturePad.toDataURL("image/png");
  const signatureImage = await pdfDoc.embedPng(signatureDataUrl);

  targetPage.drawImage(signatureImage, {
    x: width - 220,
    y: 70,
    width: 170,
    height: 70
  });

  const signedBytes = await pdfDoc.save();
  const signedBlob = new Blob([signedBytes], { type: "application/pdf" });
  await uploadSignedPdf(signedBlob);
}

async function uploadSignedPdf(blob) {
  setStatus("กำลังอัปโหลดไฟล์ PDF ที่เซ็นแล้ว...");
  const signedName = currentPdfName.replace(/\.pdf$/i, "") + "_signed.pdf";

  const metadata = {
    name: signedName,
    mimeType: "application/pdf",
    parents: [CONFIG.FOLDER_ID]
  };

  const boundary = "canenext_boundary_" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    delimiter,
    "Content-Type: application/pdf\r\n\r\n",
    blob,
    closeDelimiter
  ], { type: `multipart/related; boundary=${boundary}` });

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body: multipartBody
  });

  if (!res.ok) {
    setStatus("อัปโหลดไม่สำเร็จ ตรวจสอบสิทธิ์ Google Drive");
    return;
  }

  const data = await res.json();
  setStatus(`บันทึกสำเร็จ: ${data.name}`);
  signaturePad.clear();
  await loadPdfFiles();
}
