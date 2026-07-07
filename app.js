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

const els = {
  loginBtn: document.getElementById("loginBtn"),
  loadPdfBtn: document.getElementById("loadPdfBtn"),
  status: document.getElementById("status"),
  fileList: document.getElementById("fileList"),
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
      els.loadPdfBtn.disabled = false;
      els.loginBtn.textContent = "เข้าสู่ระบบแล้ว";
      setStatus("พร้อมดึงไฟล์ PDF จาก Google Drive");
    }
  });
});

window.addEventListener("resize", resizeSignatureCanvas);

els.loginBtn.addEventListener("click", () => {
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
});

els.loadPdfBtn.addEventListener("click", loadPdfFiles);
els.prevPageBtn.addEventListener("click", () => changePage(-1));
els.nextPageBtn.addEventListener("click", () => changePage(1));
els.clearSignatureBtn.addEventListener("click", () => signaturePad.clear());
els.savePdfBtn.addEventListener("click", saveSignedPdf);

function setStatus(message) {
  els.status.textContent = message;
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

  data.files.forEach((file) => {
    const btn = document.createElement("button");
    btn.className = "file-item";
    btn.textContent = file.name;
    btn.onclick = () => openPdf(file, btn);
    els.fileList.appendChild(btn);
  });
  setStatus(`พบไฟล์ PDF ${data.files.length} ไฟล์`);
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
