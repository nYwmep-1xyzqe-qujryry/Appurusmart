# Backend handoff: ยกเลิก session ให้ครบหลัง refresh ที่ "ไม่รู้ผล"

สถานะ: ข้อเสนอสำหรับอนาคต แอพยังไม่ได้ใช้ และไม่ต้องเปลี่ยน endpoint เดิม

## กรณีที่ฝั่งแอพแก้เองไม่ได้

1. แอพส่ง `POST /api/auth/refresh` ไปด้วย refresh token R1
2. Backend รับแล้ว rotate token: R1 ถูกใช้ไปแล้ว และออก access token A2 + refresh token R2 ใหม่
3. response หายระหว่างทาง (timeout, เน็ตหลุด, proxy ตัดการเชื่อมต่อ, connection reset)
4. แอพไม่รู้ว่า server rotate ไปแล้วหรือยัง จึงเก็บคู่เดิม (A1, R1) ไว้ และไม่ส่ง R1 ซ้ำทันที
   เพราะ refresh token ใช้ได้ครั้งเดียว ถ้าส่ง R1 ซ้ำจะโดน replay detection
5. ถ้าผู้ใช้กด logout แอพส่งได้แค่ A1 + R1 ซึ่งเป็นคู่ที่มันรู้จัก Backend ตอบ 401
   ส่วน **R2 ที่แอพไม่เคยได้รับ ยังใช้ได้อยู่บน server จนกว่าจะหมดอายุ (สูงสุด 60 วัน)**

ฝั่งแอพจะล้าง credential ในเครื่องเสมอไม่ว่า logout จะตอบอะไร แต่ยกเลิก R2 บน server ไม่ได้
เพราะไม่มีข้อมูลอะไรที่ใช้อ้างถึง R2 ได้เลย

## ขอ Backend เลือกทำ 1 ทาง

### ทาง A (แนะนำ)

`POST /api/auth/logout` ยอมรับ `refresh_token` ปัจจุบันเป็นตัวยืนยันการยกเลิก
แม้ access token จะถูก rotate ไปแล้วหรือหมดอายุแล้ว

- ยกเลิก token **ทั้ง family** ของ refresh token นั้น (session/device เดียวกัน)
  รวมถึง R2 ที่ rotate ออกไปจาก R1 ด้วย ถึงแม้ R1 จะถูกใช้ไปแล้ว
- idempotent: ถ้า token ถูกยกเลิกไปแล้วก็ตอบสำเร็จ (เช่น 200/204) ไม่ตอบ error
- ไม่บอกว่า token นั้นเป็นของ user คนอื่นหรือมีอยู่จริงไหม: ตอบเหมือนกันทุกกรณี

### ทาง B

ส่ง session/device id ที่ server จัดการเองกลับมาตอน login และตอน refresh
แล้วเพิ่มวิธียกเลิก session/device นั้นได้โดยไม่ต้องใช้ access token ล่าสุด

## สิ่งที่ไม่ต้องการ

- ไม่ต้อง log ค่า token, Authorization header หรือ request body
- ไม่ต้องลดความเข้มของ refresh-token replay detection
  การที่ R1 ถูกส่งซ้ำแล้วโดน 401 คือพฤติกรรมที่ถูกต้องและต้องคงไว้

## ฝั่งแอพจะปรับเมื่อ Backend พร้อม

แจ้งรูปแบบ request/response ที่ตกลงกันได้ แอพจะเพิ่มขั้นตอนนี้ใน `src/services/sessionLogout.js`
โดยไม่เปลี่ยนพฤติกรรมอื่น
