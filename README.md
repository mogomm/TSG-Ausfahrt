# ⚽ Fahrgemeinschaft-App

Intelligente Fahrgemeinschaften für Jugendfußball-Auswärtsspiele.

---

## 🚀 Schritt-für-Schritt: Kostenlos live bringen

### Schritt 1 – GitHub Repository anlegen

1. Gehe auf [github.com](https://github.com) → oben rechts **"+"** → **"New repository"**
2. Name: `fahrgemeinschaft`
3. **Public** auswählen
4. Klicke **"Create repository"**
5. Dann auf der leeren Repo-Seite: **"uploading an existing file"**
6. Alle Dateien aus diesem Ordner hochladen (server.js, package.json, schema.sql, .env.example, und den `public/`-Ordner mit index.html und admin.html)
7. Klicke **"Commit changes"**

---

### Schritt 2 – Supabase Datenbank einrichten (kostenlos)

1. Gehe auf [supabase.com](https://supabase.com) → **"Start your project"**
2. Mit GitHub einloggen
3. **"New project"** → Name: `fahrgemeinschaft` → Passwort merken → Region: **Central EU (Frankfurt)**
4. Warte ~2 Minuten bis das Projekt bereit ist
5. Klicke links auf **"SQL Editor"** → **"New query"**
6. Kopiere den gesamten Inhalt der Datei `schema.sql` und füge ihn ein
7. Klicke **"Run"** (grüner Button)
8. Du siehst "Success" → Datenbank ist fertig!

**API-Keys holen:**
- Klicke links auf **"Settings"** → **"API"**
- Kopiere **"Project URL"** → das ist dein `SUPABASE_URL`
- Kopiere **"service_role"** Key (nicht den "anon" Key!) → das ist dein `SUPABASE_SERVICE_KEY`

---

### Schritt 3 – OpenRouteService API-Key (optional, für echte Routen)

1. Gehe auf [openrouteservice.org](https://openrouteservice.org) → **"Get API Key"**
2. Kostenlos registrieren
3. Nach der Bestätigung: Dashboard → **"Request a token"** → Name: `fahrgemeinschaft`
4. Den Key kopieren → das ist dein `ORS_API_KEY`

> **Ohne diesen Key:** Die App nutzt automatisch Luftlinie (Haversine) als Fallback.
> Für eine Jugendmannschaft in einer Stadt ist das ausreichend genau.

---

### Schritt 4 – Backend auf Render.com deployen (kostenlos)

1. Gehe auf [render.com](https://render.com) → **"Get Started for Free"**
2. Mit GitHub einloggen → GitHub-Konto verbinden
3. Klicke **"New +"** → **"Web Service"**
4. Wähle dein GitHub-Repository `fahrgemeinschaft`
5. Einstellungen:
   - **Name:** `fahrgemeinschaft`
   - **Region:** Frankfurt (EU Central)
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
6. Klicke auf **"Environment"** → **"Add Environment Variable"** und füge hinzu:

   | Key | Value |
   |-----|-------|
   | `SUPABASE_URL` | deine Supabase Project URL |
   | `SUPABASE_SERVICE_KEY` | dein Supabase service_role Key |
   | `ADMIN_PASSWORD` | ein sicheres Passwort (nur du kennst es) |
   | `ORS_API_KEY` | dein ORS Key (optional) |

7. Klicke **"Create Web Service"**
8. Warte ~3 Minuten → Render zeigt dir eine URL: `https://fahrgemeinschaft.onrender.com`

> **Hinweis:** Der kostenlose Render-Plan "schläft" nach 15 Min. Inaktivität ein.
> Beim ersten Aufruf dauert es ~30 Sekunden bis er aufwacht. Das ist für diese App völlig ok.

---

### Schritt 5 – App einrichten und nutzen

**Admin-Bereich:**
Öffne `https://fahrgemeinschaft.onrender.com/admin.html`
→ Mit deinem `ADMIN_PASSWORD` einloggen

1. **Spieler anlegen:** Name, Adresse, Telefon, Hat Auto → Hinzufügen
   (Die App geocodiert die Adresse automatisch via Nominatim/OpenStreetMap)

2. **Magic-Links verteilen:** Klicke auf den Link-Button bei jedem Spieler → Link wird kopiert
   → Schick jedem Elternteil seinen persönlichen Link per WhatsApp

3. **Vor dem Spiel:** Tab "Spiel" → Zielort + Datum + Aufstellung → Speichern

4. **Am Spieltag:** Tab "Gruppen" → "Gruppen berechnen" → Ergebnis prüfen → "Veröffentlichen"
   → Alle Eltern sehen sofort ihre Gruppe in ihrem Link

**Eltern-Ansicht:**
`https://fahrgemeinschaft.onrender.com/?token=MAGIC-TOKEN`
→ Kein Login nötig, direkt die eigene Rückmeldung eingeben

---

## 📱 So funktioniert's für Eltern

1. Elternteil öffnet seinen persönlichen Link (gespeichert in WhatsApp oder als Lesezeichen)
2. Oben steht die eigene Rückmeldung: **"Noch offen"** → antippen → **"Wir fahren"** oder **"Wir wollen mit"**
3. Anzahl der Plätze auswählen
4. Optional eine Notiz hinterlassen
5. **"Rückmeldung speichern"** drücken
6. Darunter sieht man alle anderen Spieler und deren Status
7. Nach Veröffentlichung: Treffpunkt und Gruppe erscheinen automatisch

---

## 🗺️ Geo-Technologie

| Aufgabe | Service | Kosten |
|---------|---------|--------|
| Adresse → GPS | Nominatim (OpenStreetMap) | Kostenlos, kein Key |
| GPS → Fahrstrecke | OpenRouteService | Kostenlos (2.000/Tag) |
| Karte anzeigen | Leaflet + OSM-Tiles | Kostenlos |
| Fallback ohne ORS | Haversine (Luftlinie) | Immer kostenlos |

---

## 🏗️ Architektur

```
Eltern (Browser)
      │  /?token=UUID
      ▼
public/index.html  ←── statisches Frontend
      │  fetch /api/...
      ▼
server.js (Express)  ←── läuft auf Render.com
      │
      ├── Supabase (PostgreSQL)  ←── Datenbank
      ├── Nominatim API          ←── Geocodierung
      └── OpenRouteService API   ←── Routing
```

---

## ❓ Häufige Fragen

**Kann ich mehrere Spiele gleichzeitig haben?**
Nein – immer nur ein "aktuelles" Spiel (Status: open/calculated/published). Alte Spiele werden archiviert.

**Was passiert wenn Render einschläft?**
Beim ersten Aufruf nach Inaktivität ~30 Sekunden Wartezeit. Danach normal schnell.

**Wie ändere ich die Aufstellung nachträglich?**
Aktuell im Code nicht vorgesehen – einfach ein neues Spiel anlegen.

**Kann ich den Admin-Bereich mit einem eigenen Passwort schützen?**
Ja – das `ADMIN_PASSWORD` in den Render-Umgebungsvariablen ist dein Passwort.
