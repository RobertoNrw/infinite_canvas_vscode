# Anleitung für Manitu Upload

## Ordnerstruktur für den Upload
Lade den gesamten Inhalt des Ordners `manitu-deploy` in das Hauptverzeichnis (root) deines Manitu-Webspace:

```
/ (root deines Webspace)
├── index.html          # Hauptdatei
├── example1.canvas     # Beispiel-Datei (optional)
├── test1.canvas        # Test-Datei (optional)
├── js/                 # JavaScript-Module
│   ├── bootstrap.js
│   ├── backend.js
│   ├── editors.js
│   ├── input.js
│   ├── rendering.js
│   ├── state.js
│   └── ui.js
└── styles/             # CSS-Dateien
    ├── base.css
    ├── canvas.css
    └── ui.css
```

## Upload-Methoden

### Option 1: FTP (Empfohlen)
1. Verbinde dich mit deinem Manitu-FTP-Zugang (z.B. mit FileZilla)
2. Navigiere zum Hauptverzeichnis (meist `htdocs` oder `www`)
3. Lade alle Dateien aus diesem Ordner hoch
4. Stelle sicher, dass die Ordnerstruktur erhalten bleibt

### Option 2: Manitu Dateimanager
1. Logge dich ins Manitu-Kundenmenü ein
2. Öffne den Dateimanager
3. Lade die Dateien per Drag & Drop hoch

## Wichtige Hinweise

✅ **Alles ist vorbereitet:**
- Alle Pfade in der `index.html` sind relativ (`styles/base.css`, `js/bootstrap.js`)
- Keine absoluten Pfade oder GitHub-spezifische Abhängigkeiten
- Keine Node.js-Abhängigkeiten im Browser-Code
- localStorage funktioniert im Browser normal

⚠️ **Zu beachten:**
- Die `.canvas`-Dateien sind Beispiele - du kannst sie hochladen oder weglassen
- Die App speichert Daten im localStorage des Browsers
- Für Datei-Import/Export nutzt die App den Browser-Download/Upload

## Test nach dem Upload
1. Öffne deine Domain im Browser (z.B. `https://deine-domain.de/index.html`)
2. Teste folgende Funktionen:
   - Canvas laden und zeichnen
   - Nodes hinzufügen (N, S, C, T Tasten)
   - Speichern (Ctrl+S) - speichert im localStorage
   - Exportieren einer .canvas Datei
   - Importieren einer .canvas Datei

## Troubleshooting

**Weiße Seite?**
- Prüfe die Browser-Konsole (F12) auf Fehler
- Stelle sicher, dass alle JS/CSS-Dateien korrekt geladen werden

**localStorage funktioniert nicht?**
- Manche Browser blockieren localStorage bei lokalen Dateien
- Auf einem Webserver sollte es normal funktionieren

**CORS-Fehler?**
- Sollten keine auftreten, da keine externen APIs genutzt werden
- Die Google Fonts werden über HTTPS geladen (funktioniert überall)

