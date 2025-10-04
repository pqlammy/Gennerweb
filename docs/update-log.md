# Gennerweb Update-Log

## v2.0.1 (2025-10-04)
✨ **Deployment UX** – Das Export-Skript synchronisiert jetzt auch `backend/scripts`, damit der automatische Versionsabgleich auf allen Servern reibungslos läuft.
🛡️ **Update-Sicherheit** – `full-update.sh` prüft vor dem Versionssync auf die Skriptdatei und liefert klare Hinweise statt Fehlermeldungen.
📦 **Release-Durchlauf** – Erfolgreicher Infrastruktur-Rollout mit automatischer v2.0.0-Synchronisation über das Markdown-Log.

## v2.0.0 (2025-10-04)
🧱 Verbesserter Login-Schutz mit konfigurierbaren Account-Lockouts nach wiederholten Fehlversuchen.
🪪 Hardened Security Headers: COOP, DNS Prefetch Control und restriktive CSP via Helmet; schwache JWT-Secrets werden beim Start blockiert.
🔄 Automatischer Versionsabgleich: Update-Log in Markdown wird beim Deployment in die Datenbank übernommen, inklusive Dry-Run-Unterstützung.
⚡ Performance-Optimierung: Admin- und User-Seiten werden via React.lazy nachgeladen; Suche & Filter im Dashboard reagieren dank `useDeferredValue` flüssiger.
📚 Admin Settings Security Panel & Datenschutzerklärung um neue Schutzmassnahmen und Betriebsdetails ergänzt.

## v1.1.0 (2025-10-03)
- Neu: Admin Dashboard bietet einen "Alle Einträge löschen" Button mit Sicherheitsabfrage.
- full-update Skript erkennt Benutzer, Services & deployt Frontend automatisch.
- Versionen & Änderungsprotokoll werden nach jedem Update aus dem Repo synchronisiert.

## v1.0.0 (2024-01-15)
- Erstveröffentlichung der Gennerweb Plattform mit Mitglieder- und Beitragsverwaltung.
