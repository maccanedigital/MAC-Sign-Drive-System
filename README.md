# CaneNext : Online Signature System

เวอร์ชันนี้เชื่อม Google Drive API จริง รองรับการดึง PDF จากโฟลเดอร์กลาง เปิดเอกสาร เซ็นผ่าน Tablet และบันทึกไฟล์ที่เซ็นแล้วแยกไว้ในโฟลเดอร์ `02_Signed_PDF`

## การจัดเก็บไฟล์

- PDF ต้นฉบับอยู่ในโฟลเดอร์หลัก Google Drive ตาม `FOLDER_ID`
- เมื่อกดบันทึกลายเซ็น ระบบจะสร้างโฟลเดอร์ `02_Signed_PDF` อัตโนมัติถ้ายังไม่มี
- ไฟล์ที่เซ็นแล้วจะถูกบันทึกเป็น `ชื่อไฟล์เดิม_signed.pdf` ในโฟลเดอร์ `02_Signed_PDF`
- ระบบไม่เขียนทับไฟล์ต้นฉบับ

## ไฟล์สำคัญ

- `index.html` หน้าเว็บหลัก
- `style.css` รูปแบบหน้าเว็บ
- `app.js` ระบบ Login, ดึงไฟล์ PDF, เซ็น และอัปโหลดกลับ Drive
- `config.js` ตั้งค่า Client ID และ Folder ID

## ตั้งค่า Google Cloud

Authorized JavaScript origins สำหรับ GitHub Pages ให้ใส่เฉพาะโดเมน เช่น

```text
https://maccanedigital.github.io
```

ไม่ต้องใส่ path `/canenext-online-signature`

## Scope ที่ใช้

```text
https://www.googleapis.com/auth/drive
```


## อัปเดตตำแหน่งลายเซ็น

ระบบจะฝังลายเซ็นไว้ที่หน้าสุดท้ายของ PDF โดยอัตโนมัติ และจัดตำแหน่งให้ชิดมุมขวาล่างสุดของกระดาษ เพื่อลดโอกาสทับรายละเอียดในเอกสารหน้าอื่น
