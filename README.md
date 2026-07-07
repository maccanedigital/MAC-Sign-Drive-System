# CaneNext : Online Signature System

ระบบเว็บสำหรับดึง PDF จาก Google Drive, เซ็นผ่านแท็บเล็ต และบันทึกไฟล์ PDF ที่มีลายเซ็นกลับเข้า Google Drive

## ไฟล์หลัก

- `index.html` หน้าเว็บหลัก
- `style.css` รูปแบบหน้าเว็บ
- `app.js` ระบบ Login, ดึง PDF, เซ็น, บันทึก PDF
- `config.js` Google Client ID และ Folder ID

## การใช้งานบน GitHub Pages

1. Upload ไฟล์ทั้งหมดขึ้น GitHub Repository
2. ไปที่ Settings > Pages
3. เลือก Deploy from branch
4. Branch: main
5. Folder: /(root)
6. Save

## Google Cloud ที่ต้องตั้งค่า

Authorized JavaScript origins:

```text
https://besttagoon.github.io
```

Scope ที่ใช้:

```text
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.readonly
```

Folder ID:

```text
1y5vd_tFnhfzjDfDo3Idq6nkqhlPRPE6p
```

## หมายเหตุ

ระบบจะบันทึกไฟล์ใหม่เป็น `_signed.pdf` เพื่อไม่เขียนทับไฟล์ต้นฉบับ
