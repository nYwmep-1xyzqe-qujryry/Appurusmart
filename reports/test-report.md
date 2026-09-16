# URUSmart Test Report

Generated at: 2026-09-16T14:47:00.103Z

## Summary

- Total test cases: 17
- Passed: 17
- Failed: 0

## Test Cases

| Test Case | Function | Scenario | Input | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- | --- |
| TC01 | thaiDate.parseISOToDate | แปลงวันที่ ISO เป็น Date แบบ local time | 2024-10-26 | 2024-10-26 | 2024-10-26 | PASS |
| TC02 | thaiDate.toISODate | แปลง Date เป็นรูปแบบ YYYY-MM-DD สำหรับส่ง API | new Date(2024, 9, 26) | 2024-10-26 | 2024-10-26 | PASS |
| TC03 | thaiDate.formatThaiDate | แสดงวันที่เป็น พ.ศ. สำหรับผู้ใช้ | 2024-10-26 | 26/10/2567 | 26/10/2567 | PASS |
| TC04 | thaiDate.formatThaiDate | กรณี backend ส่งวันที่ว่างหรือ 0000-00-00 | 0000-00-00 | (empty) | (empty) | PASS |
| TC05 | image.fixPhotoUrl | แปลง path รูปจาก backend ให้เป็น URL เต็ม | /storage/photos/profile.jpg | https://api.example.test/storage/photos/profile.jpg | https://api.example.test/storage/photos/profile.jpg | PASS |
| TC06 | image.fixPhotoUrl | แปลง localhost URL ให้ device เปิดได้ผ่าน API base URL | http://localhost:8001/storage/photos/profile.jpg | https://api.example.test/storage/photos/profile.jpg | https://api.example.test/storage/photos/profile.jpg | PASS |
| TC07 | image.fixPhotoUrl | คงค่า external CDN URL เดิม | https://cdn.example.test/a.jpg | https://cdn.example.test/a.jpg | https://cdn.example.test/a.jpg | PASS |
| TC08 | name.stripNamePrefix | ตัดคำนำหน้าชื่อภาษาไทย | นางสาว สมใจ ทดสอบ | สมใจ ทดสอบ | สมใจ ทดสอบ | PASS |
| TC09 | name.stripNamePrefix | ตัดคำนำหน้าทางวิชาการ | ดร. ตัวอย่าง ทดสอบ | ตัวอย่าง ทดสอบ | ตัวอย่าง ทดสอบ | PASS |
| TC10 | expertFields.getExpertTitle | ดึงชื่อผลงานจาก field reference เมื่อไม่มี name/title | { reference: 'FTFY' } | FTFY | FTFY | PASS |
| TC11 | expertFields.getExpertLink | ดึงลิงก์เอกสารจาก file_url | { file_url: 'https://example.com/file.pdf' } | https://example.com/file.pdf | https://example.com/file.pdf | PASS |
| TC12 | expertFields.getExpertYear | ดึงปีของข้อมูล expert | { year: 2568 } | 2568 | 2568 | PASS |
| TC13 | announcement.normalizeAnnouncement | ใช้ title และ body ที่ trim แล้วเป็นข้อมูลกลางของข่าว | title/body มีช่องว่างรอบข้อความ | ข่าวทดสอบ \| รายละเอียดข่าว | ข่าวทดสอบ \| รายละเอียดข่าว | PASS |
| TC14 | announcement.normalizeAnnouncement | รองรับรูปเต็มและ thumbnail จาก Backend | image_url และ thumbnail_url เป็น HTTPS | https://cdn.example.test/news.jpg \| https://cdn.example.test/news-thumb.jpg | https://cdn.example.test/news.jpg \| https://cdn.example.test/news-thumb.jpg | PASS |
| TC15 | announcement.normalizeAnnouncement | ข่าวเก่าที่ไม่มีรูปยังอ่านได้และไม่สร้างกรอบรูปว่าง | ไม่มี image_url และ thumbnail_url | ข่าวเก่า \| null \| null | ข่าวเก่า \| null \| null | PASS |
| TC16 | inputSanitize.sanitizeAcademicText | ลบ emoji และอักขระอันตราย แต่คงสัญลักษณ์วิชาการที่อนุญาต | ข้อมูล 🫶 €$\|<>{}^!?#*¥ + [] = _ % | ข้อมูล + [] = _ % | ข้อมูล + [] = _ % | PASS |
| TC17 | url.normalizeOptionalUrl | ปฏิเสธ protocol ที่ไม่ปลอดภัยสำหรับลิงก์ต้นฉบับ | javascript:alert(1) | false | false | PASS |
