# WIXX - אפיון מלא ל-Base44

## פרומפט ראשוני (להדביק ב-Base44 AI Chat)

```
בנה מערכת ניהול מחסן נעליים בעברית (RTL) בשם WIXX.

ישויות (Entities):

1. Product - קטלוג מוצרים
   - barcode (string, unique) - ברקוד
   - brand (string) - מותג
   - model (string) - דגם
   - color (string) - צבע
   - size (string) - מידה
   - sku_code (string) - קוד SKU
   - description (string) - תיאור
   - season (string) - עונה
   - gender (string, enum: גבר/אישה/ילדים/יוניסקס) - מין
   - category (string) - קטגוריה
   - active (boolean, default true) - פעיל

2. Container - קונטיינרים/משלוחים
   - container_number (string, unique)
   - arrival_date (date)
   - supplier (string)
   - estimated_quantity (integer)
   - status (string, enum: open/closed/archived, default: open)
   - notes (string)

3. ReceivingSession - סשן קליטה
   - container_id (string, ref Container)
   - started_by (string)
   - ended_at (date-time)
   - status (string, enum: active/completed/cancelled, default: active)

4. Location - איתורים (מיקום פיזי במחסן)
   - location_code (string, unique)
   - zone (string)
   - assigned_product_id (string, ref Product)
   - status (string, enum: open/full/closed/archived, default: open)
   - max_capacity (integer, default: 50)
   - current_quantity (integer, default: 0)
   - parent_location_id (string, ref Location)
   - notes (string)

5. Inventory - מלאי
   - product_id (string, ref Product)
   - location_id (string, ref Location)
   - quantity (integer, default: 0)

6. ScanLog - לוג סריקות/תנועות
   - session_id (string, ref ReceivingSession)
   - product_id (string, ref Product)
   - barcode_scanned (string)
   - location_id (string, ref Location)
   - scanned_by (string)
   - action_type (string, enum: intake/transfer/correction/removal/undo, default: intake)
   - quantity_change (integer, default: 1)
   - notes (string)

7. Exception - חריגים
   - barcode_scanned (string)
   - session_id (string, ref ReceivingSession)
   - issue_type (string, enum: unknown_barcode/duplicate_suspect/wrong_location/damaged/other, default: unknown_barcode)
   - status (string, enum: open/resolved/ignored, default: open)
   - resolved_by (string)
   - resolved_at (date-time)
   - notes (string)

חוקים עסקיים:
- כל איתור מכיל SKU אחד בלבד (מוצר אחד ספציפי)
- כל סריקה שמתאשרת: Inventory quantity +1, Location current_quantity +1, נוצר ScanLog
- ברקוד לא מזוהה = חריגה (Exception) נוצרת אוטומטית
- כש"איתור מלא": האיתור הנוכחי נסגר (status=full), ונפתח איתור המשכי אוטומטי (NIKE-42 → NIKE-42-2)
- איתור פתוח ראשי אחד לכל מוצר

מסכים:

1. דשבורד (/)
   - 6 כרטיסי סטטיסטיקה: סריקות היום, איתורים פתוחים, איתורים מלאים, סה"כ מלאי, מוצרים בקטלוג, חריגים פתוחים
   - סשן קליטה פעיל (אם יש)
   - טבלת 10 סריקות אחרונות

2. מסך סריקה (/scan) - המסך הראשי!
   - שורת סשן: פתח/סגור סשן קליטה, בחירת קונטיינר
   - שדה ברקוד גדול וממוקד (autoFocus) - הסורק עובד כמקלדת ושולח Enter
   - אחרי סריקה: כרטיס מוצר (מותג, דגם, מידה, צבע) + כרטיס איתור מוצע (קוד + כמות/קיבולת)
   - כפתורים: "אשר הכנסה לאיתור" (ירוק גדול) | "איתור מלא" (כתום) | "פתח איתור חדש"
   - פידבק הצלחה ירוק למשך 1.5 שניות, אחר כך חזרה למצב סריקה
   - כפתור "בטל סריקה אחרונה"
   - היסטוריית סריקות בסשן + מונה
   - חשוב מאוד: אחרי כל פעולה הפוקוס חוזר לשדה הברקוד!

3. קטלוג מוצרים (/products)
   - טבלה: ברקוד, מותג, דגם, צבע, מידה, SKU
   - חיפוש חופשי
   - הוספה/עריכה בדיאלוג
   - כפתור העלאת CSV (barcode,brand,model,color,size,sku_code,description,season,gender,category)

4. ניהול איתורים (/locations)
   - טבלה: קוד, אזור, מוצר משויך, כמות, קיבולת, סטטוס
   - פילטר לפי סטטוס (פתוח/מלא/סגור)
   - חיפוש
   - הוספה + שינוי סטטוס מהיר

5. מלאי (/inventory)
   - טבלה משולבת: איתור, ברקוד, מותג, דגם, צבע, מידה, כמות
   - חיפוש חופשי

6. קונטיינרים (/containers)
   - טבלה: מספר, תאריך, ספק, כמות משוערת, כמה נסרקו, סטטוס
   - הוספה + שינוי סטטוס

7. חריגים (/exceptions)
   - טבלה: ברקוד, סוג בעיה, סטטוס, תאריך, הערות
   - פילטר: פתוחים/טופלו
   - כפתור "טפל" עם דיאלוג

8. דוחות (/reports)
   - מלאי לפי איתור
   - מלאי לפי מוצר (סה"כ כמות + באילו איתורים)
   - סיכום קונטיינר (כמה נסרק, ברקודים ייחודיים, חריגים)
   - ייצוא CSV

ניווט: סיידבר שמאלי (RTL אז ימני) עם כל המסכים
עיצוב: נקי, מקצועי, צבע ראשי כחול, כפתורים ברורים, טבלאות עם badges לסטטוסים
```

---

## פרומפט 2 - Backend Function: scan-barcode

```
צור backend function בשם scan-barcode.

הפונקציה מקבלת: { barcode, session_id }

לוגיקה:
1. חפש Product לפי barcode (filter)
2. אם לא נמצא:
   - צור Exception עם issue_type: unknown_barcode
   - החזר { status: "exception", barcode, message: "ברקוד לא נמצא בקטלוג" }
3. אם נמצא:
   - חפש Location עם status=open ו-assigned_product_id=המוצר (הראשון לפי created_date)
   - החזר { status: "found", product: {...}, location: {...} או null, needs_location: true/false }

השתמש ב-asServiceRole ותמוך ב-is_system_trigger.
```

## פרומפט 3 - Backend Function: confirm-scan

```
צור backend function בשם confirm-scan.

מקבל: { product_id, location_id, session_id, barcode, scanned_by }

לוגיקה:
1. בדוק שה-Location פתוח (status=open) ומשויך למוצר הנכון (או לא משויך)
2. אם לא משויך - שייך את ה-product ל-location
3. חפש Inventory עם product_id + location_id:
   - אם קיים: עדכן quantity +1
   - אם לא: צור חדש עם quantity: 1
4. עדכן Location.current_quantity +1
5. צור ScanLog עם action_type: intake
6. בדוק אם current_quantity >= max_capacity → החזר is_full: true

השתמש ב-asServiceRole ותמוך ב-is_system_trigger.
```

## פרומפט 4 - Backend Function: mark-location-full

```
צור backend function בשם mark-location-full.

מקבל: { location_id }

לוגיקה:
1. קבל את ה-Location
2. שנה status ל-"full"
3. צור Location חדש:
   - קוד: אם המקורי NIKE-42, החדש NIKE-42-2 (או NIKE-42-3 אם 2 קיים)
   - אותו zone, assigned_product_id, max_capacity
   - parent_location_id = המקורי
   - status: open, current_quantity: 0
4. החזר את האיתור החדש

השתמש ב-asServiceRole ותמוך ב-is_system_trigger.
```

## פרומפט 5 - Backend Function: undo-last-scan

```
צור backend function בשם undo-last-scan.

מקבל: { session_id }

לוגיקה:
1. מצא את ה-ScanLog האחרון בסשן עם action_type: intake (sorted by -created_date, limit 1)
2. מצא את ה-Inventory המתאים ותוריד quantity -1
3. עדכן Location.current_quantity -1
4. צור ScanLog חדש עם action_type: undo, quantity_change: -1
5. החזר הודעה

השתמש ב-asServiceRole ותמוך ב-is_system_trigger.
```

## פרומפט 6 - העלאת CSV

```
הוסף לדף קטלוג מוצרים כפתור "העלאת CSV".
כשלוחצים: בוחרים קובץ CSV.
עמודות: barcode,brand,model,color,size,sku_code,description,season,gender,category
לכל שורה: בדוק אם ברקוד כבר קיים (filter). אם כן - דלג. אם לא - צור Product.
בסוף הצג הודעת toast עם סיכום: "יובאו X מוצרים, דולגו Y"
```

## פרומפט 7 - חיבור מסך הסריקה ל-Backend Functions

```
חבר את מסך הסריקה ל-backend functions:
- כשסורקים ברקוד (Enter): base44.functions.invoke('scan-barcode', { barcode, session_id })
- כשלוחצים "אשר": base44.functions.invoke('confirm-scan', { product_id, location_id, session_id, barcode })
- כשלוחצים "איתור מלא": base44.functions.invoke('mark-location-full', { location_id })
- כשלוחצים "בטל": base44.functions.invoke('undo-last-scan', { session_id })

אחרי כל פעולה: חזרה לפוקוס על שדה הברקוד.
אחרי אישור סריקה: פידבק ירוק 1.5 שניות → חזרה למצב סריקה.
```

---

## src/api/base44Client.js

```javascript
import { createClient } from '@base44/sdk';

export const base44 = createClient();

export const Product = base44.entities.Product;
export const Container = base44.entities.Container;
export const ReceivingSession = base44.entities.ReceivingSession;
export const Location = base44.entities.Location;
export const Inventory = base44.entities.Inventory;
export const ScanLog = base44.entities.ScanLog;
export const Exception = base44.entities.Exception;
```

## מבנה דפים מומלץ

```
src/pages/
  Dashboard.jsx        - דשבורד ראשי
  ScanPage.jsx         - מסך סריקה (הליבה)
  ProductCatalog.jsx   - קטלוג מוצרים + CSV import
  LocationManager.jsx  - ניהול איתורים
  InventoryView.jsx    - מלאי
  ContainerManager.jsx - קונטיינרים
  ExceptionsView.jsx   - חריגים
  ReportsView.jsx      - דוחות + ייצוא
```

## Backend Functions מוכנים

```
base44/functions/
  scan-barcode/entry.ts       - חיפוש מוצר + הצעת איתור
  confirm-scan/entry.ts       - אישור סריקה + עדכון מלאי
  mark-location-full/entry.ts - סימון מלא + יצירת המשך
  undo-last-scan/entry.ts     - ביטול סריקה אחרונה
```

---

## סדר עבודה מומלץ ב-Base44

1. הדבק את **פרומפט 1** (הראשוני) → יבנה entities + מסכים בסיסיים
2. הדבק **פרומפטים 2-5** אחד אחד → יבנה backend functions
3. הדבק **פרומפט 6** → העלאת CSV
4. הדבק **פרומפט 7** → חיבור מסך סריקה ל-functions
5. בדוק ותקן עיצוב/UX
6. חבר ל-GitHub → כל שינוי עתידי דרך קוד + push ל-main
