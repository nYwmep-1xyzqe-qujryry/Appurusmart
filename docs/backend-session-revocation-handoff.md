# Backend handoff: ยกเลิก session ให้ครบหลัง refresh ที่ "ไม่รู้ผล"

สถานะ: **backend deploy แล้ว (26 ต.ค. 2569)** แอพไม่ต้องแก้ เพราะรูปแบบ request ตรงกับที่แอพส่งอยู่แล้ว

## กรณีที่แอพแก้เองไม่ได้

1. แอพส่ง `POST /api/auth/refresh` ไปด้วย refresh token R1
2. backend รับแล้ว rotate token: R1 ถูกใช้ไปแล้ว, access token เก่า A1 ถูกลบ และออก A2 + R2 ใหม่
3. response หายระหว่างทาง (timeout, เน็ตหลุด, proxy ตัดการเชื่อมต่อ, connection reset)
4. แอพไม่รู้ว่า server rotate ไปแล้วหรือยัง จึงเก็บคู่เดิม (A1, R1) ไว้ และไม่ส่ง R1 ซ้ำทันที
   เพราะ refresh token ใช้ได้ครั้งเดียว
5. แล้วแต่ว่าผู้ใช้ทำอะไรต่อ
   - **ใช้แอพต่อ:** request ถัดไปที่ต้อง refresh จะส่ง R1 ไป backend เห็นว่าเป็นการใช้ซ้ำ
     จึงตัดทั้ง session รวมถึง R2 และแอพพาไปหน้า login
   - **กด logout ทันที:** แอพส่ง A1 + R1 ซึ่ง A1 ถูกลบไปแล้ว ก่อน deploy logout จะได้ 401
     และ R2 ยังใช้ได้อยู่บน server จนกว่าจะหมดอายุ (สูงสุด 60 วัน)

## สิ่งที่ backend ทำแล้ว

`POST /api/auth/logout`

- ไม่ต้องมี access token ที่ยังใช้ได้ ส่ง `Authorization: Bearer ...` หรือ body
  `{ "refresh_token": "..." }` อย่างใดอย่างหนึ่ง หรือทั้งคู่ก็ได้
- ถ้า `refresh_token` เป็นตัวที่ถูก refresh ไปแล้ว (R1) จะยกเลิกทั้ง session รวม A2 และ R2
  ที่แอพไม่เคยได้รับ จึงปิดกรณีข้อ 5 ได้ครบ
- ตอบ `200 {"message":"Logged out successfully"}` ทุกกรณี (token ไม่มีจริง, ถูกยกเลิกไปแล้ว
  หรือเป็นของผู้ใช้อื่น) เรียกซ้ำได้ ไม่บอกข้อมูลเพิ่ม
- ยกเลิกเฉพาะ session นั้น เครื่องอื่นของผู้ใช้คนเดียวกันไม่หลุด
- ไม่ log ค่า token, header หรือ body
- `/auth/refresh` ยังตรวจการใช้ซ้ำเหมือนเดิม ส่ง R1 ซ้ำยังได้ 401

## ฝั่งแอพ

`src/services/sessionLogout.js` ส่ง access token ล่าสุดที่เครื่องมี พร้อม body
`{ "refresh_token": "<ตัวล่าสุด>" }` อยู่แล้ว และลบ credential ในเครื่องเสมอไม่ว่า server จะตอบอะไร
ไม่ต้องเปลี่ยนโค้ด

## Rate limit ที่ backend ตั้งไว้ (ข้อมูลประกอบ)

| endpoint | ขีดจำกัด |
|---|---|
| API ที่ login แล้ว | 120 ครั้ง/นาที ต่อผู้ใช้ |
| API ที่ยังไม่ login | 300 ครั้ง/นาที ต่อ IP |
| `/auth/refresh` | 10 ครั้ง/นาที ต่อ refresh token + 300 ครั้ง/นาที ต่อ IP |
| `/auth/login` | 5 ครั้ง/นาที ต่อ (อีเมล + IP) + 120 ครั้ง/นาที ต่อ IP |
| `/auth/sso-token`, `/auth/logout` | 120 ครั้ง/นาที ต่อ IP |

แอพรองรับ 429 แล้ว: ไม่ logout และรอตาม `Retry-After` ก่อน refresh ใหม่
