# CaneNext : Online Signature System

เว็บสำหรับดึง PDF จาก Google Drive Folder กลาง เปิดอ่าน เซ็นผ่านแท็บเล็ต และบันทึกกลับเป็นไฟล์ `_signed.pdf`

## ไฟล์สำคัญ
- `index.html`
- `style.css`
- `app.js`
- `config.js`

## Google Cloud ที่ต้องตั้งค่า
1. Enable Google Drive API
2. OAuth Client ID แบบ Web Application
3. Authorized JavaScript origins: `https://maccanedigital.github.io` หรือโดเมน GitHub Pages ของคุณ
4. OAuth Consent Screen เพิ่ม Test Users หรือ Publish App
5. โฟลเดอร์ Drive ต้องแชร์ให้บัญชีผู้ใช้งานมีสิทธิ์ดู/แก้ไข

## Scope ที่ใช้
`https://www.googleapis.com/auth/drive`

ใช้ scope นี้เพื่ออ่าน PDF ในโฟลเดอร์กลางและอัปโหลดไฟล์ PDF ที่เซ็นแล้วกลับเข้าโฟลเดอร์เดิม
