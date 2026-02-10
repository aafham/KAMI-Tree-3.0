# KAMI Tree 3.0

## Ringkas
Website ini ialah **Family Tree Viewer** untuk paparkan salasilah keluarga dalam beberapa mod paparan supaya senang difahami walaupun data besar.

## Apa yang website ini buat
- Papar **semua keluarga** (All Families / Forest) dalam satu kanvas.
- Papar **satu cabang** (Branch) untuk fokus pada satu keluarga.
- Papar **satu individu** (Focus) lengkap dengan parents/spouses/children.
- Ada **Tree / Timeline toggle** dalam area peta (map) untuk tukar paparan.
- Boleh **search**, **pan/zoom**, **fit to screen**, dan **highlight path**.
- Klik kad untuk buka detail, kemudian **Focus this person** untuk terus ke Branch view.
- Header baru yang kemas: title + subtitle view, search dominan, segmented control, dan overflow menu.

## Mod Paparan
1. **All Families (Forest)**
   - Cari semua root (tiada parents).
   - Semua root dipaparkan dalam satu kanvas.
   - Layout kiri -> kanan, dengan connector line.
   - Depth boleh pilih: 1 / 2 / 3 / All.

2. **Branch**
   - Fokus pada satu root sahaja.
   - Layout kiri -> kanan, connector line jelas.
   - Depth boleh pilih dan setiap node boleh collapse/expand.

3. **Focus**
   - Satu individu di tengah.
   - Parents (atas), Spouses (tepi), Children (bawah).
   - Sesuai untuk review detail individu.

4. **Tree / Timeline (dalam map)**
   - Tekan butang **Tree** untuk paparan pokok keluarga.
   - Tekan butang **Timeline** untuk senarai tarikh lahir mengikut masa.

## Cara guna
- **Klik kad** -> buka drawer detail.
- Dalam drawer, klik **Focus this person** -> pindah ke Branch view.
- **Search** -> lompat ke orang tersebut + highlight path.
- **Pan/zoom**: drag untuk pan, scroll untuk zoom.
- **Fit**: auto zoom supaya semua node yang dirender muat dalam skrin.
- **Tree / Timeline**: tukar paparan dalam map area.
- **More menu**: Export (PNG/PDF), Guide, Settings.

## Header / Topbar
- **Left**: Tajuk aplikasi + subtitle ikut view semasa.
- **Center**: Search + segmented view control.
- **Right**: Fit/Center/Reset + overflow menu "More...".
- Responsive:
  - `>=1024px`: semua elemen penuh.
  - `<1024px`: subtitle hilang, Center/Reset masuk overflow.
  - `<640px`: search jadi icon, segmented pindah ke baris bawah.

## Data & Struktur
Fail utama:
- `index.html` – struktur UI.
- `styles.css` – layout, warna, dan connector line.
- `app.js` – logik data, rendering, interaksi.
- `data.json` – data keluarga.

## Format data (data.json)
```json
{
  "familyName": "Nama Keluarga",
  "dataVersion": "2026-02-09",
  "selfId": "p16",
  "people": [
    {
      "id": "p1",
      "name": "Aishah binti Ahmad",
      "birth": "1936-07-19",
      "death": "",
      "relation": "Tok",
      "note": "",
      "photo": ""
    }
  ],
  "unions": [
    {
      "id": "u1",
      "partner1": "p1",
      "partner2": "p2",
      "children": ["p3", "p4"]
    }
  ]
}
```

## Notis
- Nama dipaparkan sebagai **first name sahaja**.
- Tarikh lahir & umur dipaparkan di bawah nama pada setiap card.
- Sistem guna tarikh rujukan **10 Feb 2026** untuk kira umur jika tiada tarikh kematian.
